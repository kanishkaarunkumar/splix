# Person 1 database handoff

## Mobile revision and remaining ownership

This records existing SQL, not a completed application. The product is now Android-first Splix; [PEOPLE.md](../../PEOPLE.md) assigns remaining work. Person 1 validates/extends the database and owns native capture; Person 2 owns every HTTP service including reporting/CSV; Person 3 owns mobile UI and offline queue orchestration. Persons 1 and 3 agree shared local storage before implementation. Private capture drafts never become server financial records without review.

New migrations must cover weighted shares, presets, notes, lifecycle/join/session extensions as agreed, archive checks in controlled write functions, and a linked atomic correction contract. Current `post_expense` accepts only equal/percentage/exact and has no correction-link parameter. Existing `001` must not be rewritten to imply these extensions exist.

## Owned artifacts

- `db/migrations/001_financial_schema.sql`: normalized tables, scoped keys, indexes, derived balance view, immutable-row triggers, deferred integrity validator, and controlled post/reverse functions.
- `db/seeds/001_demo.sql`: categories and three demo members/group matching the project plan.
- `db/queries/balances.sql`, `monthly_report.sql`, `monthly_category_totals.sql`: balance and monthly aggregate SQL.
- `docs/evidence/database-design.md` and `reporting-and-csv.md`: ER/normalization rationale, index rationale, API data shape, CSV rules and backup/restore procedure.

## Function contracts for Person 2

Call inside the service's checked-out connection and surrounding transaction. Each function takes the group lock itself before inspecting or changing financial state. Actor IDs must come from the authenticated session.

- `post_expense(group_id, actor_id, payer_id, effective_date, title, category_id, amount_paise, split_method, payload)` returns the new event UUID. `payload` shape: `{"shares":[{"user_id":"uuid","share_paise":123,"percentage_bps":null}]}`. Use percentage basis points on every row only for `split_method="percentage"`; otherwise pass null weights. Final allocated paise must already be deterministic and sum exactly to amount.
- `post_settlement(group_id, actor_id, effective_date, from_user_id, to_user_id, amount_paise, note)` returns the new event UUID. The database rechecks membership, permissions, current balances, and max payable amount under the group lock.
- `reverse_financial_event(group_id, original_event_id, actor_id, reason)` returns a reversal event UUID and copies exact negative ledger entries. Its unique reversal key rejects duplicate attempts.

Financial writes update `groups.version`. Map SQLSTATE `42501` to authorization failure, `23505`/`23514` to conflict or domain validation as appropriate, and never return raw database text to the client. Idempotency remains an API/service responsibility in this migration; the request record table is provided for atomic persistence by Person 2.

## Deployment grants

Create a non-login migration owner and a separate API role. Grant the API role SELECT on required tables/views and EXECUTE on these three functions; do not grant it direct INSERT, UPDATE, or DELETE on financial tables. Revoke `PUBLIC` execution is already part of the migration. Keep `search_path` pinned in each `SECURITY DEFINER` function and schema-qualify objects if deployment uses a schema other than `public`.

## Verification status

The SQL files were reviewed for contract consistency and `git diff --check` was run. No PostgreSQL server is configured in this workspace, so migration application, integration/concurrency tests, query-plan measurements, and backup/restore evidence still need to be captured against the team's database before submission.
