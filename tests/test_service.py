from app.service import AppService


def test_idempotent_settlement():
    api = AppService()
    a = api.register("a@example.com", "A", "password1")
    b = api.register("b@example.com", "B", "password1")
    group = api.create_group(a["id"], "Trip")
    api.add_member(a["id"], group["id"], b["email"])
    api.post_expense(
        a["id"],
        group["id"],
        {
            "title": "Lunch",
            "category": "Food",
            "effectiveDate": "2026-10-12",
            "payerId": a["id"],
            "amountPaise": "10000",
            "splitMethod": "equal",
            "participantIds": [a["id"], b["id"]],
        },
        "expense-1",
    )
    payload = {
        "fromUserId": b["id"],
        "toUserId": a["id"],
        "amountPaise": "5000",
        "effectiveDate": "2026-10-12",
    }
    assert api.post_settlement(
        b["id"], group["id"], payload, "settlement-1"
    ) == api.post_settlement(b["id"], group["id"], payload, "settlement-1")


def test_recovery_join_code_and_report():
    api = AppService()
    a = api.register("a@example.com", "A", "password1")
    b = api.register("b@example.com", "B", "password1")
    group = api.create_group(a["id"], "Trip")
    code = api.create_join_code(a["id"], group["id"])["code"]
    request = api.join_group(b["id"], code)
    api.decide_join(a["id"], group["id"], request["id"], True)
    api.post_expense(
        a["id"],
        group["id"],
        {
            "title": "Lunch",
            "category": "Food",
            "effectiveDate": "2026-10-12",
            "payerId": a["id"],
            "amountPaise": "10000",
            "splitMethod": "equal",
            "participantIds": [a["id"], b["id"]],
        },
        "expense-2",
    )
    report = api.monthly_report(a["id"], group["id"], "2026-10")
    assert report["categories"]["Food"] == "10000"
    assert "category,Food,10000" in api.report_csv(report)
