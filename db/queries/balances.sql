-- Current balance by member. Positive means receive; negative means owe.
SELECT m.user_id, u.display_name, COALESCE(sum(l.delta_paise), 0)::bigint AS balance_paise
FROM group_members AS m
JOIN users AS u ON u.id = m.user_id
LEFT JOIN ledger_entries AS l USING (group_id, user_id)
WHERE m.group_id = $1
GROUP BY m.user_id, u.display_name
ORDER BY m.user_id;

-- Group zero-sum integrity diagnostic (must return no rows).
SELECT group_id, sum(balance_paise) AS group_net_paise
FROM member_balances GROUP BY group_id HAVING sum(balance_paise) <> 0;
