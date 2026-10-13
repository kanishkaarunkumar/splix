# Database design evidence

## Entity relationships

The ERD is in [ARCHITECTURE.md](../../ARCHITECTURE.md). Identity (`users`), group membership, event metadata, expense/settlement details, participant shares, and ledger entries have separate responsibilities. The composite group keys on financial children ensure that an event, payer, participant, settlement endpoint, actor, and ledger member all belong to the same group.

## Normalization and intentional projections

User identity, group membership, expense metadata, and expense shares are stored once in their own relations. A share row is the participant junction, so each expense can have any member subset without repeating member columns. Categories are reference data. Event metadata is shared by expenses, settlements, and reversals.

`ledger_entries` is an intentional immutable accounting projection: it makes balance aggregation simple and preserves the exact posting made at the time. Its deferred validator checks entries against the source expense/shares or settlement. It is not independently editable through the runtime role. `groups.version` is an intentional serialization/version counter for financial writes, not a cached balance. Current balances are derived from the ledger.

## Financial invariants

- Money is signed/integer paise (`BIGINT`); row-level checks reject nonpositive source amounts and negative shares.
- Group-scoped composite foreign keys protect membership and financial history.
- A deferred constraint trigger validates complete event details, share totals, zero-sum ledger entries and reversal equality at commit.
- Writes acquire the group row lock first, then recheck authorization and live balance conditions before insertion. Application roles should get SELECT and EXECUTE only; migration owner retains table mutation rights.
- A monthly report must run all component queries in one read-only `REPEATABLE READ` transaction. Expense, share, ledger and settlement aggregates should be computed separately before joining to prevent fan-out.

## Index rationale

`financial_events_history_idx` supports descending group history keysets; `financial_events_month_idx` supports monthly effective-date ranges; `ledger_entries_group_user_idx` supports per-member balance aggregation; and `group_members_user_group_idx` supports a user's group list. Composite primary keys already index their leftmost lookup columns. Additional indexes should be justified with `EXPLAIN (ANALYZE, BUFFERS)` over a representative seeded history set.

## Backup and restore evidence

For a local PostgreSQL instance, capture a custom-format backup with `pg_dump --format=custom --file=splitwise.dump "$DATABASE_URL"`. Restore into a newly created empty database using `pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" splitwise.dump`, then run the balance zero-sum diagnostic in `db/queries/balances.sql` and compare row counts for users, groups, events and ledger entries. Record commands, PostgreSQL version, timestamps and observed counts here after running against the team's actual database. No backup/restore run is claimed by this document.
