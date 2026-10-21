-- Event-by-event balance trace for one member, useful for explain-my-balance and audits.
-- Parameters: $1 group UUID, $2 member UUID.
WITH event_deltas AS (
  SELECT e.id AS event_id,e.kind,e.effective_date,e.recorded_at,
         COALESCE(sum(l.delta_paise),0)::bigint AS delta_paise
  FROM financial_events e
  LEFT JOIN ledger_entries l ON l.event_id=e.id AND l.user_id=$2 AND l.group_id=$1
  WHERE e.group_id=$1 AND EXISTS(SELECT 1 FROM ledger_entries x WHERE x.event_id=e.id AND x.user_id=$2)
  GROUP BY e.id,e.kind,e.effective_date,e.recorded_at
)
SELECT event_id,kind,effective_date,recorded_at,delta_paise,
       sum(delta_paise) OVER (
         ORDER BY effective_date,recorded_at,event_id
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       )::bigint AS running_balance_paise
FROM event_deltas ORDER BY effective_date,recorded_at,event_id;
