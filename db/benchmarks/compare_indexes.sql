\set ON_ERROR_STOP on
-- Run only in a disposable benchmark DB. Capture output before and after the indexes.
BEGIN;
DROP INDEX IF EXISTS financial_events_history_idx;
DROP INDEX IF EXISTS financial_events_month_idx;
DROP INDEX IF EXISTS ledger_entries_group_user_idx;
ANALYZE financial_events;
ANALYZE ledger_entries;
\echo --- Plans without the proposed indexes ---
\ir query_plans.sql
CREATE INDEX financial_events_history_idx ON financial_events(group_id,recorded_at DESC,id DESC);
CREATE INDEX financial_events_month_idx ON financial_events(group_id,effective_date,id);
CREATE INDEX ledger_entries_group_user_idx ON ledger_entries(group_id,user_id);
ANALYZE financial_events;
ANALYZE ledger_entries;
\echo --- Plans with the proposed indexes ---
\ir query_plans.sql
ROLLBACK;
