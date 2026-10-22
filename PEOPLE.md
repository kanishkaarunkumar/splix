# Splix — Three-Person Remaining Work Split

## Baseline

Use placeholder names until team members are assigned. As of October 20, 2026, financial SQL and documentation exist, but no database execution evidence, API, mobile app, native capture, or tests. Validate/extend existing work rather than recreating it or marking it complete. All three own integration, testing, documentation, and demonstration.

Milestones follow [PLAN.md](PLAN.md), not fixed deadlines. Later-release features have no MVP implementation assignment.

## Ownership

| Person | Responsibility | Remaining deliverables | Reviewer |
| --- | --- | --- | --- |
| Person 1 — Data integrity and Android capture | Validate/extend SQL; implement native capture boundary and research evidence | Database setup/tests/grants; new financial/product migrations; Kotlin prototype/listener/parsers; native draft ingestion/deduplication; SQL reports, race/query/restore evidence | Person 2 for financial/security; Person 3 for native integration |
| Person 2 — API and financial workflows | Server behavior, identity, money rules, safe retries | API/auth/recovery/deletion; groups/join/archive; allocations/presets; expenses/settlements/corrections/replay; history/explanations/debt plan; report/CSV endpoints; OpenAPI/API tests | Person 1 |
| Person 3 — Mobile and offline experience | React Native product, review UI, local queue orchestration | Mobile scaffold/screens; consent/active mode/inbox/review; local repository integration; offline queue; presets/reports/export/closeout; accessibility/mobile tests/demo | Person 2 for API/queue; Person 1 for native storage |

Person 1 takes native capture because financial SQL is already written. Person 2 owns every HTTP endpoint, including reports/CSV; Person 1 owns report SQL/fixtures. Person 3 owns the client queue; Person 1 owns native ingestion. Persons 1 and 3 must agree one local persistence/migration contract before coding it.

## Person 1 — Remaining checklist

- [ ] Apply existing migration/seed on fresh PostgreSQL; capture failures and actual results.
- [ ] Add scoped-membership, invariant, append-only, rollback, and race fixtures; complete restricted runtime grants.
- [ ] Add a new controlled atomic correction contract with linked replacement; never rewrite migration `001`.
- [ ] Add weighted-share/preset schema and agreed expense-note, session/join/archive extensions with Person 2. No capture-draft upload tables.
- [ ] Prototype Kotlin capture on selected real devices/source apps; document support, misses, restrictions, and go/no-go.
- [ ] Implement allowlisting, transient parsing, native local persistence, source-update dedupe, account isolation, expiry/revocation checks; no SMS/accessibility workarounds.
- [ ] Supply sanitized parser fixtures and capture precision/recall evidence, distinct from API retry evidence.
- [ ] Validate report SQL, measure indexed query plans on representative data, and demonstrate backup/restore with row counts and zero-sum reconciliation.

## Person 2 — Remaining checklist

The `person-2-api-updated` branch contains the FastAPI service foundation for authentication/recovery, revocable sessions, group lifecycle, join codes, allocations, presets, expenses, settlements, corrections, replay protection, history/explanations, debt suggestions, monthly JSON/CSV, and OpenAPI routes. PostgreSQL repository wiring and real-connection evidence remain integration work with Person 1.

- [ ] Scaffold API/contracts/CI and single-connection transaction helper.
- [ ] Implement Argon2id auth, revocable mobile sessions, recovery, logout, and agreed deletion/retained-history workflow.
- [ ] Implement authorized groups, owner-approved expiring/revocable joins, membership, and archival.
- [ ] Implement deterministic equal/percentage/exact/weighted allocation and validated split presets.
- [ ] Implement posting, settlement, balances/explanations, debt suggestions, history/search, and atomic corrections.
- [ ] Commit request hash/result with the operation; replay after lost responses and reject changed payload under the same key.
- [ ] Implement monthly JSON/CSV, pagination, stable errors, and mobile export contract.
- [ ] Run API/security and real-connection race tests with Person 1; deliver OpenAPI examples and setup/deployment guide.

