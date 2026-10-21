# Monthly reporting and CSV contract

## Delivery status and mobile boundary

The queries exist; the API, CSV serializer, and mobile file/share flow are planned. Person 1 owns SQL/reconciliation fixtures, Person 2 the snapshot/API/CSV implementation, and Person 3 mobile presentation/export. Report only committed financial events. Private payment suggestions and queued offline mutations must not affect totals or be included in group exports. Closed-trip summaries use the same confirmed ledger data.

## API data contract

`GET /api/v1/groups/:id/reports/monthly?month=YYYY-MM&format=json|csv` takes a calendar month in the group's configured timezone. Convert its first local day to a date and use an inclusive start and exclusive next-month start. The SQL in `db/queries/monthly_report.sql` returns each member's opening/closing balance, paid amount, assigned shares, and settlements sent/received; `db/queries/monthly_category_totals.sql` returns category spending. Run both statements in one read-only `REPEATABLE READ` transaction. Serialize every paise integer as a base-10 JSON string.

Expense amounts and shares are restated for corrections: a reversal subtracts the original expense/category/payer/shares on the original effective date. Settlements and settlement reversals are excluded from spending and appear in settlement activity and ledger balance changes. `recorded_at` remains the actual correction time for audit history.

## CSV rules

Use the same rows and totals as JSON. Suggested columns: `user_id,display_name,opening_balance_paise,paid_paise,assigned_share_paise,settlements_sent_paise,settlements_received_paise,period_delta_paise,closing_balance_paise`; category totals can be a second CSV section or a separate download with `category_id,category,spending_paise`. Keep amounts in integer paise to avoid locale-dependent decimal rounding. Quote cells per RFC 4180 (double embedded quotes and quote fields containing comma, quote, CR or LF). Prefix text cells whose first non-whitespace character is `=`, `+`, `-` or `@` with an apostrophe before CSV quoting to reduce spreadsheet formula injection. Do not apply formula escaping to numeric fields generated from validated integer amounts.

## Reconciliation

For the period, each member satisfies `closing = opening + period_delta`. Group closing balances sum to zero. Net expense activity reconciles to paid minus assigned shares; settlement activity reconciles to sent minus received under the project's balance sign. Reversals restate the period of the original event because the reversal effective date equals the original effective date. Late corrections therefore revise historical reports by design.
