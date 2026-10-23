import csv
import io
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app import main
from app.domain.errors import DomainError
from app.service import AppService


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(main, "service", AppService())
    monkeypatch.setattr(main.app.state, "service", main.service)
    with TestClient(main.app) as client:
        yield client


def register(client, name):
    response = client.post(
        "/api/v1/auth/register",
        json={"displayName": name, "email": f"{name}@example.com", "password": "password1"},
    )
    assert response.status_code == 200
    return response.json()


def auth(user):
    return {"Authorization": f"Bearer {user['sessionToken']}"}


def setup_group(client):
    a, b = register(client, "a"), register(client, "b")
    group = client.post("/api/v1/groups", json={"name": "Trip"}, headers=auth(a)).json()
    assert (
        client.post(
            f"/api/v1/groups/{group['id']}/members", json={"email": b["email"]}, headers=auth(a)
        ).status_code
        == 200
    )
    return a, b, group


def expense(a, b, amount="10000", **changes):
    return {
        "title": "Lunch",
        "category": "Food",
        "effectiveDate": "2026-01-31",
        "payerId": a["id"],
        "amountPaise": amount,
        "splitMethod": "equal",
        "participantIds": [a["id"], b["id"]],
    } | changes


def test_empty_groups_requires_auth_and_cookie_cannot_bypass_revocation(client):
    assert client.get("/api/v1/groups").status_code == 401
    a = register(client, "a")
    assert client.get("/api/v1/me", headers=auth(a)).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=auth(a)).status_code == 204
    assert client.get("/api/v1/me", headers=auth(a)).status_code == 401
    assert client.get("/api/v1/groups", cookies={"session": "invalid"}).status_code == 401


def test_session_expiry_and_deleted_account(client):
    a = register(client, "a")
    main.service.sessions[a["sessionToken"]]["expires_at"] = 0
    assert client.get("/api/v1/me", headers=auth(a)).status_code == 401
    a = client.post(
        "/api/v1/auth/login", json={"email": a["email"], "password": "password1"}
    ).json()
    assert client.delete("/api/v1/me", headers=auth(a)).status_code == 200
    assert client.get("/api/v1/me", headers=auth(a)).status_code == 401


def test_owner_approval_and_expiring_revocable_join(client):
    a, b = register(client, "a"), register(client, "b")
    group = client.post("/api/v1/groups", headers=auth(a), json={"name": "Trip"}).json()
    path = f"/api/v1/groups/{group['id']}"
    assert client.post(path + "/join-codes?ttl_seconds=-1", headers=auth(a)).status_code == 422
    code = client.post(path + "/join-codes", headers=auth(a)).json()["code"]
    request = client.post("/api/v1/groups/join", headers=auth(b), json={"code": code}).json()
    assert request["status"] == "pending"
    assert client.get(path + "/balances", headers=auth(b)).status_code == 403
    assert (
        client.post(
            path + f"/join-requests/{request['id']}", headers=auth(b), json={"approve": True}
        ).status_code
        == 403
    )
    assert (
        client.post(
            path + f"/join-requests/{request['id']}", headers=auth(a), json={"approve": True}
        ).status_code
        == 200
    )
    assert client.get(path + "/balances", headers=auth(b)).status_code == 200
    assert (
        client.post(f"/api/v1/groups/join-codes/{code}/revoke", headers=auth(a)).status_code == 200
    )
    assert (
        client.post("/api/v1/groups/join", headers=auth(b), json={"code": code}).status_code == 409
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"amountPaise": "-1"},
        {"amountPaise": "1.5"},
        {"amountPaise": 100},
        {"splitMethod": "unknown"},
        {"effectiveDate": "2026-02-30"},
        {"payerId": "stranger"},
        {"splitMethod": "exact", "shares": [{"userId": "stranger", "amountPaise": "10000"}]},
        {"splitMethod": "weighted", "weights": [{"userId": "stranger", "weight": 1.5}]},
    ],
)
def test_bad_financial_payloads_never_mutate(client, changes):
    a, b, group = setup_group(client)
    before = (len(main.service.events), len(main.service.ledger))
    response = client.post(
        f"/api/v1/groups/{group['id']}/expenses",
        json=expense(a, b, **changes),
        headers=auth(a) | {"Idempotency-Key": "bad"},
    )
    assert response.status_code in (403, 422)
    assert (len(main.service.events), len(main.service.ledger)) == before


