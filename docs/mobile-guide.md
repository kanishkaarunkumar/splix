# Using Splix on Android

## Build an independent test APK

The repository includes a `render.yaml` Blueprint selecting Render's **free** web-service plan explicitly. Configure Neon PostgreSQL first using [the deployment guide](neon-deployment.md), then deploy the API. The database-backed API persists server data across API sleep and restarts. The memory adapter is available only for local reference development.

After deployment, check `https://YOUR-SERVICE.onrender.com/health`. Build with Java 17 and an installed Android SDK:

```bash
EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com bash scripts/build-test-apk.sh
```

The resulting `.dist/apk/splix-test.apk` connects over the internet and needs no laptop connection. The actual service URL must be supplied; the build script does not default to a laptop address. Free-service cold starts can exceed the client's request timeout: open the health URL to wake the test API, then retry sign-in. Hosting account access and a verified endpoint are required before generating this APK.

## Optional USB test APK

The test APK targets ARM64 phones running Android 8.1 or newer. It includes the JavaScript bundle and native notification listener, so Expo Go and Metro are unnecessary. It uses the debug signing key for installation testing, not store distribution.

This build connects to the development API on your computer over USB. Enable Android Developer options and USB debugging, connect the phone, approve its debugging prompt, and run from the repository root:

```bash
adb install -r .dist/apk/splix-test.apk
adb reverse tcp:8000 tcp:8000
```

Keep the API running on port 8000. Reapply `adb reverse` after reconnecting/rebooting the phone. The test build permits HTTP only for local development hosts; normal builds retain HTTPS requirements. PostgreSQL-backed API data survives server restart; the optional memory reference adapter does not.

To reproduce this optional local build with Java 17 and an installed Android SDK, set `JAVA_HOME` and `ANDROID_HOME`, then run `SPLIX_LOCAL_ANDROID_TEST=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 bash scripts/build-test-apk.sh`. It writes `.dist/apk/splix-test.apk`. The script generates a release bundle signed with the generated debug key and runs the capture module's unit tests. Real-phone capture still requires testing: sign in, create a group, open Active mode, grant access and activate that group, then check Inbox after a supported payment notification arrives.

## Home dock and overview

The fixed home dock has Groups, Overview, Inbox and You tabs. Groups shows confirmed totals to pay / receive and an individual balance on each group card. Overview combines suggested counterparties across groups, lists the contributing groups, and lets you open each group to settle there. Owed and receivable amounts remain separate; a payment in one group never silently settles another. The person plan is calculated from the same net balances used by server settlement suggestions.

Home loads balances for every current group, with at most four balance requests in flight. Cached offline figures show their update time and missing-group coverage. Private drafts and pending writes stay out of the totals. Refresh groups / Refresh overview fetches current balances. The orange background, teal primary buttons, rounded cards and pointer-hover feedback are shared across the app; reduced motion disables card lift.

## A manual split

Create an account, create a group, and open People & invites. The owner shares an expiring join code. Other accounts request to join; the owner approves them. Groups support up to 50 members.

Open a group and add an expense. Enter the amount in rupees, payer, date, category, optional note and participants. Choose equal, percentage, exact or weighted splitting. The preview uses deterministic integer-paise allocation; the server validates the final request independently. A payer may be excluded from participants. The owner can save and apply named split presets.

Review the split, then confirm. A durable UUID-keyed request is saved before sending. Pending writes are labelled and excluded from confirmed balances. A saved manual draft is private and is not queued until confirmed. Open Private inbox to resume or discard saved manual drafts.

## Offline and corrections

Confirmed requests survive local process restart on Android. On reconnect or app foreground, the queue retries the same payload with the same key. A lost server response therefore replays the existing result when the server's replay store is available. The PostgreSQL API saves the request result atomically with the financial event and preserves it across API restarts. The memory reference adapter cannot preserve replay results across restarts.

A validation/authorization conflict is shown as Needs attention. Inspect group history and the error before retrying the exact request. Discarding a definitely rejected request returns its capture suggestion to review. Network failures and unknown outcomes stay pending and retain their key. Signing out stops capture and isolates that account's local data; another account cannot read or send it.

