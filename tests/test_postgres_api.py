"""API persistence/replay tests against a disposable migrated PostgreSQL database."""

import os
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from hashlib import sha256
from uuid import uuid4

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app.domain.errors import DomainError
from app.main import create_app
from app.postgres import PostgresService


@pytest.fixture()
def dsn():
    value = os.getenv("SPLIX_TEST_RUNTIME_DATABASE_URL")
    if not value:
        pytest.skip("SPLIX_TEST_RUNTIME_DATABASE_URL must use a disposable migrated runtime login")
    return value


@pytest.fixture()
def client(dsn):
    with TestClient(create_app(dsn)) as client:
        yield client


def register(client, name):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid4()}@example.com", "displayName": name, "password": "password1"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def headers(user, key=None):
    return {
        "Authorization": "Bearer " + user["sessionToken"],
        **({"Idempotency-Key": key} if key else {}),
    }


def group(client):
    a, b = register(client, "Owner"), register(client, "Member")
    response = client.post("/api/v1/groups", headers=headers(a), json={"name": "Database trip"})
    assert response.status_code == 200, response.text
    g = response.json()
    path = f"/api/v1/groups/{g['id']}"
    response = client.post(path + "/members", headers=headers(a), json={"email": b["email"]})
    assert response.status_code == 200, response.text
    return a, b, path, g


def expense(a, b, **changes):
    return {
        "amountPaise": "10001",
        "payerId": a["id"],
        "title": "Lunch",
        "category": "Food",
        "effectiveDate": "2026-01-31",
        "splitMethod": "equal",
        "participantIds": [a["id"], b["id"]],
        "note": "Saved note",
    } | changes


@contextmanager
def running_server(dsn, port):
    env = os.environ.copy()
    env["DATABASE_URL"] = dsn
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as client:
            deadline = time.monotonic() + 20
            while True:
                try:
                    if client.get("/health").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                if process.poll() is not None or time.monotonic() > deadline:
                    raise AssertionError("API process did not start")
                time.sleep(0.1)
            yield client
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        if process.stderr:
            process.stderr.close()


def test_actual_process_restart_preserves_sessions_groups_events_presets_and_replay(dsn):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with running_server(dsn, port) as first:
        a, b, path, g = group(first)
        data = expense(a, b)
        posted = first.post(path + "/expenses", headers=headers(a, "restart-write"), json=data)
        assert posted.status_code == 200, posted.text
        original = posted.json()
        balances = first.get(path + "/balances", headers=headers(a)).json()
        preset = first.post(
            path + "/presets",
            headers=headers(a),
            json={
                "name": "Housemates",
                "splitMethod": "weighted",
                "participantIds": [a["id"], b["id"]],
                "weights": [{"userId": a["id"], "weight": 1}, {"userId": b["id"], "weight": 2}],
            },
        )
        assert preset.status_code == 200, preset.text
        updated = first.patch(
            "/api/v1/me", headers=headers(a), json={"displayName": "Renamed owner"}
        )
        assert updated.status_code == 200
    with running_server(dsn, port) as second:
        assert second.get("/health").json()["persistent"] is True
        assert second.get("/api/v1/me", headers=headers(a)).json()["displayName"] == "Renamed owner"
        assert any(
            row["id"] == g["id"] for row in second.get("/api/v1/groups", headers=headers(a)).json()
        )
        assert second.get(path + "/balances", headers=headers(a)).json() == balances
        replay = second.post(
            path + "/expenses",
            headers=headers(a, "restart-write"),
            json=dict(reversed(list(data.items()))),
        )
        assert replay.status_code == 200, replay.text
        assert replay.json() == original
        assert len(second.get(path + "/history", headers=headers(a)).json()["items"]) == 1
        assert (
            second.get(path + "/presets", headers=headers(a)).json()[0]["id"] == preset.json()["id"]
        )
        assert (
            second.post(
                path + "/expenses",
                headers=headers(a, "restart-write"),
                json=data | {"title": "Different"},
            ).status_code
            == 409
        )
        assert second.post("/api/v1/auth/logout", headers=headers(a)).status_code == 204
    with running_server(dsn, port) as third:
        assert third.get("/api/v1/me", headers=headers(a)).status_code == 401
        assert (
            third.post(
                "/api/v1/auth/login", json={"email": a["email"], "password": "password1"}
            ).status_code
            == 200
        )
    # Only a token digest is stored, never the credential sent to the phone.
    with psycopg.connect(dsn) as conn:
        hashes = [
            bytes(row[0])
            for row in conn.execute("SELECT token_hash FROM sessions WHERE user_id=%s", (a["id"],))
        ]
    assert sha256(a["sessionToken"].encode()).digest() in hashes
    assert a["sessionToken"].encode() not in hashes


