package com.splix.capture

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class CaptureStoreTest {
    @Test fun repliesPersistPrivatelyAndRejectQueuedStaleAndOtherAccountActions() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val account = UUID.randomUUID().toString()
        val other = UUID.randomUUID().toString()
        val group = UUID.randomUUID().toString()
        CaptureStore(context).use { store ->
            try {
                store.setCurrentAccount(account)
                store.saveConsent(account, setOf("com.phonepe.app"))
                store.activate(account, group, System.currentTimeMillis() + 120_000)
                val active = store.activeCapture()!!
                val candidate = CaptureCandidate("com.phonepe.app", 10000, "Cafe", null, System.currentTimeMillis(), "low")
                val first = store.saveCandidate(active, "reply-test", candidate)!!
                val id = first.id
                assertTrue(first.created)
                assertFalse(store.saveCandidate(active, "reply-test", candidate)!!.created)
                assertTrue(store.replyToDraft(account, id, "Weekend groceries", false))
                assertEquals("Weekend groceries", store.promptDraft(account, id)!!.title)
                assertNull(store.promptDraft(other, id))
                assertFalse(store.replyToDraft(other, id, "Wrong account", false))
                store.saveCandidate(active, "reply-test", candidate.copy(amountPaise=20000))
                assertEquals(10000L, store.promptDraft(account, id)!!.amountPaise)
                assertEquals("Weekend groceries", store.promptDraft(account, id)!!.title)
                assertTrue(store.setDraftState(account, id, "queued"))
                assertFalse(store.replyToDraft(account, id, "Already queued", false))
                val another = store.saveCandidate(active, "another-reply-test", candidate)!!.id
                store.setCurrentAccount(other)
                assertFalse(store.replyToDraft(account, another, "Stale action", false))
                store.readableDatabase.rawQuery("SELECT count(*) FROM client_state WHERE account_id=?", arrayOf(account)).use { cursor ->
                    assertTrue(cursor.moveToFirst())
                    assertEquals(0, cursor.getInt(0)) // Reply did not queue a financial mutation.
                }
            } finally {
                store.deleteAccountDrafts(account)
                store.deleteAccountDrafts(other)
            }
        }
    }

    @Test fun versionTwoUpgradePreservesDraftsAndPendingClientState() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        SQLiteDatabase.create(null).use { db ->
            db.execSQL("CREATE TABLE payment_drafts(id TEXT PRIMARY KEY,state TEXT)")
            db.execSQL("CREATE TABLE client_state(account_id TEXT PRIMARY KEY,state_json TEXT)")
            db.execSQL("INSERT INTO payment_drafts VALUES('existing-draft','queued')")
            db.execSQL("INSERT INTO client_state VALUES('account','pending-client-state')")
            CaptureStore(context).use { it.onUpgrade(db, 2, 3) }
            db.rawQuery("SELECT state,entered_title FROM payment_drafts WHERE id='existing-draft'", null).use { cursor ->
                assertTrue(cursor.moveToFirst()); assertEquals("queued", cursor.getString(0)); assertTrue(cursor.isNull(1))
            }
            db.rawQuery("SELECT state_json FROM client_state WHERE account_id='account'", null).use { cursor ->
                assertTrue(cursor.moveToFirst()); assertEquals("pending-client-state", cursor.getString(0))
            }
        }
    }
    @Test fun accountScopeExpiryAndNotificationUpdateDedupe() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val store = CaptureStore(context)
        val account = UUID.randomUUID().toString()
        val otherAccount = UUID.randomUUID().toString()
        val group = UUID.randomUUID().toString()
        try {
            store.saveConsent(account, setOf("com.phonepe.app"))
            store.activate(account, group, System.currentTimeMillis() + 60_000)
            store.setCurrentAccount(account)
            val active = store.activeCapture()!!
            val first = CaptureCandidate("com.phonepe.app", 10000, "Cafe", "refhash", 10_000, "moderate")
            store.saveCandidate(active, "opaque-source-key", first)
            store.saveCandidate(active, "opaque-source-key", first.copy(amountPaise=12000, observedAtEpochMs=11_000))
            assertEquals(1, store.draftCount(account))

            // A distinct source notification with a plausible match is kept and flagged, not discarded.
            store.saveCandidate(active, "a-different-source-key", first.copy(observedAtEpochMs=12_000))
            assertEquals(2, store.draftCount(account))
            assertTrue(store.hasDuplicateWarning(account))
            assertEquals(0, store.draftCount(otherAccount))

            // Source updates after active-group switching must not reassign older drafts.
            val nextGroup = UUID.randomUUID().toString()
            store.activate(account, nextGroup, System.currentTimeMillis() + 120_000)
            store.saveCandidate(store.activeCapture()!!, "opaque-source-key", first.copy(amountPaise=13000))
            store.readableDatabase.rawQuery("SELECT captured_group_id FROM payment_drafts WHERE account_id=? ORDER BY created_at LIMIT 1", arrayOf(account)).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(group, cursor.getString(0))
            }
            store.readableDatabase.rawQuery("SELECT count(*) FROM client_state", null).use { cursor ->
                assertTrue(cursor.moveToFirst())
            }

            assertNull(store.activeCapture(System.currentTimeMillis() + CaptureStore.MAX_ACTIVE_MS + 1))
            store.activate(account, group, System.currentTimeMillis() + 60_000)
            store.setCurrentAccount(otherAccount)
            assertNull(store.activeCapture())
        } finally {
            store.deleteAccountDrafts(account)
            store.deleteAccountDrafts(otherAccount)
            store.close()
        }
    }
}
