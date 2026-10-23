# Splix

Android-first shared expenses for friends, flats and trips. The manual app works without notification access. Optional Active Group Mode produces private suggestions that always require review. Splix records external payments; it does not transfer money.

## Run the API

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync --extra dev
SPLIX_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081 uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**The inherited API uses process-local memory.** Restarting it clears accounts, sessions, financial events and replay results. Use one process for development only. The PostgreSQL migrations are validated separately; the API still needs a PostgreSQL repository before a pilot or deployment. `/health` reports this limitation. Recovery-token delivery also requires a trusted delivery integration; no reset credential is returned to an unauthenticated caller.

## Run the mobile app

Requires Node 24, pnpm 10.31, JDK 17+, and an Android SDK compatible with Expo SDK 58 (compile SDK 37). Native projects are generated from the checked-in Expo configuration, plugins and local module.

```bash
pnpm --dir apps/mobile install --frozen-lockfile
cp apps/mobile/.env.example apps/mobile/.env
# Set EXPO_PUBLIC_API_URL: http://10.0.2.2:8000 for the Android emulator.
pnpm android
```

A physical phone needs a reachable HTTPS API. Android sessions use secure storage; capture and queue share one private SQLite database with backup disabled. Generic Expo Go does not include the capture module. Capture coverage on real payment apps is still a device-validation gate.

For browser UI development only, set the API URL to `http://127.0.0.1:8000` and run `pnpm web`. Preview sessions remain in memory and require sign-in after reload; account-scoped local drafts/queue use IndexedDB. Capture is unavailable there. For static builds run `pnpm build` and serve it with `uv run python scripts/preview.py`.

## Checks

```bash
uv run pytest -q
uv run ruff check app tests
uv run ruff format --check app tests
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --dir apps/mobile exec expo export --platform android --output-dir .dist/android
```

Run SQL migrations `001`, `002`, the seed and `db/tests/financial_invariants.sql` with `psql -v ON_ERROR_STOP=1` against a disposable PostgreSQL 18 database. Set `SPLIX_TEST_DATABASE_URL` to that database to enable report and real-connection race tests. Apply `db/grants/provision_roles.sql`, `db/grants/runtime.sql`, and `db/tests/runtime_privileges.sql` to verify runtime privileges. Production role passwords must be provisioned outside source control.

The automated mobile-sized browser journey is in `apps/mobile/e2e`. Start the API on port 8000 with origin `http://127.0.0.1:8081`, build the preview with that API URL, serve `apps/mobile/dist` on port 8081, then run `pnpm --dir apps/mobile test:e2e`. Install Playwright Chromium or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome executable.

See [mobile guide](docs/mobile-guide.md), [verification evidence and remaining gates](docs/evidence/person-3-handoff.md), [architecture](ARCHITECTURE.md), and [third-party attribution](THIRD_PARTY_NOTICES.md).