def test_financial_splits_correction_rollback_reports_and_archive(client):
    a, b, path, _ = group(client)
    for key, changes in [
        (
            "percentage",
            {
                "splitMethod": "percentage",
                "percentages": [
                    {"userId": a["id"], "basisPoints": 3333},
                    {"userId": b["id"], "basisPoints": 6667},
                ],
            },
        ),
        (
            "weighted",
            {
                "splitMethod": "weighted",
                "weights": [{"userId": a["id"], "weight": 1}, {"userId": b["id"], "weight": 3}],
            },
        ),
        (
            "exact",
            {
                "splitMethod": "exact",
                "shares": [
                    {"userId": a["id"], "amountPaise": "1"},
                    {"userId": b["id"], "amountPaise": "10000"},
                ],
            },
        ),
    ]:
        response = client.post(
            path + "/expenses", headers=headers(a, key), json=expense(a, b, **changes)
        )
        assert response.status_code == 200, response.text
        assert sum(int(s["amountPaise"]) for s in response.json()["shares"]) == 10001
    original = client.post(
        path + "/expenses", headers=headers(a, "original"), json=expense(a, b)
    ).json()
    first_page = client.get(path + "/history?limit=2", headers=headers(a)).json()
    second_page = client.get(path + "/history?limit=2&offset=2", headers=headers(a)).json()
    assert first_page["nextOffset"] == 2
    assert len(first_page["items"]) == len(second_page["items"]) == 2
    assert {e["id"] for e in first_page["items"]}.isdisjoint(e["id"] for e in second_page["items"])
    assert client.get(path + "/history?q=not-a-match", headers=headers(a)).json()["items"] == []
    before = client.get(path + "/history", headers=headers(a)).json()
    replacement = expense(
        a, b, amountPaise="9000", effectiveDate="2026-02-01", participantIds=[str(uuid4())]
    )
    body = {"reason": "Wrong amount/date", "replacement": replacement}
    route = path + f"/expenses/{original['id']}/corrections"
    assert client.post(route, headers=headers(a, "correction"), json=body).status_code == 403
    assert client.get(path + "/history", headers=headers(a)).json() == before
    body["replacement"]["participantIds"] = [a["id"], b["id"]]
    corrected = client.post(route, headers=headers(a, "correction"), json=body)
    assert corrected.status_code == 200, corrected.text
    assert (
        client.post(route, headers=headers(a, "correction"), json=body).json() == corrected.json()
    )
    january = client.get(path + "/reports/monthly?month=2026-01", headers=headers(a)).json()
    february = client.get(path + "/reports/monthly?month=2026-02", headers=headers(a)).json()
    assert january["categories"]["Food"] == "30003"
    assert february["categories"]["Food"] == "9000"
    assert sum(map(int, february["closingBalances"].values())) == 0
    assert "Saved note" in str(client.get(path + "/history", headers=headers(a)).json())
    assert client.post(path + "/archive", headers=headers(a)).status_code == 409
    suggestions = client.get(path + "/settlement-suggestions", headers=headers(a)).json()[
        "suggestions"
    ]
    for i, payment in enumerate(suggestions):
        response = client.post(
            path + "/settlements",
            headers=headers(a, f"pay-{i}"),
            json=payment | {"effectiveDate": "2026-02-02"},
        )
        assert response.status_code == 200, response.text
    assert client.post(path + "/archive", headers=headers(a)).json()["archived"] is True
    assert (
        client.post(route, headers=headers(a, "correction"), json=body).json() == corrected.json()
    )
    assert (
        client.post(
            path + "/expenses", headers=headers(a, "after-archive"), json=expense(a, b)
        ).status_code
        == 409
    )


