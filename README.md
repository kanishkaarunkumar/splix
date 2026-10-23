# Splix

Android-first shared expenses for friends, flats and trips. The manual app works without notification access. Optional Active Group Mode produces private suggestions that always require review. Splix records external payments; it does not transfer money.

## Run the API

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync --extra dev
neon deploy
npm run db:setup
SPLIX_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081 npm run api
```

The API uses PostgreSQL when `DATABASE_URL` is configured. Accounts, hashed sessions, groups, joins, presets, events, ledger entries and idempotency responses survive API restarts. `npm run db:setup` reads Neon's CLI-managed environment, applies checksummed migrations with the direct owner connection, provisions a restricted API login, and writes private settings to `.env.api.local`. `npm run api` loads that file. See [Neon and Render setup](docs/neon-deployment.md).

Without a database, local development can use the memory reference adapter. Render and `SPLIX_REQUIRE_DATABASE=1` require PostgreSQL and fail startup rather than silently lose data. `/health` reports actual storage and `persistent` status. `productionReady` stays false: recovery delivery, abuse controls and device/release checks remain separate work.

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

For disposable PostgreSQL 18 testing, set `MIGRATION_DATABASE_URL` to the owner connection and `DATABASE_URL` to a new `splix_api` runtime connection, then run `uv run python -m app.migrate`. Set `SPLIX_TEST_DATABASE_URL` to the owner connection and `SPLIX_TEST_RUNTIME_DATABASE_URL` to the restricted connection to enable API restart and database tests. Apply the optional seed and invariant/grant assertions with `psql -v ON_ERROR_STOP=1`. Production passwords stay outside source control.

The automated mobile-sized browser journey is in `apps/mobile/e2e`. Start the API on port 8000 with origin `http://127.0.0.1:8081`, build the preview with that API URL, serve `apps/mobile/dist` on port 8081, then run `pnpm --dir apps/mobile test:e2e`. Install Playwright Chromium or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome executable.

See [mobile guide](docs/mobile-guide.md), [verification evidence and remaining gates](docs/evidence/person-3-handoff.md), [architecture](ARCHITECTURE.md), and [third-party attribution](THIRD_PARTY_NOTICES.md).
