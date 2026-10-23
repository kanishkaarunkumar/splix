# Neon PostgreSQL and Render

FastAPI stays on Render. Neon supplies PostgreSQL only; mobile clients call the API and never receive database credentials. Existing account/password/session flows are retained. `neon.ts` leaves managed Neon Auth disabled.

## Setup

The requested CLI workflow selected organization `org-autumn-river-45281356`, project `withered-morning-65295379`, and branch `production`:

```bash
npm i -g neon@latest
neon init -y --org-id org-autumn-river-45281356 --project-id withered-morning-65295379 --branch production --services postgres
neon deploy
npm run db:setup
```

Finish browser authentication when requested. `neon deploy` manages `.env.local` (or an existing `.env`), including pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED`. These CLI variables retain the owner credentials. The Python setup command derives a separate restricted API login, runs versioned migrations, and saves **DATABASE_URL**, **MIGRATION_DATABASE_URL** and **SPLIX_REQUIRE_DATABASE** to `.env.api.local`. Repeating setup for the same endpoint preserves the runtime password. Env files are ignored by Git; the runtime file is mode 0600.

Migrations use the direct connection and a session advisory lock. Each migration and its SHA-256 journal entry commit together. Changed applied files fail validation. Migrations neither seed financial demo data nor drop existing tables. A manually provisioned schema without a journal needs explicit reconciliation; never delete it to bypass setup errors.

Psycopg 3 uses up to five connections per API process, a pooled runtime endpoint and disabled prepared-statement caching for pooler compatibility. The migration owner is rejected as an API login. Runtime roles cannot write financial tables directly; controlled SQL functions enforce ledger postings, corrections, archival and group ordering. Financial results and retry records commit together. A broken configured database returns an error instead of falling back to memory.

## Activate the existing Render API

1. Select `splix-api-test` in Render. Open **Environment → Add from .env** and paste the private `.env.api.local` contents. Choose **Save only** while preparing the code deployment. Keep the Python version setting.
2. Set Build Command to `pip install . && python -m app.migrate`.
3. Keep Start Command as `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`.
4. Once persistence code is on `main`, choose **Manual Deploy → Deploy latest commit**. Migrations run before application startup and are safe to repeat.
5. Check `https://splix-api-test.onrender.com/health`: require `storage: postgresql` and `persistent: true`. Verify an account/group survives an API restart.

`render.yaml` keeps the Free web-service plan and declares secrets without their values. It does not update an existing manually configured service automatically. Neon sign-in does not grant Render access.

Old Render memory-only data cannot be recovered by redeploying a database-backed replacement. New accounts are needed unless the old process is separately exported before it stops. Render may still sleep, but sleep/restart no longer deletes PostgreSQL data. A cold request can need a retry while Render wakes.

## Run and verify

```bash
npm run api
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npm run build
uv run python scripts/preview.py
```

Set `SPLIX_ALLOWED_ORIGINS` to allow the frontend origin. Browser tests accept `SPLIX_E2E_API_URL` and `SPLIX_E2E_PREVIEW_URL` for an isolated backend/preview.

Migrations were first verified on isolated Neon branch `splix-persistence-20261023`, which expires after seven days. Six API tests exercise real HTTP process restarts, session/revocation persistence, lost-response replay, all split methods, corrections/rollback, joins, presets, reports, archival and independent-worker settlement races. Three browser journeys exercise the financial flow and overview against the same Neon branch. Financial fixtures remain on that branch. Production verification used one temporary identity, checked its durable session across application recreation, then deleted/revoked it.

No APK rebuild is needed for this server-side storage change. Pending capture setup-flow source changes need a later APK rebuild when requested.