To correct an expense, open its history entry, enter the replacement and a reason, review, then confirm. The original remains with a linked reversal and replacement. Balances and monthly reports reflect the correction, including corrections that move activity across months.

## Group invites and responsive group pages (APK 1.0.4)

New group join codes contain four uppercase letters/digits, excluding ambiguous I/O/0/1. Entry accepts lowercase and surrounding whitespace. Previously shared 16/32-character hexadecimal codes remain valid until revoked or expired. Codes still expire after 24 hours by default and require owner approval. Both API adapters retry collisions; PostgreSQL uniqueness and nested savepoints prevent a concurrent collision from aborting the full transaction. Existing codes are not reassigned to another group.

Group balances and action rows stack when width relative to font scaling is limited. The visible Explain balance label stays short while its accessible name identifies the person. Buttons wrap labels, names and long titles wrap, and very long page titles use a smaller heading. Browser checks cover 320, 360, 390, 430, 768 and 844-pixel widths, portrait/landscape, long names and large balances; one narrow-phone scenario enlarges text by 1.6x. These are browser layout checks, not a claim of physical testing on every Android phone.

## Private payment suggestions

### Simplified setup and SMS troubleshooting (APK 1.0.5)

Open **Payment reminders** from Home. The default view has three steps: allow Splix prompts, choose alert sources and save consent/access, then enable reminders. Bank SMS notifications have their own checkbox and a button for the current Messages app's notification settings. New source selections must be saved before either normal reminders or timed mode can start. Completed source choices are marked saved; saving changes pauses reminders. A visible reconnect action appears if Android has disconnected the listener. Advanced group timing, privacy explanations and detailed diagnostics are expandable.

New notification actions are **Name expense**, **Split** and **Personal**. Troubleshooting reports whether an approved Messages alert reached the listener, was outside the session, had an unsupported sender, was not recognised, or produced a suggestion. Only the last check time and fixed outcome code are stored privately. They are account-scoped, removed with local data, and never uploaded with raw SMS content.

Fixed a real reported format: a bank message can say the user's account was debited and the recipient's account was credited. The parser now uses the first movement direction instead of rejecting any occurrence of “credited.” The reverse incoming-credit message remains excluded. This fixes the supplied message-format regression; delivery/redaction and sender formatting on the actual phone still need testing.

The same simpler presentation applies across screens: clear page titles, optional expense metadata/notes/presets, report explanations, sync identifiers and account maintenance details are expandable. Financial review amounts, group, date, category, participants, notes and final confirmation remain visible. Destructive actions retain their warning and explicit confirmation.

### Google Play and direct SMS

The current APK still uses notification access and does not request READ_SMS or RECEIVE_SMS. Google Play lists SMS-based money management as a potential restricted-permission exception, subject to review and approval: https://support.google.com/googleplay/android-developer/answer/10208820. Splix may be eligible if automatic SMS-based expense tracking qualifies as core functionality and the policy's conditions are met; approval is not established. Android also treats these permissions as hard-restricted and requires installer allowlisting: https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS. A permission prompt alone is insufficient.

A future direct-SMS implementation should request the minimum justified scope: RECEIVE_SMS for new incoming messages; READ_SMS only if an explicit history-import feature needs it. It would filter financial messages locally, discard unrelated/OTP content, and reuse private draft review and confirmation. Prominent disclosure, privacy/Data safety declarations, permissions review and real-device verification are required. The current test-signed APK is not a Play production release. No direct SMS receiver or inbox reader has been added by this bug fix.

### Payment reminders and inline replies (APK 1.0.3)

Enable **Allow payment prompts** as well as Android notification-listener access. These are separate permissions; Android 13+ needs permission for Splix to show its own notifications. Choose payment-app sources and optionally check **Use bank SMS alerts**. Splix discovers the current default SMS app through Android, rather than hard-coding a phone brand. Use the Messages notification settings button to allow notifications and bank transaction conversations, then return and save source consent. Splix cannot verify each conversation's settings, bypass content redaction, or promise every format is readable.

Tap **Enable payment reminders** to receive suggestions without preselecting a group or expiry. Name a detected payment in its notification, then choose a group and split during review. Reminders run until paused/stopped, logout/account switching, permission loss or listener disconnection. The optional timed Active Group Mode still assigns a default group for 30 minutes to 4 hours. Manual entry always works.

