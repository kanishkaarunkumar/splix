# Native/local capture handoff contract

The current prototype schema is in `android/capture-prototype/src/main/kotlin/com/splix/capture/CaptureStore.kt`. It is a local SQLite schema owned by Person 1 and intended for joint review with Person 3 before either side builds a production repository.

## Local tables

- `capture_settings`: one row per signed-in account; consent timestamp, selected package allowlist, active group, bounded expiry, and pause state. A device-global account slot points to the currently authenticated account; switching accounts stops the previous account's active mode before changing the slot.
- `payment_drafts`: local UUID, account/source identity hashes, optional reference fingerprint, amount in paise, payee label, observed time, capture-time group, confidence, duplicate warning, review state, edited flag and optional committed event ID. There is no raw notification content column.

Only statuses `needs_review`, `personal`, `dismissed`, `queued`, `posted`, and `needs_attention` are valid. Opening, editing, source updates, prompts, and deep links never post. A repeated callback with the same account/source/key hash updates an unedited `needs_review` draft; a likely amount/time/reference match from another source key is retained and flagged instead of silently discarded. A post confirmation must be a separate UUID-keyed API request; notification identity must never become an API idempotency key.

## Data flow and lifecycle

Android Settings permission is requested only after the disclosure/consent control. The listener checks the selected source before reading title/body, parses transient strings, hashes source keys/references, and sends only a candidate object to a single local writer. The writer rechecks account, group, allowlist and expiry in a SQLite transaction before persisting. Account switching/logout stops active capture. Expiry is checked whenever a callback arrives; revocation/disconnection pauses capture. Android backup is disabled for the prototype database.

The prototype's test screen accepts synthetic account/group IDs and cannot prove server membership. A production bridge must set the account from authenticated session state, activate only a nonarchived group returned by the API, clear active capture on logout/revocation, and pass reviewed fields only after explicit confirmation. API errors and pending writes stay outside this local capture store until Persons 1 and 3 agree a shared queue migration.

No access token, notification text, full source reference, or server draft is stored here. The payee label may still be personal information; apply a reviewed retention window and explicit local delete control before a pilot.
