\set ON_ERROR_STOP on
-- Pass group UUID from seed_10k_history.sql as psql variable :group_id.
ANALYZE financial_events;
ANALYZE ledger_entries;
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT id,kind,effective_date,recorded_at FROM financial_events
WHERE group_id=:'group_id'::uuid ORDER BY recorded_at DESC,id DESC LIMIT 25;
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT m.user_id,COALESCE(sum(l.delta_paise),0)::bigint
FROM group_members m LEFT JOIN ledger_entries l USING(group_id,user_id)
WHERE m.group_id=:'group_id'::uuid GROUP BY m.user_id;
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT id FROM financial_events WHERE group_id=:'group_id'::uuid
AND effective_date>=date '2025-03-01' AND effective_date<date '2025-04-01'
ORDER BY effective_date,id;
