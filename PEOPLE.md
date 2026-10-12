# SplitWise+ — Three-Person Work Division

Use Person 1, Person 2, and Person 3 as placeholders until team names are known. Each person owns implementation, tests, documentation, and demonstration of their area. All three share integration and final submission responsibility.

## Ownership

| Person | Primary responsibility | Concrete deliverables | Primary reviewer |
| --- | --- | --- | --- |
| Person 1 — Database and reporting | Relational model, schema integrity, SQL aggregation, query performance | ER diagram; normalization explanation; migrations and seeds; posting/reversal database functions and triggers; balance/report queries; monthly report API and CSV; database integration tests; index and backup/restore evidence | Person 2 |
| Person 2 — API and financial workflows | Authentication, authorization, business rules, transactions, optimization | API scaffold; sessions; group/member endpoints; integer split utilities; expense/settlement/correction services; idempotency handling; debt suggestions; API tests and concurrency harness; OpenAPI contract | Person 1 |
| Person 3 — Frontend and user journeys | Application screens, interaction, client integration, browser verification | Web scaffold; group dashboard; all split forms; balance and settlement screens; history/correction flow; reports/charts; API client; accessible loading/error states; browser tests; demo walkthrough | Person 2 |

Person 1 owns database functions that enforce financial invariants; Person 2 owns the service calls and HTTP behavior around them. Agree on function signatures before either implementation. Person 3 owns report presentation; Person 1 owns the report API/data contract. This prevents duplicated implementations and unclear handoffs.

## Weekly assignments

| Week | Person 1 | Person 2 | Person 3 |
| --- | --- | --- | --- |
| 1 | ERD, migration skeleton, seed fixtures, database environment | API skeleton, auth/session contract, DTOs, CI skeleton | Web skeleton, screen layouts, navigation, API mock fixtures |
| 2 | Membership constraints, posting function, balance query | Auth/groups/expense endpoints, equal-split logic | Login/group screens, equal-split form, balance display |
| 3 | Settlement guards, deferred checks, race-test support | Percent/exact splits, settlement service, idempotency, debt algorithm | Advanced split forms, settlement dialog, debt suggestions |
| 4 | Reversal functions, history/report SQL, report API and CSV | Correction/history endpoints, permissions, integration | Audit history, corrections, monthly charts and downloads |
| 5 | Query plans, invariant tests, rollback and restore evidence | Race tests, API security/error tests, deployment integration | Browser tests, responsive/accessibility checks, integration fixes |
| 6 | Final schema/SQL report and database demo | Setup guide, API documentation, financial-workflow demo | User guide, presentation assembly, full demo and clean-start rehearsal |

## Contracts and handoffs

1. By the end of week 1, all three approve money strings in paise, basis points, balance sign, routes, error format, and sample JSON in the OpenAPI contract.
2. Person 1 gives Person 2 documented database function inputs/outputs and SQL fixtures. Person 2 supplies the authenticated actor; functions validate authorization rather than trusting client-supplied identity.
3. Person 2 gives Person 3 request/response examples and stable error codes. Person 3 can build against fixtures until endpoints are ready.
4. Person 1 and Person 3 jointly verify monthly totals and CSV formatting against the same seeded dataset.
5. Person 2 and Person 1 jointly run real concurrent connections; Person 3 verifies that conflicts are understandable in the interface.

## Collaboration rules

- Use short-lived feature branches and small pull requests. Require one teammate review; financial schema/service changes require review from the other financial owner.
- Never edit an already-applied migration. Add a new numbered migration; coordinate numbering with Person 1.
- Integrate twice a week. Resolve API/schema changes before dependent UI work proceeds.
- Review financial invariants in PRs: exact amounts, zero-sum entries, membership, authorization, atomicity, idempotency, and retained history.
- Run relevant checks before handoff. Schema changes require database tests; workflow changes require API tests; completed journeys require browser tests.
- Record decisions and blockers in the issue tracker. Each issue has one owner, one reviewer, an acceptance criterion, and dependencies.

## Shared workload and assessment

Ownership indicates accountability, not exclusive access. If Person 1's database work blocks others, Person 2 pairs on functions and Person 3 helps with fixtures/report verification. If frontend work becomes the bottleneck, Person 2 helps integrate forms after the financial endpoints stabilize.

Every person must be able to explain the ER model, the balance equation, and one transaction trace. For the final presentation, Person 1 demonstrates SQL/constraints/indexes, Person 2 demonstrates splitting/settlements/concurrency, and Person 3 demonstrates the end-to-end user journey and reports. Keep contribution evidence through reviewed PRs, issues, and individually owned tests.
