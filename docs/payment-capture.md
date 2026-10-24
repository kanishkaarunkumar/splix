# Splix — Active Group Mode and Payment Capture

## Status and boundaries

Implemented as an Android test feature, with real-device coverage still under evaluation. Selected UPI-app notifications and separately opted-in bank SMS notifications from the current default Messages app may become private local suggestions. No direct bank feed, payment verification, automatic debt, SMS-inbox access, or guaranteed detection. The manual app always remains available. Platform references and review gates are in [TECH_STACK.md](../TECH_STACK.md).

## End-to-end flow

1. Explain source selection, purpose, broad OS permission versus narrow app processing, local storage, retention, and deletion. Obtain affirmative opt-in before opening notification-access settings.
2. Enable payment reminders without preselecting a group, or explicitly activate one nonarchived member group for a bounded duration. Display current mode and pause/stop controls. Reminders require permission for Splix prompts; group selection happens during review for unassigned drafts.
3. Native code checks consent/account/expiry and source allowlist before inspecting available content. Ignore unrelated sources and incoming/failed/pending signals. Parse raw text transiently, never log or upload it.
4. Save minimum candidate fields: amount, payee label, source, observed time, optional reference, and group active at capture. Observed time is not a verified payment timestamp.
5. Show a private review prompt when permitted; otherwise retain the private inbox entry. Android inline replies save a short user-entered description to the private draft only. Review, Personal, Later, replies and opening a deep link never post financial records; group/amount/split review and explicit confirmation in the app remain required.
6. Review offers Expense, Settlement, Personal, or Dismiss; verify/edit group, amount, payer, participants, split, category, and date. A transfer to a friend must not automatically become another expense.
7. Final explicit confirmation freezes a payload under a stable operation UUID. Send online or queue visibly as pending offline. Server authorization, allocation, and financial checks are mandatory.
8. After a committed result, link the draft to the event. Timeout is unknown, not failed: replay the same key/payload. Personal/dismissed drafts never call posting APIs.

## Proposed local entities and state

| Entity | Responsibility |
| --- | --- |
| `capture_settings` | Account, consent, supported-source allowlist, active group, activation/expiry, pause state. |
| `payment_drafts` | Local UUID/account/source identity/update metadata, optional reference, candidate fields, captured group, confidence/duplicate flags, state, optional committed event ID. |
| `pending_operations` | UUID/idempotency key, account/group, kind, frozen confirmed payload, retry state, result or safe error. No raw content. |

Draft states: `needs_review`, `personal`, `dismissed`, `queued`, `posted`, `needs_attention`. Opening/editing is not consent to post. Rejects return to review; queued payloads are immutable. Reconcile unknown results before authorizing a replacement operation with a new key. Drafts do not count in balances/history/reports until committed.

Persons 1 and 3 agree one native/JS schema and migration/repository boundary. Native ingestion must persist without JS running. Local transactions prevent notification updates overwriting user edits or two confirmations queuing the same draft twice.

Account switch/logout stops capture, clears active mode, cancels prompts, and quarantines the old account's pending queue; only that account can resume after sign-in and appropriate consent. Never send using another account's session. Group switches affect future capture only. Expiry works offline; server membership/archive checks still run on confirmation.

## Two distinct deduplication layers

**Source deduplication:** merge repeated notification callbacks/updates using account/source-scoped metadata and reference when available. Source IDs can be reused; amount/payee/time matches are uncertain and should warn, not silently discard legitimate repeated payments. Ignore Splix's own notifications to avoid loops.

**Posting idempotency:** each confirmed operation has one request UUID/hash. Commit its financial event and saved response atomically; replay the same payload and reject changes under the same key. A lost response after commit must not produce a second event.

These do not establish exactly-once accounting for every real-world payment. Different devices or a new deliberate user operation can still duplicate a manual expense. Warn against plausible matches without treating references or notification text as authoritative proof.

## Privacy and fallback requirements

- Explicit payment-app source allowlist. A separate affirmative choice adds only the current default SMS app for likely bank UPI debit notifications. No SMS inbox/history queries, SMS permissions, accessibility scraping, credentials, or unconsented capture. Messages-app changes require opting in to the new source.
- Raw text stays transient/on-device. No backend parsing, crash/analytics payloads, or personal fixtures. Persist only minimum parsed fields in app-private storage.
- Exclude drafts/credentials from backups; decide retention including dedupe tombstones before pilot. Provide local deletion controls and explain that deleting local metadata cannot reverse committed server entries.
- Permission revocation stops ingestion when observed; recheck on resume. Prompt denial leaves inbox/manual entry usable. Generic lock-screen text by default.
- Record supported app/version/device combinations and known misses/redaction/background restrictions. Recheck store/privacy policies; consent is not certification.
- If the prototype or distribution review fails, retain manual entry and implement user-initiated share/import. Later iOS support is review-based sharing, not background notification monitoring.

## Acceptance and evaluation checklist

- [ ] Real-device/source matrix: outgoing/incoming/failed/pending notifications, available fields, repeated updates, delayed delivery, and disappearing notifications.
- [ ] Labelled detection precision/recall, misses, false prompts, source-duplicate rate, confirmation time, and financial duplicate count, without private-content telemetry.
- [ ] Denied/revoked access, prompt denial, expiry, group/account switches, app restart/kill, no network, and background/power restrictions.
- [ ] Equal-value legitimate payments, missing/reused references, concurrent callbacks/confirmation, repeated taps, and restart after commit before response.
- [ ] Native/JS migration/transaction consistency; no raw content in API requests, logs, analytics, backups, group views, or demo recordings.
- [ ] Manual app remains complete; support limitations, retention/deletion, policy review, and go/no-go are documented. Synthetic fixtures alone do not prove live coverage.
