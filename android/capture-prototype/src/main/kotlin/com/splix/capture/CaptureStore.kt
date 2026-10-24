package com.splix.capture

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import java.util.UUID

data class ActiveCapture(val accountId: String, val groupId: String, val expiresAtEpochMs: Long, val allowlistedPackages: Set<String>, val startedAtEpochMs: Long = 0, val alwaysOn: Boolean = false)
data class CapturedDraft(val id: String, val created: Boolean)

/** App-private, account-scoped store. Raw notification text is never passed to this class. */
class CaptureStore(context: Context) : SQLiteOpenHelper(context, "private_capture.db", null, 4) {
    private val appContext = context.applicationContext

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE capture_settings(
            account_id TEXT PRIMARY KEY, consent_at INTEGER NOT NULL, allowlist_json TEXT NOT NULL,
            active_group_id TEXT, active_until INTEGER, paused INTEGER NOT NULL DEFAULT 1,
            reminders_enabled INTEGER NOT NULL DEFAULT 0, capture_started_at INTEGER NOT NULL DEFAULT 0)""")
        db.execSQL("""CREATE TABLE payment_drafts(
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, source_package TEXT NOT NULL,
            source_key_hash TEXT NOT NULL, reference_fingerprint TEXT, amount_paise INTEGER NOT NULL,
            payee_label TEXT, observed_at INTEGER NOT NULL, captured_group_id TEXT NOT NULL,
            confidence TEXT NOT NULL, duplicate_warning INTEGER NOT NULL DEFAULT 0,
            state TEXT NOT NULL DEFAULT 'needs_review', user_edited INTEGER NOT NULL DEFAULT 0,
            committed_event_id TEXT, entered_title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
            UNIQUE(account_id,source_package,source_key_hash))""")
        createClientState(db)
        db.execSQL("CREATE INDEX drafts_inbox_idx ON payment_drafts(account_id,state,observed_at DESC)")
        db.execSQL("CREATE INDEX drafts_reference_idx ON payment_drafts(account_id,reference_fingerprint) WHERE reference_fingerprint IS NOT NULL")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createClientState(db)
        if (oldVersion < 3) db.execSQL("ALTER TABLE payment_drafts ADD COLUMN entered_title TEXT")
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE capture_settings ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE capture_settings ADD COLUMN capture_started_at INTEGER NOT NULL DEFAULT 0")
        }
    }

    private fun createClientState(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS client_state(account_id TEXT PRIMARY KEY,state_json TEXT NOT NULL)")
    }

    fun saveConsent(accountId: String, selectedSources: Set<String>) {
        require(accountId.isNotBlank())
        val sms = SmsNotificationSource.packageName(appContext)
        require(selectedSources.isNotEmpty() && selectedSources.all { it in CANDIDATE_SOURCES || it == sms })
        val values = ContentValues().apply {
            put("account_id", accountId); put("consent_at", System.currentTimeMillis())
            put("allowlist_json", JSONArray(selectedSources.sorted()).toString())
            putNull("active_group_id"); putNull("active_until"); put("paused", 1)
        }
        writableDatabase.insertWithOnConflict("capture_settings", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        PaymentPrompts.cancelAccount(appContext, accountId)
    }

    fun activate(accountId: String, groupId: String, expiresAtEpochMs: Long) {
        val now = System.currentTimeMillis()
        require(groupId.isNotBlank() && expiresAtEpochMs in (now + 60_000)..(now + MAX_ACTIVE_MS))
        val values = ContentValues().apply { put("active_group_id", groupId); put("active_until", expiresAtEpochMs); put("paused", 0); put("reminders_enabled", 0); put("capture_started_at", now) }
        require(writableDatabase.update("capture_settings", values, "account_id=? AND consent_at>0", arrayOf(accountId)) == 1) {
            "Explicit capture consent is required first"
        }
        PaymentPrompts.cancelAccount(appContext, accountId)
    }

    fun startReminders(accountId: String) {
        val values = ContentValues().apply {
            putNull("active_group_id"); putNull("active_until"); put("paused", 0)
            put("reminders_enabled", 1); put("capture_started_at", System.currentTimeMillis())
        }
        check(writableDatabase.update("capture_settings", values, "account_id=? AND consent_at>0", arrayOf(accountId)) == 1) { "Save your notification source consent first" }
        PaymentPrompts.cancelAccount(appContext, accountId)
    }

    fun pause(accountId: String) {
        updateSettings(accountId, ContentValues().apply { put("paused", 1) })
        PaymentPrompts.cancelAccount(appContext, accountId)
    }
    fun stop(accountId: String) {
        updateSettings(accountId, ContentValues().apply {
        putNull("active_group_id"); putNull("active_until"); put("paused", 1)
        put("reminders_enabled", 0)
        })
        PaymentPrompts.cancelAccount(appContext, accountId)
    }

    /** Logout clears the active device slot; this account's drafts remain isolated. */
    fun logout(accountId: String) {
        stop(accountId)
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(CURRENT_ACCOUNT).apply()
    }

    fun setCurrentAccount(accountId: String?) {
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val oldAccount = prefs.getString(CURRENT_ACCOUNT, null)
        if (oldAccount != null && oldAccount != accountId) stop(oldAccount)
        prefs.edit().putString(CURRENT_ACCOUNT, accountId).apply()
    }

    fun activeCapture(now: Long = System.currentTimeMillis()): ActiveCapture? {
        val accountId = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CURRENT_ACCOUNT, null) ?: return null
        readableDatabase.query("capture_settings", arrayOf("account_id", "allowlist_json", "active_group_id", "active_until", "paused", "reminders_enabled", "capture_started_at"),
            "account_id=?", arrayOf(accountId), null, null, null).use { cursor ->
            if (!cursor.moveToFirst()) return null
            val alwaysOn = cursor.getInt(5) == 1
            val group = if (alwaysOn) UNASSIGNED_GROUP else cursor.getString(2) ?: return null
            val expiry = if (alwaysOn) Long.MAX_VALUE else if (cursor.isNull(3)) return null else cursor.getLong(3)
            if (cursor.getInt(4) != 0 || expiry <= now) return null
            val json = JSONArray(cursor.getString(1))
            val packages = (0 until json.length()).map { json.getString(it) }.toSet()
            return ActiveCapture(accountId, group, expiry, packages, cursor.getLong(6), alwaysOn)
        }
    }

    @Synchronized fun saveCandidate(account: ActiveCapture, sourceKey: String, candidate: CaptureCandidate): CapturedDraft? {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val latest = activeCapture() ?: return null
            if (latest.accountId != account.accountId || latest.groupId != account.groupId
                || latest.startedAtEpochMs != account.startedAtEpochMs
                || candidate.sourcePackage !in latest.allowlistedPackages || latest.expiresAtEpochMs <= System.currentTimeMillis()) return null
            val sourceHash = CaptureParser.sha256(account.accountId + "\u0000" + candidate.sourcePackage + "\u0000" + sourceKey.take(512))
            val now = System.currentTimeMillis()
            val prior = db.query("payment_drafts", arrayOf("id", "state", "user_edited"),
                "account_id=? AND source_package=? AND source_key_hash=?",
                arrayOf(account.accountId, candidate.sourcePackage, sourceHash), null, null, null).use { c ->
                if (c.moveToFirst()) Triple(c.getString(0), c.getString(1), c.getInt(2) != 0) else null
            }
            val warning = hasSimilarDraft(account.accountId, account.groupId, candidate, candidate.sourcePackage, sourceHash)
            if (prior != null) {
                if (prior.second == "needs_review" && !prior.third) {
                    db.update("payment_drafts", candidateValues(account, candidate, warning, now).apply { remove("captured_group_id") },
                        "id=? AND state='needs_review' AND user_edited=0", arrayOf(prior.first))
                    db.setTransactionSuccessful()
                    return CapturedDraft(prior.first, false)
                }
                db.setTransactionSuccessful()
                return null
            }
            if (candidate.referenceFingerprint != null) {
                val existing = db.rawQuery("SELECT id FROM payment_drafts WHERE account_id=? AND reference_fingerprint=? AND amount_paise=? LIMIT 1",
                    arrayOf(account.accountId, candidate.referenceFingerprint, candidate.amountPaise.toString())).use { if (it.moveToFirst()) it.getString(0) else null }
                if (existing != null) {
                    db.setTransactionSuccessful()
                    return CapturedDraft(existing, false)
                }
            }
            val draftId = UUID.randomUUID().toString()
            val values = candidateValues(account, candidate, warning, now).apply {
                put("id", draftId); put("account_id", account.accountId)
                put("source_package", candidate.sourcePackage); put("source_key_hash", sourceHash)
                put("captured_group_id", account.groupId); put("state", "needs_review"); put("user_edited", 0)
                put("created_at", now)
            }
            db.insertOrThrow("payment_drafts", null, values)
            db.setTransactionSuccessful()
            return CapturedDraft(draftId, true)
        } finally {
            db.endTransaction()
        }
    }

    fun promptDraft(accountId: String, draftId: String): PromptDraft? {
        val active = activeCapture() ?: return null
        if (active.accountId != accountId) return null
        return readableDatabase.rawQuery("SELECT captured_group_id,amount_paise,entered_title FROM payment_drafts WHERE account_id=? AND id=? AND state='needs_review'", arrayOf(accountId, draftId)).use { cursor ->
            if (!cursor.moveToFirst() || cursor.getString(0) != active.groupId) null
            else PromptDraft(draftId, accountId, cursor.getString(0), cursor.getLong(1), cursor.getString(2), active.expiresAtEpochMs)
        }
    }

    /** Only the current account's still-private draft can receive a notification reply. */
    @Synchronized fun replyToDraft(accountId: String, draftId: String, title: String?, personal: Boolean): Boolean {
        if (!personal && PaymentPromptInput.title(title) == null) return false
        val db = writableDatabase
        db.beginTransaction()
        try {
            if (promptDraft(accountId, draftId) == null) return false
            val changed = db.update("payment_drafts", ContentValues().apply {
                if (personal) put("state", "personal") else put("entered_title", PaymentPromptInput.title(title))
                put("user_edited", 1); put("updated_at", System.currentTimeMillis())
            }, "account_id=? AND id=? AND state='needs_review'", arrayOf(accountId, draftId)) == 1
            db.setTransactionSuccessful()
            return changed
        } finally { db.endTransaction() }
    }

    fun deleteAccountDrafts(accountId: String) {
        PaymentPrompts.cancelAccount(appContext, accountId)
        if (appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CURRENT_ACCOUNT, null) == accountId) {
            setCurrentAccount(null)
        }
        appContext.getSharedPreferences("capture_diagnostics", Context.MODE_PRIVATE).edit()
            .remove("$accountId:last_sms_at").remove("$accountId:last_sms_result").apply()
        writableDatabase.delete("client_state", "account_id=?", arrayOf(accountId))
        writableDatabase.delete("payment_drafts", "account_id=?", arrayOf(accountId))
        writableDatabase.delete("capture_settings", "account_id=?", arrayOf(accountId))
    }

    fun draftCount(accountId: String): Int = readableDatabase.rawQuery(
        "SELECT count(*) FROM payment_drafts WHERE account_id=?", arrayOf(accountId),
    ).use { cursor -> if (cursor.moveToFirst()) cursor.getInt(0) else 0 }

    /** Local troubleshooting metadata only; never store sender, body, amounts or references. */
    fun recordSmsCheck(accountId: String, result: String) {
        require(result in setOf("outside_session", "sender_format", "not_recognized", "recognized", "not_stored"))
        if (appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CURRENT_ACCOUNT, null) != accountId) return
        appContext.getSharedPreferences("capture_diagnostics", Context.MODE_PRIVATE).edit()
            .putLong("$accountId:last_sms_at", System.currentTimeMillis())
            .putString("$accountId:last_sms_result", result).apply()
    }

    fun smsDiagnostics(accountId: String): Pair<Long, String?> {
        val prefs = appContext.getSharedPreferences("capture_diagnostics", Context.MODE_PRIVATE)
        return prefs.getLong("$accountId:last_sms_at", 0) to prefs.getString("$accountId:last_sms_result", null)
    }

    fun hasDuplicateWarning(accountId: String): Boolean = readableDatabase.query(
        "payment_drafts", arrayOf("id"), "account_id=? AND duplicate_warning=1", arrayOf(accountId), null, null, null,
    ).use { it.moveToFirst() }

    fun setDraftState(accountId: String, draftId: String, state: String): Boolean {
        require(state in setOf("needs_review", "personal", "dismissed", "queued", "posted", "needs_attention"))
        return writableDatabase.update("payment_drafts", ContentValues().apply {
            put("state", state); put("updated_at", System.currentTimeMillis())
        }, "account_id=? AND id=?", arrayOf(accountId, draftId)) == 1
    }

    private fun candidateValues(account: ActiveCapture, c: CaptureCandidate, warning: Boolean, now: Long) = ContentValues().apply {
        put("reference_fingerprint", c.referenceFingerprint); put("amount_paise", c.amountPaise)
        put("payee_label", c.payeeLabel); put("observed_at", c.observedAtEpochMs)
        put("captured_group_id", account.groupId); put("confidence", c.confidence)
        put("duplicate_warning", if (warning) 1 else 0); put("updated_at", now)
    }

    private fun hasSimilarDraft(accountId: String, groupId: String, c: CaptureCandidate, sourcePackage: String, sourceHash: String): Boolean {
        val where: String
        val args: Array<String>
        if (c.referenceFingerprint != null) {
            where = "account_id=? AND reference_fingerprint=? AND NOT(source_package=? AND source_key_hash=?) AND state NOT IN ('dismissed','personal')"
            args = arrayOf(accountId, c.referenceFingerprint, sourcePackage, sourceHash)
        } else {
            where = "account_id=? AND captured_group_id=? AND amount_paise=? AND observed_at BETWEEN ? AND ? AND NOT(source_package=? AND source_key_hash=?) AND state NOT IN ('dismissed','personal')"
            args = arrayOf(accountId, groupId, c.amountPaise.toString(),
                (c.observedAtEpochMs - 120_000).toString(), (c.observedAtEpochMs + 120_000).toString(), sourcePackage, sourceHash)
        }
        return readableDatabase.query("payment_drafts", arrayOf("id"), where, args, null, null, null).use { it.moveToFirst() }
    }

    private fun updateSettings(accountId: String, values: ContentValues) {
        writableDatabase.update("capture_settings", values, "account_id=?", arrayOf(accountId))
    }

    companion object {
        const val MAX_ACTIVE_MS = 4 * 60 * 60 * 1000L
        const val PREFS = "capture_account_slot"
        const val CURRENT_ACCOUNT = "account_id"
        const val UNASSIGNED_GROUP = "__choose_group__"
        // Candidate package ids only. They are not claimed as supported until real-device tests pass.
        val CANDIDATE_SOURCES = setOf("com.phonepe.app", "net.one97.paytm", "com.google.android.apps.nbu.paisa.user")
    }
}
