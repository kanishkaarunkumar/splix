# Integrated mobile handoff — 2026-10-22

Person 2's `origin/person-2-api-updated` revision `7775e91` was fast-forwarded into local `main` before the mobile implementation. The work includes a review of the merged API and SQL plus targeted corrections. This is development evidence, not a claim of pilot/release readiness.

## Delivered client

`apps/mobile` contains an Expo SDK 58 / React Native 0.88 / TypeScript Android app with Expo Router file routes and native stacks. Bastion's Wenvy color/type tokens and native adaptations of its form/disclosure patterns are attributed in `THIRD_PARTY_NOTICES.md`. Its DOM/Radix/21st.dev-style controls were adapted to native primitives with 44–48dp targets; the original desktop cursor, parallax, tilt and landing-page effects are not needed for the mobile flows. Barba owns browser document swaps in Bastion; it cannot manage a React Native tree. Splix uses native navigation and reduced-motion-aware transitions, preserving forms and the local queue.

Implemented screens cover accounts/recovery/profile/deletion, groups and approved invites, equal/percentage/exact/weighted expenses, split preview/presets, committed balances/explanations, external settlements, paginated searchable history, atomic correction review, reports/CSV, and device-scoped closeout. Private inbox supports expense/payment review, Personal, Dismiss and Later. Active mode includes disclosure, explicit consent, package selection, permission status, bounded activation, pause/stop and expiry display. No notification signal invokes a financial API.

The local Expo Android module compiles Person 1's capture source directly; there is one listener/store implementation, not copied divergent sources. SQLite local migration 1→2 adds client state without deleting drafts. Confirming a capture suggestion and appending its UUID-keyed mutation happen in one native transaction. The same account-scoped database holds snapshots and saved manual drafts; credentials stay in Android secure storage. Backup is disabled. Source updates preserve the capture-time group. The web preview uses IndexedDB for local state and memory-only credentials and clearly reports capture unavailable.

## Review findings corrected

- Removed the hardcoded cookie-signing secret and user-ID cookie fallback. Every protected route, including an empty group list, requires a live bearer session. Logout, expiry, password reset and account deletion invalidate affected sessions.
- Replaced raw dict financial bodies with typed validation. Validated dates, integer paise and split membership by the selected method, preventing a supplied participant list from hiding outsider shares. Matched the SQL amount bound. Added sender/owner settlement permission.
- Serialised the memory adapter's financial operations and rolled back failed corrections. Added canonical request hashing, operation-aware payloads and correction replay, including stable retry results after archive.
- Required owner approval for code-based joins, checked invite expiry/revocation and group member cap, and rejected archival with nonzero balances. Exposed archival status and profile updates to the client.
- Corrected reports to exclude reversed originals, added opening/closing balances and settlement CSV rows, used real CSV quoting and neutralised spreadsheet formulas.
- Removed migration 002's revoke of the nonexistent `validate_financial_correction_link()` function. This migration demonstrably failed and rolled back on a fresh database; the correction allows it to apply. Migration 001 remains unchanged.
- Fixed the existing report test's positional placeholder translation and UUID-vs-string assertions so it actually executes report SQL against PostgreSQL.
- Fixed confirmation navigation to dismiss the form back to the existing group. Queue updates preserve writes enqueued while an earlier response is outstanding. Definite rejections can be discarded for fresh review; unknown outcomes retain their request keys.

## Executed evidence

- Fresh PostgreSQL 18.6 in Docker: migrations 001/002, seed, financial invariants and restricted-runtime privilege checks passed.
- Python: 24 tests passed, including a real two-connection settlement race, month-boundary/late-correction reports, API auth/revocation, malformed and unauthorized writes, rollback/replay, joins, archive checks, CSV safety and concurrent memory-adapter settlement checks.
- Mobile core: 8 tests passed for deterministic money allocation, rejected split inputs, lost-response replay across queue recreation, interrupted sends, concurrent flushes, account isolation and auth/conflict states.
- TypeScript, Expo ESLint with zero warnings, Python Ruff lint and Python formatting checks passed in the final local run. CI is added for reproducible API/database, mobile and native compilation checks.
- Automated Chromium journey at 390×844 passed: register → create group → request/approve invite → expense review → API-offline confirmation → reconnect/retry → correction → monthly report/CSV → external settlement → zero-balance archive. No uncaught page errors. The final file-routed preview simulates API unavailability while keeping browser route chunks reachable; the native shell is bundled. This proves the web-rendered React Native manual client against the memory API, not Android instrumentation.
- Browser production bundle and Android Hermes bundle exported successfully. Native prebuild and Expo autolinking found `com.splix.bridge.SplixCaptureModule`.
- 10,000-event SQL workload loaded. Thirty warm-cache observations per query: history p50/p95 0.273/0.829ms; balances 2.147/3.108ms; monthly member report 6.272/7.673ms; category report 2.883/3.583ms. These are client wall times to a local Docker PostgreSQL server, with one-member benchmark groups and no concurrent load, not mobile/API latency or production guarantees. Plans and buffer data are in [the raw evidence](query-plans-2026-10-22.txt). `scripts/measure_queries.py` reproduces the measurements after the benchmark seed.
- Custom-format PostgreSQL dump restored into a separate database: 10,019 financial events, 10,050 ledger rows, zero groups with nonzero ledger sums. Counts include the test fixtures as well as the 10,000-event benchmark.

