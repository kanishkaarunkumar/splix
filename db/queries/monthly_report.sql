-- Parameters: $1 group UUID, $2 first day of month (date), $3 first day of next month (date).
-- Expense reversals are attributed to original category, payer and shares; settlements are separate.
WITH month_events AS (
  SELECT e.* FROM financial_events e
  WHERE e.group_id = $1 AND e.effective_date >= $2 AND e.effective_date < $3
),
expense_effects AS (
  SELECT x.category_id, x.payer_id, x.event_id, x.amount_paise::numeric AS signed_amount,
         1::numeric AS occurrence_sign
  FROM expenses x JOIN month_events me ON me.id = x.event_id
  UNION ALL
  SELECT original.category_id, original.payer_id, original.event_id,
         -original.amount_paise::numeric, -1::numeric
  FROM month_events reversal
  JOIN expenses original ON original.event_id = reversal.reverses_event_id
  WHERE reversal.kind = 'reversal'
),
category_totals AS (
  SELECT c.id AS category_id, c.name AS category,
         COALESCE(sum(ee.signed_amount), 0)::bigint AS spending_paise
  FROM categories c LEFT JOIN expense_effects ee ON ee.category_id = c.id
  GROUP BY c.id, c.name
),
member_activity AS (
  SELECT m.user_id,
         COALESCE(sum(CASE WHEN ee.occurrence_sign = 1 THEN x.amount_paise
                           WHEN ee.occurrence_sign = -1 THEN -x.amount_paise END), 0)::bigint AS paid_paise
  FROM group_members m
  LEFT JOIN expense_effects ee ON ee.payer_id = m.user_id
  LEFT JOIN expenses x ON x.event_id = ee.event_id
  WHERE m.group_id = $1 GROUP BY m.user_id
),
share_effects AS (
  SELECT s.user_id, s.share_paise::numeric AS signed_share
  FROM expense_shares s JOIN month_events me ON me.id = s.expense_event_id
  UNION ALL
  SELECT s.user_id, -s.share_paise::numeric
  FROM month_events reversal
  JOIN expense_shares s ON s.expense_event_id = reversal.reverses_event_id
  WHERE reversal.kind = 'reversal'
),
member_shares AS (
  SELECT user_id, sum(signed_share)::bigint AS share_paise FROM share_effects GROUP BY user_id
),
settlement_activity AS (
  SELECT s.from_user_id, s.to_user_id, s.amount_paise::numeric AS signed_amount
  FROM settlements s JOIN month_events me ON me.id = s.event_id
  UNION ALL
  SELECT s.from_user_id, s.to_user_id, -s.amount_paise::numeric
  FROM month_events reversal JOIN settlements s ON s.event_id = reversal.reverses_event_id
  WHERE reversal.kind = 'reversal'
),
opening AS (
  SELECT user_id, COALESCE(sum(delta_paise), 0)::bigint AS opening_balance_paise
  FROM ledger_entries l JOIN financial_events e ON e.id = l.event_id
  WHERE l.group_id = $1 AND e.effective_date < $2 GROUP BY user_id
),
period_delta AS (
  SELECT l.user_id, sum(l.delta_paise)::bigint AS delta_paise
  FROM ledger_entries l JOIN month_events me ON me.id = l.event_id
  GROUP BY l.user_id
)
SELECT m.user_id, u.display_name,
       COALESCE(o.opening_balance_paise, 0)::bigint AS opening_balance_paise,
       COALESCE(pd.delta_paise, 0)::bigint AS period_delta_paise,
       (COALESCE(o.opening_balance_paise, 0) + COALESCE(pd.delta_paise, 0))::bigint AS closing_balance_paise,
       COALESCE(ma.paid_paise, 0)::bigint AS paid_paise,
       COALESCE(ms.share_paise, 0)::bigint AS assigned_share_paise,
       COALESCE((SELECT sum(sa.signed_amount) FROM settlement_activity sa WHERE sa.from_user_id = m.user_id), 0)::bigint AS settlements_sent_paise,
       COALESCE((SELECT sum(sa.signed_amount) FROM settlement_activity sa WHERE sa.to_user_id = m.user_id), 0)::bigint AS settlements_received_paise
FROM group_members m JOIN users u ON u.id = m.user_id
LEFT JOIN opening o ON o.user_id = m.user_id
LEFT JOIN period_delta pd ON pd.user_id = m.user_id
LEFT JOIN member_activity ma ON ma.user_id = m.user_id
LEFT JOIN member_shares ms ON ms.user_id = m.user_id
WHERE m.group_id = $1 ORDER BY m.user_id;

-- Category totals query (execute in the same read-only REPEATABLE READ transaction as member totals).
-- Keep category aggregation separate from shares/ledger joins to avoid fan-out multiplication.
