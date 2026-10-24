package com.splix.capture

import android.app.Activity
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.notification.NotificationListenerService

/** Call requestAccess only from the visible disclosure and affirmative consent control. */
object CaptureControl {
    fun requestAccess(activity: Activity, store: CaptureStore, accountId: String, sources: Set<String>) {
        store.saveConsent(accountId, sources)
        if (!isAccessGranted(activity)) {
            activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }

    fun isAccessGranted(context: Context): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return false
        return manager.isNotificationListenerAccessGranted(ComponentName(context, PaymentNotificationListener::class.java))
    }

    fun activate(context: Context, accountId: String, groupId: String, durationMs: Long) {
        require(isAccessGranted(context)) { "Enable notification access in Android settings first" }
        reconnect(context)
        require(durationMs in 60_000..CaptureStore.MAX_ACTIVE_MS)
        CaptureStore(context).use { it.activate(accountId, groupId, System.currentTimeMillis() + durationMs) }
    }

    fun reconnect(context: Context) {
        check(isAccessGranted(context)) { "Enable notification access in Android settings first" }
        if (!PaymentNotificationListener.connected)
            NotificationListenerService.requestRebind(ComponentName(context, PaymentNotificationListener::class.java))
    }
}
