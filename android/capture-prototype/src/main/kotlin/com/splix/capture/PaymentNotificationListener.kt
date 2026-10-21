package com.splix.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Receives OS notifications; only allowlisted sources are read and raw text is discarded after parse. */
class PaymentNotificationListener : NotificationListenerService() {
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
        val candidate = CaptureParser.parse(sbn.packageName, active.allowlistedPackages, title, body, sbn.postTime) ?: return
        val sourceKey = sbn.key
        executor.execute { store.saveCandidate(active, sourceKey, candidate) }
    }

    override fun onListenerDisconnected() {
        store.activeCapture()?.let { store.pause(it.accountId) }
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        if (::executor.isInitialized) executor.shutdownNow()
        if (::store.isInitialized) store.close()
        super.onDestroy()
    }
}
