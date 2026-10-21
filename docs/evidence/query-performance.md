# Query performance evidence

## Planned workload

Use `db/benchmarks/seed_10k_history.sql` to write 10,000 financial events through the posting function, then capture `db/benchmarks/query_plans.sql` on history keyset, balance aggregation, and monthly effective-date range queries. The comparison script runs without the proposed indexes and with them in one transaction, then rolls back its DDL. Run only in a disposable benchmark database.

## Measurements

| PostgreSQL version / environment | Rows | Query | Index state | Planning/execution time | Buffers | Plan observation |
| --- | ---: | --- | --- | --- | --- | --- |
| Not measured — no PostgreSQL/Docker available in current workspace | — | History | Pending | Pending | Pending | Pending |
| Not measured — no PostgreSQL/Docker available in current workspace | — | Balances | Pending | Pending | Pending | Pending |
| Not measured — no PostgreSQL/Docker available in current workspace | — | Monthly range | Pending | Pending | Pending | Pending |

No speedup is claimed. Preserve the raw `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` output and hardware/database settings when this evidence is collected.