## Person 3 — Remaining checklist

- [ ] Scaffold React Native/native builds, typed navigation, secure credentials, API client.
- [ ] Build account/recovery/profile/deletion, groups/join/archive, all split forms, balances, settlements, and history/corrections.
- [ ] Build disclosure/permission education, bounded active mode, pause/stop, and denied/revoked states.
- [ ] Build private inbox/review with Expense, Settlement, Personal, Dismiss, Later, duplicate warnings, and explicit confirmation.
- [ ] Integrate shared local repository with Person 1; implement stable-key queue, retry/conflict states, restart recovery, logout/account isolation.
- [ ] Build presets, explain-my-balance, reports/CSV sharing, and closeout limited to this device's private draft status.
- [ ] Test accessibility, manual operation without capture, safe prompt/deep-link routing, and offline/restart journeys.
- [ ] Assemble user guide, privacy/release disclosures with the team, pilot feedback, and complete mobile demo.

## Milestone allocation

| Milestone | Person 1 | Person 2 | Person 3 | Shared checkpoint |
| --- | --- | --- | --- | --- |
| 0 — Feasibility | SQL baseline; native prototype; local schema proposal | API/auth scaffold and money/replay DTOs | Native mobile scaffold, consent mockup, local contract | Capture go/no-go and approved contracts. |
| 1 — Manual slice | DB fixtures/grants | Auth/groups/equal expense/balances | Account/group/expense/balance screens | Phone → API → ledger without capture. |
| 2 — Financial core | Correction migration/race harness | Advanced splits/settlements/replay/history | Financial forms/history/correction UI | Invariant, race, retry checks pass. |
| 3 — Capture | Listener/parsers/native storage/dedupe | Confirmed-draft integration/safe diagnostics | Active mode/inbox/review/prompt routing | No source signal creates unreviewed debt. |
| 4 — Usability | Weighted/preset schema/report SQL | Weighted/preset/explanation/report/CSV APIs | Offline queue/presets/explanations/export/closeout | Reconnect and reports reconcile. |
| 5 — Pilot/evidence | Query/capture/restore evaluation | API hardening, setup/deployment evidence | Device/accessibility/pilot/demo/user guide | Reproducible setup and agreed release scope. |

If capture fails its gate, Person 1 redirects native effort to user-initiated import and database validation; Person 3 retains manual drafting/review. Unsupported capture must not block the whole product. Re-estimate workload after milestone 0; pair on bottlenecks rather than silently dropping tests.

## Handoffs and contracts

1. All three approve paise strings, basis points/weights, balance sign, error codes, mobile sessions, request/replay examples, and schema-extension order before dependent work.
2. Person 1 supplies tested SQL signatures/grants. Person 2 derives actor identity from sessions, not clients or native source text.
3. Persons 1 and 3 agree native bridge, local schema/migrations, transactions, expiry, account isolation, retention/deletion, and draft state transitions before parallel implementation.
4. Person 2 supplies stable request-key/hash/replay behavior and conflict fixtures. A source-notification ID is not a financial operation key.
5. Person 1 supplies report SQL/fixtures; Person 2 owns consistent snapshots and CSV serialization; Person 3 checks display/export parity.
6. Person 1 leads source/device dedupe tests; Person 2 leads server retries/races; Person 3 leads offline review-to-post journeys. All verify no private draft leaks into group APIs.

## Collaboration and assessment

- Integrate twice weekly through small reviewed changes. Financial changes need the other financial owner's review; native/local-storage changes need native/mobile cross-review.
- Never edit an applied migration. Each issue has owner, reviewer, dependencies, acceptance criteria, and actual test evidence.
- Review amounts, zero-sum entries, authorization, atomicity, replay, private-draft boundaries, and permission behavior before handoff.
- No personal notification content in fixtures, logs, analytics, screenshots, or demos. Review distribution rules before claiming release readiness.
- Everyone explains ER design, balance equation, and a concurrent/retry transaction. Person 1 demonstrates DB/native evidence; Person 2 API/replay/races; Person 3 complete mobile journeys.
