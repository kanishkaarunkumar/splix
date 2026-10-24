package com.splix.capture

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteException
import android.net.Uri
import android.os.Build
import java.util.Locale

data class PromptDraft(val id: String, val accountId: String, val groupId: String,
    val amountPaise: Long, val title: String?, val expiresAt: Long)

/** Only local, account-bound draft actions. No HTTP client or financial posting path. */
object PaymentPrompts {
    const val CHANNEL = "private_payment_details"
    const val INPUT_TITLE = "payment_title"
    const val REPLY = "com.splix.capture.REPLY"
    const val PERSONAL = "com.splix.capture.PERSONAL"
    private const val ID = 1
    private val notificationLock = Any()

    fun prepare(context: Context) {
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
            NotificationChannel(CHANNEL, "Private payment suggestions", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Add payment details privately, then review the group split in Splix"
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            })
    }

    fun enabled(context: Context): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return false
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
    }

    private fun tag(account: String, draft: String) = "splix-payment:$account:$draft"

    fun cancel(context: Context, account: String, draft: String) = synchronized(notificationLock) {
        context.getSystemService(NotificationManager::class.java)?.cancel(tag(account, draft), ID)
    }

    fun cancelAccount(context: Context, account: String) = synchronized(notificationLock) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return@synchronized
        manager.activeNotifications.filter { it.tag?.startsWith("splix-payment:$account:") == true }
            .forEach { manager.cancel(it.tag, it.id) }
    }

    private fun action(context: Context, account: String, draft: String, action: String, mutable: Boolean): PendingIntent {
        val data = Uri.Builder().scheme("splix-private").authority("payment-action")
            .appendPath(account).appendPath(draft).appendPath(action).build()
        val intent = Intent(context, PaymentPromptReceiver::class.java).setAction(action).setData(data)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (mutable && Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE
            else if (!mutable) PendingIntent.FLAG_IMMUTABLE else 0
        return PendingIntent.getBroadcast(context, 0, intent, flags)
    }

    fun show(context: Context, account: String, draftId: String, saved: Boolean = false, invalidReply: Boolean = false, onlyExisting: Boolean = false) = synchronized(notificationLock) {
        prepare(context)
        if (!enabled(context) || !CaptureControl.isAccessGranted(context)) return@synchronized
        val manager = context.getSystemService(NotificationManager::class.java) ?: return@synchronized
        if (onlyExisting && manager.activeNotifications.none { it.tag == tag(account, draftId) }) return@synchronized
        val draft = CaptureStore(context).use { it.promptDraft(account, draftId) } ?: return@synchronized
        val hasDetails = saved || draft.title != null
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return@synchronized
        launch.action = Intent.ACTION_VIEW
        launch.data = Uri.Builder().scheme("splix").authority("review").appendPath(draftId).build()
        val review = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val amount = String.format(Locale.ROOT, "₹%d.%02d", draft.amountPaise / 100, draft.amountPaise % 100)
        val text = when {
            invalidReply -> "Use 1–120 characters. Your payment is still a private draft."
            hasDetails -> "Details saved privately. Review and confirm the group split in Splix."
            else -> "What was this payment for? Name it, split it or mark it personal."
        }
        val reply = Notification.Action.Builder(android.R.drawable.ic_menu_edit, "Add details",
            action(context, account, draftId, REPLY, true))
            .addRemoteInput(RemoteInput.Builder(INPUT_TITLE).setLabel("What was it for?").build())
            .setAllowGeneratedReplies(false)
        if (Build.VERSION.SDK_INT >= 31) reply.setAuthenticationRequired(true)
        val publicVersion = Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_edit)
            .setContentTitle("Splix payment suggestion").setContentText("Unlock to review your private draft.").build()
        val builder = Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_edit)
            .setContentTitle(if (hasDetails) "Details saved · $amount" else "$amount payment detected")
            .setContentText(text).setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(review).setAutoCancel(true).setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setTimeoutAfter((draft.expiresAt - System.currentTimeMillis()).coerceIn(1, 24 * 60 * 60 * 1000L))
            .addAction(reply.build())
            .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_view, "Split / choose group", review).build())
            .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Personal",
                action(context, account, draftId, PERSONAL, false)).build())
        if (hasDetails && draft.title != null) builder.setRemoteInputHistory(arrayOf(draft.title))
        try {
            manager.notify(tag(account, draftId), ID, builder.build())
        } catch (_: SecurityException) {
            // Permission can be revoked between the check and notify. The inbox draft remains.
        }
    }
}

class PaymentPromptReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val uri = intent.data ?: return
        if (uri.scheme != "splix-private" || uri.authority != "payment-action" || uri.pathSegments.size != 3) return
        val account = uri.pathSegments[0]
        val draft = uri.pathSegments[1]
        if (intent.action !in setOf(PaymentPrompts.REPLY, PaymentPrompts.PERSONAL) || uri.pathSegments[2] != intent.action) return
        val title = PaymentPromptInput.title(RemoteInput.getResultsFromIntent(intent)?.getCharSequence(PaymentPrompts.INPUT_TITLE))
        val pending = goAsync()
        Thread {
            try {
                if (!CaptureControl.isAccessGranted(context)) {
                    PaymentPrompts.cancel(context, account, draft)
                    return@Thread
                }
                val changed = CaptureStore(context).use { store ->
                    if (intent.action == PaymentPrompts.PERSONAL) store.replyToDraft(account, draft, null, true)
                    else if (title != null) store.replyToDraft(account, draft, title, false)
                    else false
                }
                if (intent.action == PaymentPrompts.PERSONAL || (!changed && title != null)) {
                    PaymentPrompts.cancel(context, account, draft)
                } else {
                    PaymentPrompts.show(context, account, draft, saved = changed, invalidReply = title == null)
                }
            } catch (_: SQLiteException) {
                // A failed local write must not post or lose a financial operation.
                PaymentPrompts.cancel(context, account, draft)
            } finally {
                pending.finish()
            }
        }.start()
    }
}