def test_two_independent_workers_serialize_same_key_and_competing_settlements(dsn, client):
    a, b, _path, g = group(client)
    one, two = PostgresService(dsn), PostgresService(dsn)
    one.open()
    two.open()
    try:
        data = expense(a, b, amountPaise="10000")
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(
                pool.map(
                    lambda service: service.post_expense(a["id"], g["id"], data, "same-key"),
                    [one, two],
                )
            )
        assert responses[0] == responses[1]
        assert len(one.history(a["id"], g["id"])) == 1
        payment = {
            "fromUserId": b["id"],
            "toUserId": a["id"],
            "amountPaise": "4000",
            "effectiveDate": "2026-02-01",
        }

        def settle(pair):
            service, key = pair
            try:
                return service.post_settlement(b["id"], g["id"], payment, key)
            except DomainError:
                return "rejected"

        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(settle, [(one, "one"), (two, "two")]))
        assert result.count("rejected") == 1
        assert sorted(int(r["balancePaise"]) for r in one.balances(a["id"], g["id"])) == [
            -1000,
            1000,
        ]
    finally:
        one.close()
        two.close()


def test_join_approval_and_revocation_survive_new_app(client, dsn):
    a, b = register(client, "Owner"), register(client, "Applicant")
    g = client.post("/api/v1/groups", headers=headers(a), json={"name": "Invites"}).json()
    path = f"/api/v1/groups/{g['id']}"
    code = client.post(path + "/join-codes", headers=headers(a)).json()["code"]
    request = client.post("/api/v1/groups/join", headers=headers(b), json={"code": code}).json()
    with TestClient(create_app(dsn)) as other:
        assert other.get(path + "/balances", headers=headers(b)).status_code == 403
        pending = other.get(path + "/join-requests", headers=headers(a)).json()
        assert pending[0]["id"] == request["id"]
        assert (
            other.post(
                path + f"/join-requests/{request['id']}", headers=headers(a), json={"approve": True}
            ).status_code
            == 200
        )
        assert other.get(path + "/balances", headers=headers(b)).status_code == 200
        assert (
            other.post(
                "/api/v1/groups/join-codes/" + code + "/revoke", headers=headers(a)
            ).status_code
            == 200
        )
    c = register(client, "Third")
    assert (
        client.post("/api/v1/groups/join", headers=headers(c), json={"code": code}).status_code
        == 409
    )


def test_reset_and_account_deletion_are_durable_and_retain_audit(client, dsn):
    a, b, path, _ = group(client)
    assert (
        client.post(
            path + "/expenses", headers=headers(a, "expense"), json=expense(a, b)
        ).status_code
        == 200
    )
    token = client.app.state.service.provision_recovery(a["id"])
    with TestClient(create_app(dsn)) as other:
        response = other.post(
            "/api/v1/auth/recovery/confirm", json={"token": token, "password": "newpassword1"}
        )
        assert response.status_code == 200, response.text
        assert other.get("/api/v1/me", headers=headers(a)).status_code == 401
        assert (
            other.post(
                "/api/v1/auth/recovery/confirm", json={"token": token, "password": "newpassword1"}
            ).status_code
            == 401
        )
        user = other.post(
            "/api/v1/auth/login", json={"email": a["email"], "password": "newpassword1"}
        ).json()
        assert other.delete("/api/v1/me", headers=headers(user)).status_code == 200
    assert client.get("/api/v1/me", headers=headers(user)).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": a["email"], "password": "newpassword1"}
        ).status_code
        == 401
    )
    history = client.get(path + "/history", headers=headers(b)).json()["items"]
    assert len(history) == 1
    members = client.get("/api/v1/groups", headers=headers(b)).json()[0]["members"]
    assert next(m for m in members if m["id"] == a["id"])["displayName"] == "Deleted user"


def test_runtime_cannot_write_ledger_directly_and_owner_cannot_run_api(dsn):
    with psycopg.connect(dsn) as conn:
        for table in (
            "financial_events",
            "expenses",
            "expense_shares",
            "settlements",
            "ledger_entries",
        ):
            assert (
                conn.execute(
                    "SELECT has_table_privilege(current_user,%s,'INSERT,UPDATE,DELETE')", (table,)
                ).fetchone()[0]
                is False
            )
    admin = os.getenv("SPLIX_TEST_DATABASE_URL")
    if admin:
        service = PostgresService(admin)
        with pytest.raises(RuntimeError, match="restricted API login"):
            service.open()
