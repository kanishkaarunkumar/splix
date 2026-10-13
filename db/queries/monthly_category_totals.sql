-- Execute in the same read-only REPEATABLE READ transaction as monthly_report.sql.
-- Parameters: $1 group UUID, $2 month start (date), $3 next month start (date).
WITH month_events AS (
  SELECT id, reverses_event_id FROM financial_events
  WHERE group_id=$1 AND effective_date >= $2 AND effective_date < $3
), expense_amounts AS (
  SELECT x.category_id, x.amount_paise::numeric AS amount
  FROM expenses x JOIN month_events me ON me.id=x.event_id
  UNION ALL
  SELECT original.category_id, -original.amount_paise::numeric
  FROM month_events reversal
  JOIN financial_events re ON re.id=reversal.id AND re.kind='reversal'
  JOIN expenses original ON original.event_id=reversal.reverses_event_id
)
SELECT c.id AS category_id, c.name AS category,
       COALESCE(sum(ea.amount),0)::bigint AS spending_paise
FROM categories c LEFT JOIN expense_amounts ea ON ea.category_id=c.id
GROUP BY c.id,c.name ORDER BY c.name;
