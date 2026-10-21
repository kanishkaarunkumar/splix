# Splix — Mobile Product Plan

## Product direction

Build an Android-first shared-expense app for friends, roommates, and travelers. The promise: **pay normally, get a timely suggestion, and split the expense in a few taps**. The complete manual app works without notification access. Splix records payments made outside the app; it does not transfer money or verify bank transactions.

The differentiator is optional Active Group Mode: a supported outgoing UPI-app notification becomes a private draft for review, never an automatically posted expense. Detection coverage is a feasibility question, not a guarantee or a claim of global product novelty. Start with INR, one payer per expense, and up to 50 members per group.

See [architecture](ARCHITECTURE.md), [technology choices](TECH_STACK.md), [remaining ownership](PEOPLE.md), and the [capture specification](docs/payment-capture.md).

## Current implementation status — October 20, 2026

- Existing source: financial-schema migration; expense/settlement/reversal functions; immutable-ledger guards; balance/report SQL; seed categories, users, group, and memberships.
- Not verified: migration execution, database integration/concurrency tests, query-plan measurements, and backup/restore. Written SQL is not runtime evidence.
- Missing: mobile app, native capture, API/authentication, split-allocation utilities, offline queue, actual CSV generation, and automated tests.
- Partial foundations: idempotency storage exists without replay behavior; reversals exist without an atomic linked replacement workflow. Weighted splits, notes, presets, sessions, join codes, and group archival need schema extensions. The seed contains placeholder password hashes and no financial events.

Everything below is planned unless explicitly identified as existing SQL. Do not mark documentation as implementation.

## Core app requirements

| Feature | Acceptance criteria |
| --- | --- |
| Accounts | Register, log in/out, recover access, edit profile, and request account deletion. Revoke sessions and agree personal-data removal versus retained financial audit history before release; never cascade-delete group history. |
| Groups | Create/list groups; owner approves members through revocable, expiring join codes/links; archive completed groups. Retain historical memberships; no invitation-email dependency. |
| Expenses | Amount, payer, title, category, effective date, optional note, and participant subset. Payer need not participate but all referenced users must be members. |
| Equal split | Integer paise, deterministic user-ID tie breaks; ₹100 across three gives ₹33.34, ₹33.33, ₹33.33. |
| Percentage/exact splits | Percentage weights total 10,000 basis points; exact shares total the expense. Reject invalid inputs instead of silently normalizing. |
| Weighted shares | Positive integer weights and deterministic largest-remainder allocation. Extend database validation through a new migration before enabling. |
| Balances/explanation | Paid, assigned shares, settlements sent/received, and net balance, with contributing-event drill-down. Group net balances sum to zero. |
| Suggestions/settlements | Deterministic suggested transfers preserve net balances; record partial/full external payments with live checks and idempotent retries. Suggestions do not record payments. |
| History/corrections | Paginated, searchable activity with actor, effective/recorded times, and correction links. Reverse and replace atomically; preserve originals. |
| Reports/CSV | Monthly spending by member/category, settlement activity, opening/closing balances, and mobile download/share of CSV from the same report data. |

## Signature and usability requirements

| Feature | Acceptance criteria |
| --- | --- |
| Active Group Mode | Explicit activation of one capture group per device for a bounded duration; visible expiry and pause/stop. Switching groups does not silently reassign older drafts. |
| Android capture | After disclosure and consent, inspect only allowlisted supported UPI-app notifications. Identify likely outgoing payments; no SMS reading, accessibility scraping, or bank-feed assumption. |
| Review prompt | Offer Review, Not shared, and Later when local notifications/background behavior allow; private inbox remains the fallback. Opening a prompt never posts. |
| Private suggestion inbox | Local/account-scoped drafts. Choose Expense, Settlement, Personal, or Dismiss; verify group/amount/payer/participants. Only explicit confirmation invokes the financial API. |
| Duplicate handling | Merge source-notification updates; use references when available and flag uncertain amount/time matches. API idempotency independently protects financial retries. |
| Split presets | Named group participant/split defaults; preview before applying, revalidate membership, and snapshot final shares into each expense. |
| Offline drafts | Persist manual drafts and confirmed mutations locally. Show pending versus committed state; stable request keys survive restart. Never label uncommitted balances as confirmed. |
| Trip closeout | Review this device's drafts/pending writes and group balances before archiving; export settlement summary. Do not imply access to other members' private inboxes. |

## Feasibility and privacy gate

Prototype the Android listener before promising capture. Record support by payment-app/version, Android version, and device, including misses and false positives. Some sources emit no usable notification; content can be restricted/redacted and device/background behavior varies. Do not advertise universal detection or iOS background parity.

