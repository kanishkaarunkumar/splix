# Using Splix on Android

## A manual split

Create an account, create a group, and open People & invites. The owner shares an expiring join code. Other accounts request to join; the owner approves them. Groups support up to 50 members.

Open a group and add an expense. Enter the amount in rupees, payer, date, category, optional note and participants. Choose equal, percentage, exact or weighted splitting. The preview uses deterministic integer-paise allocation; the server validates the final request independently. A payer may be excluded from participants. The owner can save and apply named split presets.

Review the split, then confirm. A durable UUID-keyed request is saved before sending. Pending writes are labelled and excluded from confirmed balances. A saved manual draft is private and is not queued until confirmed. Open Private inbox to resume or discard saved manual drafts.

## Offline and corrections

Confirmed requests survive local process restart on Android. On reconnect or app foreground, the queue retries the same payload with the same key. A lost server response therefore replays the existing result when the server's replay store is available. The development API loses that store on server restart; it must be replaced by the PostgreSQL repository before real use.

A validation/authorization conflict is shown as Needs attention. Inspect group history and the error before retrying the exact request. Discarding a definitely rejected request returns its capture suggestion to review. Network failures and unknown outcomes stay pending and retain their key. Signing out stops capture and isolates that account's local data; another account cannot read or send it.

To correct an expense, open its history entry, enter the replacement and a reason, review, then confirm. The original remains with a linked reversal and replacement. Balances and monthly reports reflect the correction, including corrections that move activity across months.

## Private payment suggestions

Open Active mode to read the disclosure. Select candidate source apps, explicitly consent, then open Android notification-access settings. After access is granted, choose a current group and a 30-minute, 1-hour, 2-hour or 4-hour duration. Access alone does not activate capture. Pause, stop, expiry, logout, account switching and permission revocation stop active ingestion.

Only selected source packages are inspected. Raw notification text is parsed transiently on-device and is neither stored nor uploaded. Minimal account-scoped suggestions include amount, payee label, time and capture-time group. Payee labels can still be personal data. Local backup is disabled. There is an explicit local deletion control in Profile. Automated retention expiry and payment-app/device coverage remain pilot gates.

Open Private inbox to review. Choose shared expense or external payment, verify the group, then verify the amount, payer and participants in the relevant form. A possible duplicate warning is a prompt to check group history. Personal and Dismiss keep the suggestion out of the shared group; Later leaves it waiting. Merely opening an inbox item or `splix://review/<draft-id>` never posts. Deep links are loaded only for the signed-in account and must reference an available local draft. There is currently an inbox fallback, not a promise of background notification prompts.

## Balances, reports and closeout

Positive balances mean gets back; negative balances mean owes. Explain a balance shows contributing events. Record a payment only after it was made outside Splix. Suggested transfers do not move money or record payment until explicit confirmation; the server rejects stale or excessive settlements.

Monthly reports show categories, member shares, recorded settlements and opening/closing balances. Share/download the API's CSV from the same report. Private drafts and pending requests are excluded. The CSV quotes cells and neutralises formula-like text.

Before archiving, review this account's suggestions, manual drafts and pending writes on this device, then settle the confirmed group balances. The checklist does not imply visibility into another person's private inbox. Only an owner can archive, and the server requires zero balances. History remains readable.

## Privacy and release status

Profile supports name updates, sign-out, local data deletion, and account deletion. Account deletion revokes sessions and anonymises the profile while retaining shared financial audit history. Local deletion removes saved drafts and pending requests permanently; check history if an earlier response was lost. Recovery request/confirmation screens are present, but trusted token delivery has not been configured.

The current build is a development implementation. Verify the native APK, screen reader/large-text behavior, permission revocation, real device restart/offline behavior, retention, and store disclosures before a pilot. Browser tests are not evidence of live Android payment capture or store approval.
