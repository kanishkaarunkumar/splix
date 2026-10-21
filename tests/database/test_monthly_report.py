"""PostgreSQL report boundary/restatement checks; use a disposable migrated database."""
import os
import re
import uuid
from datetime import date
from pathlib import Path

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[2]


def execute_query_file(conn, path, params):
    query = Path(path).read_text(encoding="utf-8")
    query = re.sub(r"\$([1-9])", "%s", query)
    return conn.execute(query, params).fetchall()


def test_month_boundary_and_late_correction_restate_reports():
    dsn = os.environ.get("SPLIX_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("SPLIX_TEST_DATABASE_URL must point to a disposable database with migrations and seed applied")

    owner, member_b, member_c, group_id = (str(uuid.uuid4()) for _ in range(4))
    with psycopg.connect(dsn) as conn:
        for user_id in (owner, member_b, member_c):
            conn.execute("INSERT INTO users(id,email,display_name,password_hash) VALUES(%s,%s,%s,'$argon2id$fixture')",
                         (user_id, f"{user_id}@report.invalid", user_id[:8]))
        conn.execute("INSERT INTO groups(id,name,owner_id) VALUES(%s,'Report fixture',%s)", (group_id, owner))
        conn.execute("INSERT INTO group_members(group_id,user_id) VALUES(%s,%s),(%s,%s)",
                     (group_id, member_b, group_id, member_c))
        category_id = conn.execute(
            "INSERT INTO categories(name) VALUES('Report fixture') ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id"
        ).fetchone()[0]
        original = conn.execute(
            "SELECT post_expense(%s,%s,%s,%s,'January fixture',%s,15000,'exact',%s::jsonb)",
            (group_id, owner, owner, date(2026,1,31), category_id,
             '{"shares":[{"user_id":"'+owner+'","share_paise":5000,"percentage_bps":null},'
             '{"user_id":"'+member_b+'","share_paise":5000,"percentage_bps":null},'
             '{"user_id":"'+member_c+'","share_paise":5000,"percentage_bps":null}]}'),
        ).fetchone()[0]
        conn.execute(
            "SELECT * FROM correct_expense(%s,%s,%s,'late correction',%s,'February replacement',%s,9000,'equal',%s,%s::jsonb,NULL)",
            (group_id, original, owner, date(2026,2,1), category_id, owner,
             '{"shares":[{"user_id":"'+owner+'","share_paise":3000,"percentage_bps":null},'
             '{"user_id":"'+member_b+'","share_paise":3000,"percentage_bps":null},'
             '{"user_id":"'+member_c+'","share_paise":3000,"percentage_bps":null}]}'),
        )

    with psycopg.connect(dsn) as conn:
        jan_categories = execute_query_file(conn, ROOT / "db/queries/monthly_category_totals.sql",
                                            (group_id, date(2026,1,1), date(2026,2,1)))
        assert dict((row[1], row[2]) for row in jan_categories)["Report fixture"] == 0
        feb_categories = execute_query_file(conn, ROOT / "db/queries/monthly_category_totals.sql",
                                            (group_id, date(2026,2,1), date(2026,3,1)))
        assert dict((row[1], row[2]) for row in feb_categories)["Report fixture"] == 9000
        feb_members = execute_query_file(conn, ROOT / "db/queries/monthly_report.sql",
                                         (group_id, date(2026,2,1), date(2026,3,1)))
        by_user = {row[0]: row for row in feb_members}
        assert by_user[owner][2:5] == (0, 6000, 6000)
        assert by_user[member_b][2:5] == (0, -3000, -3000)
        assert by_user[member_c][2:5] == (0, -3000, -3000)
        assert sum(row[4] for row in feb_members) == 0