## Remaining gates

1. The inherited API is still an in-memory reference adapter. It is not wired to the validated PostgreSQL schema. Server restart loses users, sessions, events and replay results; one-process locking is not a production transaction strategy. Wire a real PostgreSQL repository and transaction-level request replay before pilot/deployment. Health reports `productionReady: false`.
2. Trusted recovery-token delivery, abuse throttling and production operational configuration remain server work. Recovery screens and safe token confirmation exist; delivery is not claimed.
3. A separate workspace SDK resolved the missing system SDK mount; ARM64 APK/Kotlin compilation and four capture-parser unit tests now pass (see APK evidence below). Android instrumentation, screen readers/large text, on-device offline/restart, consent/revocation and live payment-app capture remain unverified. Compilation is not a substitute for device testing.
4. Capture is a prototype with candidate source packages. No universal coverage, live-device precision/recall, background prompt delivery or Play approval is claimed. Inbox fallback is implemented. Retention duration/automatic expiry, pilot feedback and final privacy/release disclosures still require agreement and validation.
5. SQL benchmark/restore checks concern PostgreSQL artifacts independently of the current memory API. They must not be described as end-to-end persistent API evidence.

## Visual revision — October 23, 2026

The user-supplied colourful rounded-square reference replaces the earlier Bastion/Wenvy styling. The current theme uses deep brown framing, cream cards, teal/coral/pink/yellow blocks, rounded-square buttons, inputs and avatars, DM Sans lettering and IBM Plex Mono headings. Sign-in adapts from a two-panel desktop layout to stacked mobile panels. The dashboard uses coloured action and group tiles. Shared native controls carry the theme through all financial and review screens. Bastion remains an initial component-pattern reference and retains attribution; its visual theme is no longer used.

The follow-up visual adjustment uses orange across the shared page, navigation header, loading and footer surfaces, with teal primary buttons. Every shared card gets a subtle 3px lift and shadow on pointer hover; touch input does not trigger hover, and the shared reduced-motion preference suppresses positional motion.

The home navigation now has Groups, Overview, Inbox and You dock tabs. A read-only overview groups deterministic settlement suggestions by person across the account’s groups, retaining separate owed/receivable amounts and group drill-down. It uses confirmed balances, not local pending writes, and displays cache freshness / incomplete coverage. Home loads group balances in batches of four; existing server endpoints are unchanged.

Follow-up verification passed: TypeScript, zero-warning Expo lint, 12 mobile core tests, and three Chromium journeys covering the full financial flow, dock navigation, three-group person totals, orange/teal colours, hover and reduced motion. Web and Android Hermes production exports passed; the Android export does not replace the outstanding native/device checks above.

## Standalone Android APK — October 23, 2026

Built source `9c9c53c` with Java 17, Gradle 9.4.1, Android SDK 37 and NDK 27.1.12297006. `:app:assembleRelease` and `:splix-capture:testDebugUnitTest` passed; the capture test reports contain four tests with zero failures/errors/skips. TypeScript and zero-warning Expo lint passed before prebuild. The generated release APK uses the debug signing key for installation testing, ARM64 only, minimum Android API 27 (Android 8.1), target API 36.

Artifact: `.dist/apk/splix-test.apk` (37,459,483 bytes), SHA-256 `0a819f080b3415c5590904696d85c64073eabeeed78be2d4e4c987234a9e3543`. APK v2 signature verification, ZIP integrity, embedded Hermes bundle, HTTPS API address, native bridge/listener classes and ARM64 library checks passed. The merged manifest retains disabled backup and the protected notification listener; the hosted build has no local HTTP network-security override.

The APK points to `https://splix-api-test.onrender.com` and needs no laptop connection. HTTPS health, unauthorized-access rejection, temporary registration, authenticated profile/group list, account cleanup and session revocation were checked against that server. The server still reports memory storage and `productionReady: false`; deployment does not resolve the persistence gate above. No physical-device installation or live UPI notification capture is claimed.
