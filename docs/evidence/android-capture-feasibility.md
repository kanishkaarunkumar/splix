# Android capture feasibility and evidence

## Prototype boundary

The Kotlin proof of concept is under `android/capture-prototype`. It is a voluntary, allowlist-first local suggestion prototype; it does not verify a payment, post financial events, or replace manual expense entry. Android requires a declared `NotificationListenerService` protected by `BIND_NOTIFICATION_LISTENER_SERVICE`, and the system grants notification access through user settings. The listener should wait for the system connection event before operations. The platform also documents restrictions on low-RAM Android Q-and-lower devices and work profiles, and callbacks are on the main thread from Android N onward. See the [Android `NotificationListenerService` reference](https://developer.android.com/reference/android/service/notification/NotificationListenerService) and [notification access grant check](https://developer.android.com/reference/android/app/NotificationManager#isNotificationListenerAccessGranted(android.content.ComponentName)).

The prototype dispatches SQLite writes to one worker, discards raw title/body after parsing, disables Android backup, stores source/reference hashes, scopes drafts to the local account ID, and expires active mode within four hours. Candidate package IDs are implementation candidates only; none is claimed as supported until tested. The test harness uses synthetic IDs and does not verify authenticated account/group membership.

## Synthetic parser fixture evidence

`src/test/resources/capture-parser-fixtures.tsv` contains 11 sanitized, authored cases (4 intended outgoing candidates and 7 negative/ambiguous cases). `CaptureParserMetricsTest` computes TP/FP/FN, precision and recall against those labels and requires the fixed fixtures to pass. Expected on the authored set: TP 4, FP 0, FN 0, precision 1.00, recall 1.00. These are synthetic-parser regression metrics only; they are not a measured result from a payment app, notification listener, physical device, or representative distribution.

The Android parser JUnit suite and SQLite instrumentation test have not been run. This workspace has no Android SDK, Gradle, or emulator/device. Do not report the expected fixture values as executed test results.

## Real-device matrix — pending

| Source candidate | App/version | Device/Android | Outgoing | Incoming | Failed/pending | Updates/delay | Background/restart | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `com.phonepe.app` | Not tested | No device available | Pending | Pending | Pending | Pending | Pending | Not supported/unknown |
| `net.one97.paytm` | Not tested | No device available | Pending | Pending | Pending | Pending | Pending | Not supported/unknown |
| `com.google.android.apps.nbu.paisa.user` | Not tested | No device available | Pending | Pending | Pending | Pending | Pending | Not supported/unknown |

No notification screenshots, dumps, or personal content were collected. Do not replace this table with synthetic cases. Record Android/app versions, labelled sample counts, misses, false prompts, duplicate updates, and permission/background limitations using sanitized labels only.

## Go/no-go

**No-go for any product claim or pilot use of notification capture today.** The Kotlin code is an engineering prototype only; parser build/test and all real-device/source measurements are pending. Ship and demonstrate manual expense entry independently. Revisit the gate only after a privacy review and a real-device matrix establish acceptable behavior; consent alone does not establish store approval. Check current distribution requirements again before any release.
