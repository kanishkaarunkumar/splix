from app.service import AppService
def test_idempotent_settlement():
    api = AppService(); a = api.register("a@example.com", "A", "password1"); b = api.register("b@example.com", "B", "password1"); group = api.create_group(a["id"], "Trip"); api.add_member(a["id"], group["id"], b["email"])
    api.post_expense(a["id"], group["id"], {"title": "Lunch", "category": "Food", "effectiveDate": "2026-10-12", "payerId": a["id"], "amountPaise": "10000", "splitMethod": "equal", "participantIds": [a["id"], b["id"]]}, "expense-1")
    payload = {"fromUserId": b["id"], "toUserId": a["id"], "amountPaise": "5000", "effectiveDate": "2026-10-12"}; assert api.post_settlement(b["id"], group["id"], payload, "settlement-1") == api.post_settlement(b["id"], group["id"], payload, "settlement-1")