def test_correction_rolls_back_and_replays_and_report_restates(client):
    a, b, group = setup_group(client)
    path = f"/api/v1/groups/{group['id']}"
    data = expense(a, b)
    original = client.post(
        path + "/expenses", headers=auth(a) | {"Idempotency-Key": "original"}, json=data
    ).json()
    correction = {
        "replacement": expense(
            a, b, "9000", effectiveDate="2026-02-01", participantIds=["stranger"]
        ),
        "reason": "Wrong amount",
    }
    before = (len(main.service.events), list(main.service.ledger))
    assert (
        client.post(
            path + f"/expenses/{original['id']}/corrections",
            headers=auth(a) | {"Idempotency-Key": "fix"},
            json=correction,
        ).status_code
        == 403
    )
    assert (len(main.service.events), main.service.ledger) == before
    correction["replacement"]["participantIds"] = [a["id"], b["id"]]
    first = client.post(
        path + f"/expenses/{original['id']}/corrections",
        headers=auth(a) | {"Idempotency-Key": "fix"},
        json=correction,
    )
    second = client.post(
        path + f"/expenses/{original['id']}/corrections",
        headers=auth(a) | {"Idempotency-Key": "fix"},
        json=correction,
    )
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(main.service.events) == 3
    january = client.get(path + "/reports/monthly?month=2026-01", headers=auth(a)).json()
    february = client.get(path + "/reports/monthly?month=2026-02", headers=auth(a)).json()
    assert sum(int(x) for x in january["categories"].values()) == 0
    assert february["categories"]["Food"] == "9000"
    assert sum(int(x) for x in february["closingBalances"].values()) == 0


def test_canonical_replay_changed_payload_and_archive_guards(client):
    a, b, group = setup_group(client)
    path = f"/api/v1/groups/{group['id']}"
    data = expense(a, b)
    first = client.post(
        path + "/expenses", headers=auth(a) | {"Idempotency-Key": "same"}, json=data
    )
    assert (
        client.post(
            path + "/expenses",
            headers=auth(a) | {"Idempotency-Key": "same"},
            json=dict(reversed(list(data.items()))),
        ).json()
        == first.json()
    )
    assert (
        client.post(
            path + "/expenses",
            headers=auth(a) | {"Idempotency-Key": "same"},
            json=data | {"title": "Changed"},
        ).status_code
        == 409
    )
    assert client.post(path + "/archive", headers=auth(a)).status_code == 409
    settlement = {
        "fromUserId": b["id"],
        "toUserId": a["id"],
        "amountPaise": "5000",
        "effectiveDate": "2026-02-01",
    }
    assert (
        client.post(
            path + "/settlements", headers=auth(b) | {"Idempotency-Key": "pay"}, json=settlement
        ).status_code
        == 200
    )
    assert client.post(path + "/archive", headers=auth(a)).json()["archived"] is True
    assert (
        client.post(
            path + "/expenses", headers=auth(a) | {"Idempotency-Key": "new"}, json=data
        ).status_code
        == 409
    )
    assert (
        client.post(
            path + "/expenses", headers=auth(a) | {"Idempotency-Key": "same"}, json=data
        ).json()
        == first.json()
    )


def test_recovery_is_non_enumerating_one_use_and_revokes_sessions(client):
    a = register(client, "a")
    one = client.post("/api/v1/auth/recovery/request", json={"email": a["email"]}).json()
    assert (
        one
        == client.post(
            "/api/v1/auth/recovery/request", json={"email": "unknown@example.com"}
        ).json()
        == {"accepted": True}
    )
    token = main.service.provision_recovery(a["id"])
    assert (
        client.post(
            "/api/v1/auth/recovery/confirm", json={"token": token, "password": "newpassword"}
        ).status_code
        == 200
    )
    assert client.get("/api/v1/me", headers=auth(a)).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/recovery/confirm", json={"token": token, "password": "newpassword"}
        ).status_code
        == 401
    )


def test_csv_formula_quoting_and_month_validation(client):
    a, b, group = setup_group(client)
    path = f"/api/v1/groups/{group['id']}"
    for i, category in enumerate(
        ["=1+1", "@SUM(A1)", "-10+20", "+42", "Two, parts", 'A"quote', "line\nbreak"]
    ):
        assert (
            client.post(
                path + "/expenses",
                headers=auth(a) | {"Idempotency-Key": str(i)},
                json=expense(a, b, category=category),
            ).status_code
            == 200
        )
    response = client.get(path + "/reports/monthly?month=2026-01&format=csv", headers=auth(a))
    rows = list(csv.reader(io.StringIO(response.text)))
    keys = [r[1] for r in rows if r[0] == "category"]
    assert "'=1+1" in keys and "'@SUM(A1)" in keys and "'-10+20" in keys and "'+42" in keys
    assert "Two, parts" in keys and 'A"quote' in keys and "line\nbreak" in keys
    assert client.get(path + "/reports/monthly?month=2026-99", headers=auth(a)).status_code == 422


def test_memory_adapter_serializes_competing_settlements_and_same_key(client):
    a, b, group = setup_group(client)
    service = main.service
    service.post_expense(a["id"], group["id"], expense(a, b), "expense")
    payload = {
        "fromUserId": b["id"],
        "toUserId": a["id"],
        "amountPaise": "4000",
        "effectiveDate": "2026-02-01",
    }

    def settle(key):
        try:
            return service.post_settlement(b["id"], group["id"], payload, key)
        except DomainError:
            return "rejected"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(settle, ["one", "two"]))
    assert sum(x == "rejected" for x in outcomes) == 1
    assert len([e for e in service.events.values() if e.kind == "settlement"]) == 1