A newly detected outgoing payment produces a private notification with **Name expense**, **Split**, and **Personal**. Name expense opens the notification keyboard for a description of up to 120 characters. The reply is saved locally and pre-fills the expense title. It never creates an expense, payment or pending financial operation. Split opens the private suggestion so the user can verify its group, amount, participants and split, then confirm.

Prompts hide payment details on the lock screen, expire within 24 hours (or sooner for a timed session), and cancel on pause, stop, account change, local deletion or draft disposition/confirmation. Replies are tied to one account and draft; stale, queued, cross-account and changed-group actions are rejected. Source updates refresh an existing prompt silently, without recreating a dismissed notification or overwriting typed details. Replies work without JS or network access; posting still needs explicit confirmation and API validation.

Timing and coverage depend on the source app sending a readable notification, Android delivery, channel settings, Do Not Disturb and device power controls. Every UPI transaction is not guaranteed. The SMS-notification and group-later workflow requires APK 1.0.3 (Android version code 4). Real-device coverage and inline reply checks remain outstanding.

### Capture and review

Open Active mode to read the disclosure. Select candidate source apps, optionally consent to bank SMS notifications, then open Android notification-access settings. After access and Splix prompts are enabled, tap Enable payment reminders; no group or timer is required. Alternatively, choose a current group and a 30-minute, 1-hour, 2-hour or 4-hour duration. Access alone does not activate capture. Pause, stop, timed expiry, logout, account switching and permission revocation stop active ingestion.

Starting reads the saved native state back before reporting success. Timed mode shows its group and stop time beside Start/Update; reminders show a group-later confirmation. Access granted and the OS listener being connected are reported separately, with a reconnect button and fallback guidance. These checks do not prove payment coverage. A payment success screen or in-app Google Pay alert is insufficient: Android must deliver a readable notification from a selected source package. Optional SMS parsing requires an alphanumeric sender tag, account/debit and UPI markers, and an unambiguous amount. OTPs, credits, failures, requests and ambiguous formats are skipped. The available balance is excluded from amount selection. Raw sender/message text is discarded. No SMS inbox is queried and no SMS read/receive permission is requested. Changing default SMS apps requires opting in to the new app.

Only selected source packages are inspected. Raw notification text is parsed transiently on-device and is neither stored nor uploaded. Minimal account-scoped suggestions include amount, payee label, time and capture-time group. Payee labels can still be personal data. Local backup is disabled. There is an explicit local deletion control in Profile. Automated retention expiry and payment-app/device coverage remain pilot gates.

Open Private inbox to review. Choose shared expense or external payment, verify the group, then verify the amount, payer and participants in the relevant form. A possible duplicate warning is a prompt to check group history. Personal and Dismiss keep the suggestion out of the shared group; Later leaves it waiting. Merely opening an inbox item or `splix://review/<draft-id>` never posts. Deep links are loaded only for the signed-in account and must reference an available local draft. There is currently an inbox fallback, not a promise of background notification prompts.

## Balances, reports and closeout

Positive balances mean gets back; negative balances mean owes. Explain a balance shows contributing events. Record a payment only after it was made outside Splix. Suggested transfers do not move money or record payment until explicit confirmation; the server rejects stale or excessive settlements.

Monthly reports show categories, member shares, recorded settlements and opening/closing balances. Share/download the API's CSV from the same report. Private drafts and pending requests are excluded. The CSV quotes cells and neutralises formula-like text.

Before archiving, review this account's suggestions, manual drafts and pending writes on this device, then settle the confirmed group balances. The checklist does not imply visibility into another person's private inbox. Only an owner can archive, and the server requires zero balances. History remains readable.

## Privacy and release status

Profile supports name updates, sign-out, local data deletion, and account deletion. Account deletion revokes sessions and anonymises the profile while retaining shared financial audit history. Local deletion removes saved drafts and pending requests permanently; check history if an earlier response was lost. Recovery request/confirmation screens are present, but trusted token delivery has not been configured.

The current build is a development implementation. Verify the native APK, screen reader/large-text behavior, permission revocation, real device restart/offline behavior, retention, and store disclosures before a pilot. Browser tests are not evidence of live Android payment capture or store approval.
