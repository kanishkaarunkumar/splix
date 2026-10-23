import os
import re
import statistics
import time
from pathlib import Path

import psycopg

with psycopg.connect(os.environ["SPLIX_TEST_DATABASE_URL"]) as conn:
    conn.execute("ANALYZE")
    group = conn.execute(
        "SELECT id FROM groups WHERE name='10k history benchmark' ORDER BY created_at DESC LIMIT 1"
    ).fetchone()[0]
    print("PostgreSQL:", conn.execute("SHOW server_version").fetchone()[0])
    print("10k group:", group)
    print(
        "Workload:",
        conn.execute(
            "SELECT count(*) FROM financial_events WHERE group_id=%s", (group,)
        ).fetchone()[0],
    )
    queries = {
        "history": (
            "SELECT id,kind,effective_date,recorded_at FROM financial_events WHERE group_id=%s ORDER BY recorded_at DESC,id DESC LIMIT 25",
            (group,),
        ),
        "balances": ("SELECT * FROM member_balances WHERE group_id=%s", (group,)),
    }
    for file in ["monthly_report", "monthly_category_totals"]:
        query = re.sub(r"--[^\n]*", "", Path(f"db/queries/{file}.sql").read_text())
        positions = []

        def replace(match, positions=positions):
            positions.append(int(match[1]) - 1)
            return "%s"

        query = re.sub(r"\$([1-9])", replace, query)
        params = [group, "2025-01-01", "2025-02-01"]
        queries[file] = (query, tuple(params[i] for i in positions))
    for name, (query, params) in queries.items():
        results = []
        for i in range(30):
            start = time.perf_counter()
            conn.execute(query, params).fetchall()
            results.append((time.perf_counter() - start) * 1000)
        results.sort()
        print(
            f"\n{name}: n=30, client wall p50={statistics.median(results):.3f}ms p95={results[28]:.3f}ms"
        )
        for row in conn.execute("EXPLAIN (ANALYZE,BUFFERS) " + query, params):
            print(row[0])
