"""Wire CLI-managed Neon credentials to a restricted API login without printing secrets."""

import argparse
import json
import os
from pathlib import Path
from secrets import token_hex
from urllib.parse import quote, urlsplit, urlunsplit

from dotenv import dotenv_values
from psycopg.conninfo import conninfo_to_dict

from .migrate import migrate


def setup(source, target):
    values = dotenv_values(source)
    owner = values.get("DATABASE_URL_UNPOOLED")
    pooled = values.get("DATABASE_URL")
    if not owner or not pooled:
        raise RuntimeError(
            "Run neon deploy first: DATABASE_URL and DATABASE_URL_UNPOOLED are required."
        )
    parsed = urlsplit(pooled)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise RuntimeError("Neon DATABASE_URL must be a PostgreSQL connection URL.")
    old = dotenv_values(target) if target.exists() else {}
    password = token_hex(32)
    if old.get("DATABASE_URL"):
        existing = conninfo_to_dict(old["DATABASE_URL"])
        current = conninfo_to_dict(pooled)
        if (
            existing.get("host") == current.get("host")
            and existing.get("dbname") == current.get("dbname")
            and existing.get("user") == "splix_api"
        ):
            password = existing["password"]
    host = parsed.hostname + (f":{parsed.port}" if parsed.port else "")
    runtime = urlunsplit(
        (
            parsed.scheme,
            f"splix_api:{quote(password, safe='')}@{host}",
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )
    migrate(owner, runtime)
    env = {k: v for k, v in old.items() if v is not None}
    env.update(DATABASE_URL=runtime, MIGRATION_DATABASE_URL=owner, SPLIX_REQUIRE_DATABASE="1")
    target.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.chmod(target, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write("# Private API settings derived from Neon CLI environment; do not commit.\n")
        for key, value in env.items():
            stream.write(f"{key}={json.dumps(value)}\n")
    print(f"Configured PostgreSQL runtime and migration variables in {target}; credentials hidden.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, default=Path(".env") if Path(".env").exists() else Path(".env.local")
    )
    parser.add_argument("--target", type=Path, default=Path(".env.api.local"))
    args = parser.parse_args()
    setup(args.source, args.target)


if __name__ == "__main__":
    main()