Review current platform/store rules at prototype and release. Agree draft retention/deletion, backup exclusions, lock-screen privacy, and revocation behavior. Parse raw text transiently on-device; do not upload or log it. Store minimum review fields. Consent is necessary but is not a guarantee of store approval. Do not use notification access to bypass SMS restrictions.

If capture is unreliable or unsuitable for distribution, ship the manual product and user-initiated share/import fallback. No source signal may bypass user confirmation and normal financial validation.

## Delivery sequence from the current repository

These are milestones, not completed work or fixed dates. If six academic weeks are available, use one milestone per week as an initial estimate, revising after the prototype. Reduce scope rather than skip validation.

| Milestone | Deliverable | Exit condition |
| --- | --- | --- |
| 0 — Feasibility/contracts | Kotlin proof of concept; execute SQL baseline; mobile/API scaffold | Support matrix/go-no-go recorded; migrations apply; identity, bridge, local queue, and financial contracts agreed. |
| 1 — Manual vertical slice | Accounts, groups, equal-split expense, balances | A phone-created expense persists and reconciles without capture permission. |
| 2 — Financial core | Percentage/exact splits, settlements, debt plan, replay, corrections/history | Real PostgreSQL race, rollback, retry, and authorization tests pass. |
| 3 — Signature capture | Active mode, listener, private inbox, review, deduplication | Supported signals become private drafts; only deliberate confirmation posts. |
| 4 — Daily usability | Weighted shares/presets, offline sync, explanations, reports/CSV, closeout | Restart/reconnect does not duplicate writes; exports reconcile; new migrations are tested. |
| 5 — Pilot/submission | Device/accessibility checks, performance evidence, restore demo, privacy/release checklist | Reproducible clean start, measured limitations, mobile demo, and agreed release scope. |

Integrate twice weekly; native capture and core-app work can run in parallel. Freeze new features before final validation. Defer optional charts/polish first if time is short.

## Required validation and research

- Unit: equal/percentage/exact/weighted allocation, deterministic rounding, preset validation, balance signs, and debt conservation.
- PostgreSQL: keys/group scope, amount checks, zero-sum entries, immutability, atomic correction, injected rollback, and restricted runtime grants.
- Concurrent connections: two ₹400 settlements against ₹500 owed; two corrections to one event; identical request keys. Assert one allowed result without duplicate events.
- API: session expiry/revocation, group authorization, recovery/deletion, join-code abuse, archival, pagination/search, stale suggestions, and sanitized errors.
- Android: consent, denied/revoked permissions, prompt denial, expiry, group/account switching, restart/background behavior, repeated updates, incoming/failed/pending signals, and privacy-safe prompts.
- Offline: lost response after commit, repeated confirmation, reconnect/restart, account isolation, validation conflict, and no unreviewed financial writes.
- Mobile journey: create group → join members → manual expense → capture review → balances → settle → correction/history → export → closeout.
- Reports: month boundaries, zero activity, late corrections, category reconciliation, settlement separation, CSV formula/quoting safety, and exclusion of local drafts.
- Performance: at least 10,000 seeded history events; query plans, environment/workload, latency percentiles, lock waits, and actual observed results. Capture PostgreSQL backup/restore counts and zero-sum checks.

Research question: **How can noisy repeated payment signals and unreliable mobile networks produce correctly attributed shared expenses without duplicate financial postings?** Report precision/recall on labelled eligible fixtures, misses, duplicate-suggestion rate, confirmation effort, and financial duplicate events separately. Synthetic fixtures prove parser behavior, not live device coverage. Do not equate notification detection with bank verification or promise an improvement before measurement.

## Demonstration dataset

Create financial examples through posting APIs/functions, not direct ledger inserts. A pays ₹1,500 with ₹500 per member; B pays ₹500 with exact shares A ₹166.66, B ₹166.67, C ₹166.67; C pays ₹1,000 with exact shares A ₹333.34, B ₹333.33, C ₹333.33. Balances: A +₹500, B −₹500, C ₹0; B pays A ₹500 to clear them. This data is not in the current seed.

Also demonstrate repeated capture, personal dismissal, lost-response replay, overpayment rejection, concurrent settlements, retained corrections, and monthly export. Use sanitized notifications in presentations.

## Later releases and exclusions

Later: receipt itemization; reviewed screenshot OCR/import; recurring expenses; recipient acknowledgement distinct from bank verification; configurable reminders; iOS with user-initiated sharing/import. Scope separately after the Android pilot.

Exclude initial multi-currency, payment execution/guarantees, universal UPI detection, banking credentials, distributed databases, and automatic debt creation from notifications.

## Completion definition

The manual Android app works independently of capture; accepted sources have measured support and privacy controls; posting/retries preserve financial invariants; setup, migrations, tests, backup/restore, release disclosures, and demo match delivered behavior. Planned features remain marked planned.
