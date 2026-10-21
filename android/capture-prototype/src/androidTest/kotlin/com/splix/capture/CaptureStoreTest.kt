package com.splix.capture

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import android.content.Context
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class CaptureStoreTest {
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
