package com.splix.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Receives OS notifications; only allowlisted sources are read and raw text is discarded after parse. */
class PaymentNotificationListener : NotificationListenerService() {
    companion object {
        @Volatile var connected = false
            private set
    }
    private lateinit var store: CaptureStore
    private lateinit var executor: ExecutorService

    override fun onCreate() {
        super.onCreate()
        store = CaptureStore(applicationContext)
        executor = Executors.newSingleThreadExecutor()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName || (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
        val active = store.activeCapture() ?: return
        if (!CaptureControl.isAccessGranted(this)) { store.pause(active.accountId); return }
        if (sbn.packageName !in active.allowlistedPackages) return
        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
        val sms = sbn.packageName == SmsNotificationSource.packageName(this)
        val candidate: CaptureCandidate
        val sourceKey: String
        if (sms) {
            // MessagingStyle can include an old conversation. Inspect only the newest item.
            @Suppress("DEPRECATION")
            val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
                ?.let { Notification.MessagingStyle.Message.getMessagesFromBundleArray(it) }
            val newest = messages?.maxByOrNull { it.timestamp }
            val sender = newest?.sender?.toString() ?: title
            val text = newest?.text?.toString() ?: body
            val observed = newest?.timestamp ?: sbn.postTime
            if (observed < active.startedAtEpochMs || observed > System.currentTimeMillis() + 60_000) {
                store.recordSmsCheck(active.accountId, "outside_session")
                return
            }
            if (!BankSmsParser.supportsSender(sender)) {
                store.recordSmsCheck(active.accountId, "sender_format")
                return
            }
            val parsed = BankSmsParser.parse(sbn.packageName, active.allowlistedPackages, sender, text, observed)
            if (parsed == null) {
                store.recordSmsCheck(active.accountId, "not_recognized")
                return
            }
            candidate = parsed
            // A Messages conversation reuses its notification key for different payments.
            sourceKey = "sms:" + CaptureParser.sha256(sbn.key) + ":" + CaptureParser.sha256("$sender\u0000$text\u0000$observed")
        } else {
            if (sbn.packageName !in CaptureStore.CANDIDATE_SOURCES) return
            candidate = CaptureParser.parse(sbn.packageName, active.allowlistedPackages, title, body, sbn.postTime) ?: return
            sourceKey = candidate.referenceFingerprint?.let { "upi:" + CaptureParser.sha256(sbn.key) + ":" + it } ?: sbn.key
        }
        executor.execute {
            val draft = store.saveCandidate(active, sourceKey, candidate)
            if (sms) store.recordSmsCheck(active.accountId, if (draft != null) "recognized" else "not_stored")
            if (draft != null) PaymentPrompts.show(applicationContext, active.accountId, draft.id, onlyExisting = !draft.created)
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        connected = true
    }

    override fun onListenerDisconnected() {
        connected = false
        store.activeCapture()?.let { store.pause(it.accountId) }
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        connected = false
        if (::executor.isInitialized) executor.shutdownNow()
        if (::store.isInitialized) store.close()
        super.onDestroy()
    }
}
