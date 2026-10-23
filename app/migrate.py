"""Versioned PostgreSQL migrations. Run as the migration owner, never the API login."""

import argparse
import os
import re
from hashlib import sha256
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

ROOT = Path(__file__).resolve().parents[1]


def migrate(admin_dsn, runtime_dsn=None):
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        # Direct (non-pooler) owner connection: the session lock spans migrations.
        conn.execute("SELECT pg_advisory_lock(742106302)")
        try:
            conn.execute("""CREATE TABLE IF NOT EXISTS splix_schema_migrations (
              name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())""")
            for path in sorted((ROOT / "db/migrations").glob("*.sql")):
                source = path.read_text()
                checksum = sha256(source.encode()).hexdigest()
                previous = conn.execute(
                    "SELECT checksum FROM splix_schema_migrations WHERE name=%s", (path.name,)
                ).fetchone()
                if previous:
                    if previous[0] != checksum:
                        raise RuntimeError(f"Applied migration changed: {path.name}")
                    continue
                # The original SQL files include explicit transaction wrappers.
                source = re.sub(r"(?m)^(?:BEGIN|COMMIT);\s*$", "", source)
                with conn.transaction():
                    conn.execute(source, prepare=False)
                    conn.execute(
                        "INSERT INTO splix_schema_migrations(name,checksum) VALUES(%s,%s)",
                        (path.name, checksum),
                    )
                print(f"Applied {path.name}")
            with conn.transaction():
                conn.execute((ROOT / "db/grants/provision_roles.sql").read_text(), prepare=False)
                conn.execute((ROOT / "db/grants/runtime.sql").read_text(), prepare=False)
                if runtime_dsn:
                    owner = conn.execute("SELECT current_user").fetchone()[0]
                    runtime = conninfo_to_dict(runtime_dsn)
                    name, password = runtime.get("user"), runtime.get("password")
                    if name != "splix_api" or not password:
                        raise RuntimeError(
                            "Runtime DATABASE_URL must use splix_api with a password."
                        )
                    if owner == name:
                        raise RuntimeError("Migration and runtime logins must be different.")
                    # The password remains in database traffic, never stdout or repo files.
                    conn.execute(
                        sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                            sql.Identifier(name), sql.Literal(password)
                        )
                    )
            print("Migrations and restricted runtime grants are current.")
        finally:
            conn.execute("SELECT pg_advisory_unlock(742106302)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    dsn = os.getenv("MIGRATION_DATABASE_URL")
    if not dsn:
        raise SystemExit("Set MIGRATION_DATABASE_URL to the direct owner connection string.")
    if "-pooler." in conninfo_to_dict(dsn).get("host", ""):
        raise SystemExit("Use Neon's direct connection for migrations, not its pooler hostname.")
    migrate(dsn, os.getenv("DATABASE_URL"))


if __name__ == "__main__":
    main()
