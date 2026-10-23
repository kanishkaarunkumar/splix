# Splix — Technology Stack

## Implemented development stack and remaining choices

October 22, 2026: an Expo SDK 58 / React Native 0.88 Android client and FastAPI memory adapter are implemented. Frontend and Python lockfiles pin resolved dependencies. PostgreSQL migrations are tested independently; a persistent API repository and Android device verification remain release gates. See [executed evidence](docs/evidence/person-3-handoff.md).

| Layer | Proposed choice | Purpose |
| --- | --- | --- |
| Mobile | React Native + TypeScript with native Android project | Screens, navigation, account/group flows, inbox, balances, reports, closeout. |
| Navigation | Expo Router with native stacks | Typed routes, authenticated navigation, safe review deep links. |
| Native capture | Kotlin `NotificationListenerService` and React Native module | Consent/permission checks, source allowlist, transient parsing, background ingestion. Do not assume JS is running. |
| Local storage | SQLite behind a shared native/JS repository contract | Private account-scoped drafts, active settings, source deduplication, durable mutations. Prototype one compatible access/migration approach; avoid competing schemas/connections. |
| Credentials | Android Keystore-backed secure storage | Opaque session credentials, never plain SQLite or AsyncStorage. |
| Prompts | Android local notifications plus in-app inbox | Permission-aware review prompts, generic lock-screen text, inbox fallback; no push service required. |
| API | Python 3.12+, FastAPI, Pydantic | Identity, authorization, groups, financial services, presets, reporting/CSV, and generated OpenAPI. |
| Validation | Pydantic request models and shared JSON contracts | Request validation, safe serialization, native bridge contracts. |
| Database | PostgreSQL 18 SQL; API repository pending (`psycopg` used by integration tests) | Constraints, ledger, transactions, locks, reporting, indexes. |
| Migrations | Numbered SQL plus a runner selected during setup | Apply existing `001` unchanged; add ordered migrations for product extensions. |
| Auth | Argon2id and revocable server-side opaque sessions | Mobile bearer credential over HTTPS, expiry, recovery, logout/revocation; not browser-cookie-only auth. |
| Export | API-generated CSV plus mobile file/share flow | Report parity and spreadsheet-formula-safe text. |
| Tests | pytest, HTTPX, Vitest, Playwright; Android JUnit/instrumentation pending execution | Money/API/database tests, Kotlin parser/listener tests, mobile journeys. |
| Environment | Docker Compose PostgreSQL, Python virtual environment, Android Studio SDK/emulator/device | Reproducible API/database setup and native builds. |
| Quality | Ruff, TypeScript, Expo ESLint and CI; native lint/device checks pending | Pin compatible tooling; fresh-database tests and bounded emulator smoke checks. |

A custom native build is required; a generic preview app is not the capture implementation. iOS is a later client with user-initiated sharing/import, not equivalent notification monitoring. A web app is not an initial deliverable.

## Conventions

- PostgreSQL `BIGINT` paise, pure utility `bigint`, JSON/local queue base-10 integer strings. No float allocation or raw JavaScript `bigint` serialization.
- Percentages are basis points; weighted splits use bounded positive integer weights with deterministic largest-remainder allocation.
- UUID IDs, `TIMESTAMPTZ` audit time, `DATE` effective date; reporting defaults to `Asia/Kolkata`.
- Server allocation is authoritative. Snapshot final participants/shares; mutable presets must not change history.
- Parameterized SQL, one checked-out transaction connection, no external network calls under financial locks.
- Session identity supplies actor IDs. Native messages, source notifications, deep links, queue payloads, and selected group IDs are untrusted.
- No SMS permissions, accessibility scraping, bank credentials, or payment gateway dependency.
- Parse raw notifications transiently on-device, never upload/log them. Agree retention/deletion; exclude private drafts and credentials from backup. Use sanitized fixtures and generic lock-screen prompts.

## Proposed layout

```text
apps/
  mobile/
    src/                 # Screens, local repositories, queue, navigation, API client
    android/             # Kotlin listener, bridge, persistence, permissions
  api/app/
    main.py              # FastAPI routes and auth/session boundary
    domain/               # Allocation rules and domain errors
    service.py            # Financial workflows, replay, presets, reporting
    repositories/         # Parameterized SQL
    db/                   # Pool and transaction helpers
packages/
  contracts/             # DTOs, errors, native bridge types
  money/                 # Pure allocation and balance utilities
tests/
  integration/           # Real PostgreSQL/API/concurrent connections
  mobile/                # Mobile journeys and sanitized fixtures
```

Keep existing `db/` and `docs/evidence/`. Add Compose, `.env.example`, lockfile, version pins, and clean-start guide during scaffolding. Never commit credentials or personal notifications.

## Development and delivery

The root scripts now provide `mobile`, `android`, `web`, `typecheck`, `lint`, `test`, and `build`; the API uses `uv run`. Native projects are generated from the Expo configuration and local module. The original planned scripts were: `uv run uvicorn app.main:app --reload`, `start:mobile`, `android`, `pytest`, `pytest tests/database`, `ruff check`, `db:migrate`, and `db:seed`. Document JDK/SDK/device setup. An emulator is not proof of real payment-app support.

Configure database/session/recovery/API/deep-link settings through environment variables. A physical phone needs a reachable HTTPS API; its `localhost` is not the development host. PostgreSQL is private to the API. Use separate migration/runtime roles, deliberate controlled grants, fresh CI databases, persistent storage, tested restore, and signing keys outside Git.

No Redis, Kafka, microservices, second financial store, OCR service, or payment integration is required initially.

## References and review gates

Recheck current platform/store requirements during prototype and release; these references do not certify store approval.

- [Android notification listener](https://developer.android.com/reference/android/service/notification/NotificationListenerService).
- [Google Play user-data policy](https://support.google.com/googleplay/android-developer/answer/10144311) and [SMS/call-log policy](https://support.google.com/googleplay/android-developer/answer/10208820).
- [Apple app extensions](https://developer.apple.com/app-extensions/) for later user-initiated sharing.
- PostgreSQL [locks](https://www.postgresql.org/docs/current/explicit-locking.html), [isolation](https://www.postgresql.org/docs/current/transaction-iso.html), and [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
