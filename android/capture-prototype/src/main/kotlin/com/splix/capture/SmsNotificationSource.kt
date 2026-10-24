package com.splix.capture

import android.content.Context
import android.provider.Telephony

/** Queries only the user's default SMS handler; never queries the SMS inbox. */
object SmsNotificationSource {
    fun packageName(context: Context): String? = Telephony.Sms.getDefaultSmsPackage(context)?.takeIf { it != context.packageName }
    fun label(context: Context, source: String): String = try {
        context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(source, 0)).toString()
    } catch (_: android.content.pm.PackageManager.NameNotFoundException) { "Messages" }
}
