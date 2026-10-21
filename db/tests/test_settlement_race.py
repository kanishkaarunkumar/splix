"""Two-connection settlement race. Requires migrations 001/002 and SPLIX_TEST_DATABASE_URL."""
import os
import threading
import uuid

import psycopg
import pytest


def test_only_one_concurrent_settlement_can_clear_same_debt():
    dsn = os.environ.get("SPLIX_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("SPLIX_TEST_DATABASE_URL must point to a disposable database with migrations and seed applied")

    owner, debtor, group_id = (str(uuid.uuid4()) for _ in range(3))
    with psycopg.connect(dsn) as conn:
        conn.execute(
            "INSERT INTO users(id,email,display_name,password_hash) VALUES "
            "(%s,%s,'Owner','$argon2id$fixture'),(%s,%s,'Debtor','$argon2id$fixture')",
            (owner, owner + "@race.test", debtor, debtor + "@race.test"),
        )
        conn.execute("INSERT INTO groups(id,name,owner_id) VALUES(%s,'Race fixture',%s)", (group_id, owner))
        category_id = conn.execute(
            "INSERT INTO categories(name) VALUES(%s) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
            ("Race fixture",),
        ).fetchone()[0]
        conn.execute("INSERT INTO group_members(group_id,user_id) VALUES(%s,%s)", (group_id, debtor))
        conn.execute(
            "SELECT post_expense(%s,%s,%s,current_date,'Race debt',%s,50000,'exact',%s::jsonb)",
            (group_id, owner, owner, category_id,
             '{"shares":[{"user_id":"' + debtor + '","share_paise":50000,"percentage_bps":null}]}'),
        )

    barrier = threading.Barrier(2)
    outcomes = []
    outcome_lock = threading.Lock()

    def settle():
        try:
            with psycopg.connect(dsn) as conn:
                barrier.wait(timeout=10)
                conn.execute(
                    "SELECT post_settlement(%s,%s,current_date,%s,%s,40000,NULL)",
                    (group_id, debtor, debtor, owner),
                )
            result = "committed"
        except psycopg.Error as exc:
            result = "rejected" if exc.sqlstate == "23514" else f"unexpected:{exc.sqlstate}"
        with outcome_lock:
            outcomes.append(result)

    workers = [threading.Thread(target=settle), threading.Thread(target=settle)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=20)

    assert all(not worker.is_alive() for worker in workers), "settlement race hung"
    assert sorted(outcomes) == ["committed", "rejected"]
