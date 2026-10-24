package com.splix.bridge

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.splix.capture.CaptureControl
import com.splix.capture.CaptureStore
import com.splix.capture.PaymentPrompts
import com.splix.capture.PaymentNotificationListener
import com.splix.capture.SmsNotificationSource
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import org.json.JSONArray

/** One SQLite owner for listener drafts, client snapshots and confirmed mutations. No credentials. */
class SplixCaptureModule : Module() {
    private val context: Context get() = requireNotNull(appContext.reactContext)
    private fun current(account: String) {
        check(context.getSharedPreferences(CaptureStore.PREFS, Context.MODE_PRIVATE)
            .getString(CaptureStore.CURRENT_ACCOUNT, null) == account) { "Account changed; sign in again" }
    }
    private fun <T> store(account: String, work: (CaptureStore) -> T): T {
        current(account)
        return CaptureStore(context).use(work)
    }
    override fun definition() = ModuleDefinition {
        Name("SplixCapture")
        Function("setAccount") { account: String? -> CaptureStore(context).use { it.setCurrentAccount(account) } }
        Function("status") { account: String -> store(account) { db ->
            PaymentPrompts.prepare(context)
            val granted = CaptureControl.isAccessGranted(context)
            if (!granted) db.pause(account)
            val active = db.activeCapture()
            val sms = SmsNotificationSource.packageName(context)
            val diagnostics = db.smsDiagnostics(account)
            val sources = db.readableDatabase.rawQuery("SELECT allowlist_json FROM capture_settings WHERE account_id=? AND consent_at>0", arrayOf(account)).use { cursor ->
                if (cursor.moveToFirst()) {
                    val json = JSONArray(cursor.getString(0))
                    (0 until json.length()).map { json.getString(it) }
                } else emptyList<String>()
            }
            mapOf("available" to true, "granted" to granted, "listenerConnected" to PaymentNotificationListener.connected, "promptsEnabled" to PaymentPrompts.enabled(context), "consent" to sources.isNotEmpty(), "sources" to sources,
                "smsPackage" to sms, "smsAppName" to sms?.let { SmsNotificationSource.label(context, it) },
                "smsLastObservedAt" to diagnostics.first.takeIf { it > 0 }, "smsLastResult" to diagnostics.second,
                "remindersEnabled" to (active?.alwaysOn == true), "groupId" to active?.groupId?.takeIf { it != CaptureStore.UNASSIGNED_GROUP },
                "expiresAt" to active?.expiresAtEpochMs?.takeIf { active.alwaysOn == false }, "paused" to (active == null))
        } }
        Function("openPromptSettings") { account: String ->
            current(account)
            context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        Function("consent") { account: String, sources: List<String> -> store(account) { db ->
            val activity = requireNotNull(appContext.currentActivity) { "Open the app to grant access" }
            CaptureControl.requestAccess(activity, db, account, sources.toSet())
        } }
        Function("openSmsNotificationSettings") { account: String ->
            current(account)
            val sms = requireNotNull(SmsNotificationSource.packageName(context)) { "No default SMS app found on this phone" }
            context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, sms).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        Function("startReminders") { account: String -> store(account) { db ->
            check(CaptureControl.isAccessGranted(context)) { "Enable notification access in Android settings first" }
            check(PaymentPrompts.enabled(context)) { "Allow Splix payment prompts before enabling reminders" }
            CaptureControl.reconnect(context)
            db.startReminders(account)
        } }
        Function("reconnectListener") { account: String -> current(account); CaptureControl.reconnect(context) }
        Function("activate") { account: String, group: String, duration: Long ->
            current(account); CaptureControl.activate(context, account, group, duration)
        }
        Function("pause") { account: String -> store(account) { it.pause(account) } }
        Function("stop") { account: String -> store(account) { it.stop(account) } }
        Function("drafts") { account: String -> store(account) { db ->
            val result = mutableListOf<Map<String, Any?>>()
            db.readableDatabase.rawQuery("SELECT id,captured_group_id,amount_paise,payee_label,observed_at,duplicate_warning,state,committed_event_id,entered_title FROM payment_drafts WHERE account_id=? ORDER BY observed_at DESC LIMIT 200", arrayOf(account)).use { cursor ->
                while (cursor.moveToNext()) result.add(mapOf("id" to cursor.getString(0), "accountId" to account,
                    "groupId" to cursor.getString(1), "amountPaise" to cursor.getLong(2).toString(),
                    "payeeLabel" to (cursor.getString(3) ?: "Payment"), "observedAt" to cursor.getLong(4),
                    "duplicateWarning" to (cursor.getInt(5) != 0), "state" to cursor.getString(6),
                    "committedEventId" to cursor.getString(7), "enteredTitle" to cursor.getString(8)))
            }; result
        } }
        Function("disposition") { account: String, id: String, state: String -> store(account) { db ->
            require(state in setOf("personal", "dismissed", "needs_review"))
            val changed = db.writableDatabase.update("payment_drafts", ContentValues().apply {
                put("state", state); put("user_edited", 1); put("updated_at", System.currentTimeMillis())
            }, "account_id=? AND id=? AND state IN ('needs_review','personal','dismissed','needs_attention')", arrayOf(account, id))
            check(changed == 1) { "Suggestion was already confirmed or is unavailable" }
            PaymentPrompts.cancel(context, account, id)
        } }
        Function("readState") { account: String -> store(account) { db ->
            db.readableDatabase.rawQuery("SELECT state_json FROM client_state WHERE account_id=?", arrayOf(account)).use { if (it.moveToFirst()) it.getString(0) else null }
        } }
        Function("writeState") { account: String, json: String -> store(account) { db ->
            val state = JSONObject(json); val queue = state.getJSONArray("queue"); val sql = db.writableDatabase
            sql.beginTransaction()
            try {
                val oldState = sql.rawQuery("SELECT state_json FROM client_state WHERE account_id=?", arrayOf(account)).use { if (it.moveToFirst()) JSONObject(it.getString(0)) else null }
                val oldQueue = oldState?.optJSONArray("queue") ?: JSONArray()
                val nextIds = (0 until queue.length()).map { queue.getJSONObject(it).getString("id") }.toSet()
                for (index in 0 until oldQueue.length()) {
                    val prior = oldQueue.getJSONObject(index)
                    if (prior.getString("id") !in nextIds && prior.getString("state") == "needs_attention" && prior.optString("draftId").isNotEmpty()) {
                        sql.update("payment_drafts", ContentValues().apply { put("state", "needs_review") }, "account_id=? AND id=? AND state='needs_attention'", arrayOf(account, prior.getString("draftId")))
                    }
                }
                for (index in 0 until queue.length()) {
                    val row = queue.getJSONObject(index)
                    require(row.getString("accountId") == account)
                    if (row.optString("draftId").isNotEmpty()) {
                        val values = ContentValues().apply {
                            put("state", when (row.getString("state")) { "posted" -> "posted"; "needs_attention" -> "needs_attention"; else -> "queued" })
                            if (row.has("eventId")) put("committed_event_id", row.getString("eventId"))
                            put("updated_at", System.currentTimeMillis())
                        }
                        sql.update("payment_drafts", values, "account_id=? AND id=?", arrayOf(account, row.getString("draftId")))
                    }
                }
                sql.insertWithOnConflict("client_state", null, ContentValues().apply { put("account_id", account); put("state_json", json) }, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
                sql.setTransactionSuccessful()
            } finally { sql.endTransaction() }
        } }
        Function("enqueue") { account: String, json: String -> store(account) { db ->
            val row = JSONObject(json); require(row.getString("accountId") == account)
            val sql = db.writableDatabase; sql.beginTransaction()
            try {
                val state = sql.rawQuery("SELECT state_json FROM client_state WHERE account_id=?", arrayOf(account)).use { if (it.moveToFirst()) JSONObject(it.getString(0)) else JSONObject("{\"queue\":[],\"snapshots\":{},\"forms\":{}}") }
                val queue = state.getJSONArray("queue")
                for (i in 0 until queue.length()) {
                    check(queue.getJSONObject(i).getString("id") != row.getString("id")) { "Request already queued" }
                    if (row.optString("draftId").isNotEmpty()) check(queue.getJSONObject(i).optString("draftId") != row.getString("draftId")) { "Suggestion already confirmed" }
                }
                if (row.optString("draftId").isNotEmpty()) {
                    val changed = sql.update("payment_drafts", ContentValues().apply { put("state", "queued"); put("user_edited", 1) },
                        "account_id=? AND id=? AND state='needs_review'", arrayOf(account, row.getString("draftId")))
                    check(changed == 1) { "Suggestion already confirmed or unavailable" }
                }
                queue.put(row)
                sql.insertWithOnConflict("client_state", null, ContentValues().apply { put("account_id", account); put("state_json", state.toString()) }, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
                sql.setTransactionSuccessful()
            } finally { sql.endTransaction() }
            if (row.optString("draftId").isNotEmpty()) PaymentPrompts.cancel(context, account, row.getString("draftId"))
        } }
        Function("deleteLocal") { account: String -> store(account) { db ->
            db.writableDatabase.delete("client_state", "account_id=?", arrayOf(account))
            db.deleteAccountDrafts(account)
        } }
    }
}
