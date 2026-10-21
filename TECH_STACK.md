# Splix — Technology Stack

## Proposed stack

Android-first replaces the browser-first plan. Only SQL/documentation currently exists. The following packages, versions, scripts, and deployment choices are proposals, not installed tooling. Verify supported versions and native-module compatibility when scaffolding; pin resolved dependencies.

| Layer | Proposed choice | Purpose |
| --- | --- | --- |
| Mobile | React Native + TypeScript with native Android project | Screens, navigation, account/group flows, inbox, balances, reports, closeout. |
| Navigation | React Navigation | Typed routes, authenticated navigation, safe review deep links. |
| Native capture | Kotlin `NotificationListenerService` and React Native module | Consent/permission checks, source allowlist, transient parsing, background ingestion. Do not assume JS is running. |
| Local storage | SQLite behind a shared native/JS repository contract | Private account-scoped drafts, active settings, source deduplication, durable mutations. Prototype one compatible access/migration approach; avoid competing schemas/connections. |
| Credentials | Android Keystore-backed secure storage | Opaque session credentials, never plain SQLite or AsyncStorage. |
| Prompts | Android local notifications plus in-app inbox | Permission-aware review prompts, generic lock-screen text, inbox fallback; no push service required. |
| API | Node.js 24 baseline, Express 5, TypeScript | Identity, authorization, groups, financial services, presets, reporting/CSV. Verify versions during setup. |
| Validation | Zod/shared DTOs | Request validation, safe serialization, native bridge contracts. |
| Database | PostgreSQL 18 baseline, explicit SQL via `pg` | Constraints, ledger, transactions, locks, reporting, indexes. |
| Migrations | Numbered SQL plus a runner selected during setup | Apply existing `001` unchanged; add ordered migrations for product extensions. |
| Auth | Argon2id and revocable server-side opaque sessions | Mobile bearer credential over HTTPS, expiry, recovery, logout/revocation; not browser-cookie-only auth. |
| Export | API-generated CSV plus mobile file/share flow | Report parity and spreadsheet-formula-safe text. |
| Tests | Vitest, Supertest, Android JUnit/instrumentation, Maestro | Money/API/database tests, Kotlin parser/listener tests, mobile journeys. |
| Environment | Docker Compose PostgreSQL, npm workspaces, Android Studio SDK/emulator/device | Reproducible API/database setup and native builds. |
| Quality | TypeScript, ESLint, Prettier, Android lint, CI | Pin compatible tooling; fresh-database tests and bounded emulator smoke checks. |

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
  api/src/
    routes/              # DTO/session/group authorization
    services/            # Auth, financial posting/replay, presets, reporting
    repositories/        # Parameterized SQL
    db/                  # Pool and transaction helpers
packages/
  contracts/             # DTOs, errors, native bridge types
  money/                 # Pure allocation and balance utilities
tests/
  integration/           # Real PostgreSQL/API/concurrent connections
  mobile/                # Mobile journeys and sanitized fixtures
```

Keep existing `db/` and `docs/evidence/`. Add Compose, `.env.example`, lockfile, version pins, and clean-start guide during scaffolding. Never commit credentials or personal notifications.

## Development and delivery

Planned scripts: `dev:api`, `start:mobile`, `android`, `build:api`, `build:android`, `typecheck`, `lint`, `test`, `test:integration`, `test:mobile`, `db:migrate`, `db:seed`. None exists yet. Document JDK/SDK/device setup. An emulator is not proof of real payment-app support.

Configure database/session/recovery/API/deep-link settings through environment variables. A physical phone needs a reachable HTTPS API; its `localhost` is not the development host. PostgreSQL is private to the API. Use separate migration/runtime roles, deliberate controlled grants, fresh CI databases, persistent storage, tested restore, and signing keys outside Git.

No Redis, Kafka, microservices, second financial store, OCR service, or payment integration is required initially.

## References and review gates

Recheck current platform/store requirements during prototype and release; these references do not certify store approval.

- [Android notification listener](https://developer.android.com/reference/android/service/notification/NotificationListenerService).
- [Google Play user-data policy](https://support.google.com/googleplay/android-developer/answer/10144311) and [SMS/call-log policy](https://support.google.com/googleplay/android-developer/answer/10208820).
- [Apple app extensions](https://developer.apple.com/app-extensions/) for later user-initiated sharing.
- PostgreSQL [locks](https://www.postgresql.org/docs/current/explicit-locking.html), [isolation](https://www.postgresql.org/docs/current/transaction-iso.html), and [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
