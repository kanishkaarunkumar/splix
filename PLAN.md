# SplitWise+ — Project Plan

## Objective

Build a shared expense web application for friends, roommates, and travelers. Users create groups, record expenses, see outstanding balances, and record payments suggested by a debt simplification algorithm. The application records payments made outside the app; it does not transfer money.

This is a proposed plan for a new repository and a three-person academic project. Assume six weeks, INR only, one payer per expense, and up to 50 members per group. Adjust the schedule to the course deadline. Roles are defined in [PEOPLE.md](PEOPLE.md), system design in [ARCHITECTURE.md](ARCHITECTURE.md), and tools in [TECH_STACK.md](TECH_STACK.md).

## Scope and acceptance criteria

| Feature | Required behavior and completion criteria |
| --- | --- |
| Accounts | Register, log in, log out; users cannot access groups they do not belong to. |
| Groups | Create a group; owner adds existing registered users; list members and groups. Members with history are retained, with departure deferred beyond the MVP. |
| Expenses | Record title, category, date, payer, amount, and participant subset. All participants and the payer must be members. |
| Equal split | Split integer paise deterministically; ₹100 among three people yields ₹33.34, ₹33.33, ₹33.33. |
| Percentage split | Accept percentages to two decimal places summing to 100%; allocate remaining paise deterministically. |
| Exact split | Accept nonnegative shares whose total exactly matches the expense. Reject invalid totals. |
| Balances | Show total paid, assigned shares, payments sent/received, and net balance per member. Group balances always sum to zero. |
| Settlements | Record full or partial debtor-to-creditor payments; reject self-payments, excessive amounts, and nonmembers. Retry of one request creates only one payment. |
| History | Paginated chronological expense, settlement, and correction history, with actor and recording time. |
| Monthly reports | Show spending by category and member, settlements separately, opening/closing balances, and CSV export. |
| Debt simplification | Produce valid suggested transfers preserving every member's net balance; deterministic output and no automatic payment recording. |
| Corrections | Append reversal and replacement records atomically; original financial records remain visible. |

Defer multi-currency, real payment gateways, receipt OCR, recurring bills, invitation emails, mobile apps, and distributed databases. An immutable ledger is included in the planned scope because it provides useful transaction and audit demonstrations; implement it after basic expense posting works.

## Six-week delivery sequence

| Week | Deliverable | Exit condition |
| --- | --- | --- |
| 1 — Foundation | Repository structure, local PostgreSQL, ER model, migrations, FastAPI contract, UI sketches, authentication skeleton | Everyone can run the same seeded database; agree on money representation and balance signs. |
| 2 — First complete flow | Login, groups/membership, equal-split expense creation, ledger posting, balances | Browser-created expense is persisted and produces correct SQL balances. |
| 3 — Financial rules | Percentage/exact splits, settlements, debt suggestions, idempotency, transaction locks | Invalid payments fail; parallel payment attempts cannot over-settle. |
| 4 — Audit and reporting | Corrections, paginated history, monthly SQL reports, CSV and charts | Reversal preserves history; reports reconcile with ledger balances. |
| 5 — Integration and evidence | Browser flows, authorization tests, rollback tests, query-plan measurements, responsive/error states | Required tests pass; index evidence and concurrency transcript are reproducible. |
| 6 — Submission | Setup instructions, final diagrams, backup/restore demo, report, presentation, recorded walkthrough | A teammate starts from a clean checkout and completes the demo without manual database edits. |

Integrate at least twice per week. Finish one working browser-to-database flow before expanding screens. Reserve week 6 for stabilization, not new features.

## Required validation

- Unit tests: split allocation, deterministic rounding, percentage totals, exact totals, net-balance signs, and debt-plan conservation.
- Database tests against PostgreSQL: keys/constraints, cross-group references, atomic posting, zero-sum entries, immutable rows, and rollback on an injected failure.
- Concurrent connections: two ₹400 settlements against a ₹500 debt; only one succeeds. Two corrections to one expense; only one reversal succeeds. Two identical idempotency keys; only one operation is recorded.
- Integration tests: authentication, role checks, unauthorized group IDs, request validation, stale settlement suggestions, and reversal after an earlier settlement.
- Browser tests: create group → add three members → record expense → see balance → settle → inspect history → export report.
- Reporting tests: month boundaries, zero-activity month, category totals, late correction of an earlier month, and settlement exclusion from spending.
- Performance evidence: seed at least 10,000 history records and capture `EXPLAIN (ANALYZE, BUFFERS)` before/after proposed indexes. Report observed results; do not assume every index improves every query.

## Demonstration dataset

A, B, and C each owe ₹1,000. Record A’s ₹1,500 expense with equal shares of ₹500. For B’s ₹500 expense, use exact shares A ₹166.66, B ₹166.67, C ₹166.67. For C’s ₹1,000 expense, use exact shares A ₹333.34, B ₹333.33, C ₹333.33. Each member’s combined allocation is exactly ₹1,000. Exact shares in this fixture reproduce the requested example without cumulative equal-split rounding differences. Balances are A +₹500, B −₹500, C ₹0. The suggestion is B pays A ₹500. Record that settlement and show all balances at zero.

Also demonstrate a rejected overpayment, concurrent settlement requests, an expense correction with retained history, and a monthly report.

## DBMS syllabus evidence

| Concept | Implementation and submission evidence |
| --- | --- |
| ER design | Users, memberships, expense participants, events, and ledger relationships with cardinalities. |
| Normalization | Separate identity, group membership, expense metadata, shares, and ledger entries; explain intentional audit projections. |
| Complex SQL | CTEs, grouped sums, conditional aggregates, joins, monthly windows, and running balances. |
| Transactions / ACID | Atomic expense posting and settlement, injected rollback, committed data surviving restart. |
| Concurrency | Shared group-row lock protocol and two-session race demonstrations. |
| Indexing | Keyset history index, ledger lookup index, measured query plans. |
| Constraints | Membership foreign keys, amount checks, unique reversal/idempotency keys, deferred cross-row checks. |
| Distributed / NoSQL | Optional discussion of future replication or analytics; outside the implementation scope. |

## Risks and completion definition

Money and concurrency bugs have priority over visual extras. Lock contention is acceptable for small groups; document the per-group serialization tradeoff. Freeze financial contracts in week 1 and review every schema change together. If time slips, reduce charts and visual polish while retaining all core financial rules.

Complete means all scoped features work, migrations and seeds run on a fresh database, financial invariants pass, the team has reproducible DBMS evidence, and setup/demo documentation matches the delivered application. These documents describe intended work, not an already implemented system.
