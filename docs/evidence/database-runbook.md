# Local PostgreSQL runbook

## Fresh database setup

1. Install Docker Desktop with Compose and copy `.env.example` to `.env`; replace the local-only password.
2. Run `./db/scripts/apply-migrations.ps1`. It starts the local PostgreSQL 18 container, applies numbered migrations in order, then seeds categories/demo identities/group membership.
3. Run `./db/scripts/apply-runtime-grants.ps1`, then set the login password interactively using its printed `\password splix_api` command. The API role has read-only table access, controlled function execution, and narrowly scoped idempotency writes; it has no direct financial ledger DML.
4. Run database invariants with `Get-Content -Raw db/tests/financial_invariants.sql | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U splix_migrator -d splix -f -`.
5. Run grant assertions with `Get-Content -Raw db/tests/runtime_privileges.sql | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U splix_migrator -d splix -f -`.
6. For Python concurrency/report tests, install the project development extras and set `SPLIX_TEST_DATABASE_URL` to a disposable migrated PostgreSQL database. Run `pytest tests/database db/tests`.

The SQL invariant fixture wraps all data in a transaction and rolls it back. The Python tests intentionally use a disposable test database and leave committed UUID-isolated fixture rows; recreate that database between full runs.

## Current evidence status

No database setup or SQL test has been executed in this workspace because Docker, `psql`, `pg_ctl`, and a PostgreSQL service are absent. This runbook and tests are reproducibility artifacts, not claimed execution results. Query plans, restore counts, and observed concurrency outcomes remain pending until run on the team's PostgreSQL host.

## Performance evidence

For an isolated benchmark database, run `db/benchmarks/seed_10k_history.sql` to create a group and 10,000 posted events; copy the group UUID from the PostgreSQL notice. Then run `db/benchmarks/query_plans.sql` with `-v group_id=<UUID>`. `compare_indexes.sql` drops and recreates only the three proposed indexes inside a transaction and rolls back; never run it on the team's shared or production database. Save the full PostgreSQL version, row counts, workload, and `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` output in `docs/evidence/query-performance.md` after execution.

## Backup and restore

Create a custom-format dump inside the container with `docker compose exec -T db pg_dump --format=custom --no-owner -U splix_migrator -d splix -f /tmp/splitwise.dump`, then copy it with `docker compose cp db:/tmp/splitwise.dump splitwise.dump`. Restore into a newly created empty database (never over the source): copy the file to `/tmp/restore.dump` in the container with `docker compose cp splitwise.dump db:/tmp/restore.dump`, then run `docker compose exec -T db pg_restore --exit-on-error --no-owner -U splix_migrator -d splix_restore /tmp/restore.dump`. Record PostgreSQL versions and counts for users, groups, events, and ledger rows; run the zero-sum reconciliation query documented in `docs/evidence/query-performance.md` and require no non-zero group sums. Actual backup/restore is pending because no database service is available here.
