# Android capture feasibility prototype

This standalone Android app is a source-level prototype, not production capture and not part of a React Native app yet. It contains a user-facing disclosure/consent gate, Android notification listener boundary, source allowlist, transient parser, bounded active group setting, app-private SQLite draft inbox, source-update merge, and parser/store tests.

## Build and test

Open this folder in Android Studio with a JDK 17+ and Android SDK 36 installed. The project pins AGP 9.4.0, Kotlin Gradle Plugin 2.4.10, and targets API 36. Run `testDebugUnitTest` for the synthetic parser precision/recall and parser cases. Run `connectedDebugAndroidTest` on a disposable Android test device for the local store and account-isolation case. The current coding workspace has only a Java 8 shim and no Android SDK, Gradle, emulator, or attached device; neither task has been run here.

## Manual prototype setup

1. Install the debug APK on a test device. The launcher screen explains the broad notification permission and requires a selected source plus affirmative consent before it opens Android's notification-access settings.
2. Enable notification access only for this prototype and return to the app.
3. Enter synthetic account/group UUIDs and start a 30-minute active session. This test screen does not authenticate the account or verify group membership; the production app must do both before activation and the server must recheck membership on every financial write.
4. Generate or use only sanitized test notifications. The private draft rows can be inspected in app-private `private_capture.db`; raw title/body text is not stored. Stop capture in the app or revoke notification access in Android Settings.

The package IDs in `CaptureStore.CANDIDATE_SOURCES` are candidates for lab selection, not verified supported sources. Do not publish compatibility claims until each source/device/version is evaluated. No prototype draft posts an expense; the client review/confirmation flow remains Person 3's integration.

## Current limits

There is no draft review UI, API bridge, app-authenticated account, live group-membership verification, generic local prompt, rotation/reboot workflow, source-specific parser profile, retention settings screen, or release policy review. The single-thread queue rechecks account/group/expiry before SQLite writes. Synthetic fixtures are intentionally clean and do not establish real-world precision/recall.
