# SplitWise+ — Technology Stack

## Recommended stack

Use a TypeScript web application with PostgreSQL and explicit SQL. This keeps one language across the interface and API while making the DBMS concepts visible for assessment. These are proposed choices; no packages are installed by this document.

| Layer | Choice | Purpose |
| --- | --- | --- |
| Browser | React + TypeScript, built with Vite | Group dashboard, expense forms, history, settlement and report screens. |
| Navigation | React Router in library mode | Client-side page navigation; the Express API owns server behavior. |
| Styling | CSS Modules and shared design tokens | Responsive layouts without another application framework. |
| API | Node.js 24 LTS + Express 5 + TypeScript | Small REST API with explicit service and repository layers. |
| Validation | Zod | Validate request shapes and share nonfinancial DTO definitions. |
| Database | PostgreSQL 18 | Relational data, constraints, transactions, locks, SQL reports, and indexes. |
| SQL access | `pg` / node-postgres | Parameterized queries and explicit transaction boundaries using one checked-out connection. |
| Migrations | `node-pg-migrate`, with explicit SQL where appropriate | Versioned tables, functions, triggers, views, and indexes. |
| Authentication | Argon2id password hashes; `express-session` with PostgreSQL session store | Server-side sessions, HTTP-only cookies, and persistent login state. |
| Charts | Recharts | Category and monthly spending charts backed by SQL results. |
| Exports | Server-generated CSV | Monthly report download using the same report query as the screen. |
| Tests | Vitest, Supertest, Playwright | Financial unit tests, API/database tests, and complete browser journeys. |
| Local environment | Docker Compose for PostgreSQL; npm workspaces | Reproducible database and shared web/API packages. |
| Quality | ESLint, Prettier, TypeScript checks, GitHub Actions | Reviewable formatting and automated build/test checks. |

Use supported stable versions, pin exact resolved dependencies in the lockfile, and commit `.nvmrc` and the database image version when scaffolding. Node 24 is the selected LTS baseline, subject to verification at implementation time using the [official Node release schedule](https://nodejs.org/en/about/previous-releases). Vite provides a React TypeScript scaffold in its [getting-started documentation](https://vite.dev/guide/).

## Implementation conventions

- All money is integer paise in PostgreSQL `BIGINT`. JSON carries decimal integer strings, such as `"150000"` for ₹1,500; services use JavaScript `bigint`. Never use floating-point arithmetic for allocation or settlement validation.
- Percentages use integer basis points: 10,000 means 100%. Human-entered decimal amounts are parsed as strings with at most two fractional digits.
- Runtime response serializers convert `bigint` to strings. Chart values may be converted to bounded numbers for display only.
- IDs are UUIDs, timestamps are UTC `TIMESTAMPTZ`, and expense dates are `DATE`. Each group has a fixed reporting timezone, default `Asia/Kolkata`.
- Store SQL migrations and report queries in the repository. Use parameterized SQL and allowlisted sort/filter fields.
- Use one database connection for an entire transaction; never mix pool-level queries into an active transaction.
- Use an append-only financial ledger and SQL aggregation as the balance source. Avoid independently maintained balance columns in the MVP.
- Cookie authentication requires HTTPS in deployment, secure/HTTP-only cookies, CSRF protection on writes, and login rate limiting. Never return password hashes or session identifiers in application data.

## Proposed repository layout

```text
apps/
  web/src/             # React pages, components, forms, API client
  api/src/
    routes/            # HTTP validation and session/group authorization
    services/          # Split, settlement, correction, reporting workflows
    repositories/      # Parameterized SQL
    db/                # Pool and transaction helpers
packages/
  contracts/           # DTO schemas and API types
  money/               # Pure integer allocation utilities
```

The root also contains `db/migrations/`, `db/seeds/`, `db/queries/`, `tests/integration/`, `tests/e2e/`, `docs/evidence/`, `compose.yaml`, `.env.example`, and these four planning documents. Keep secrets out of version control.

## Development and delivery

Provide scripts for `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `db:migrate`, and `db:seed` during scaffolding. These are planned commands, not commands available in the empty repository yet.

Local workflow: copy `.env.example`, start PostgreSQL with Compose, install from the lockfile, run migrations and seed data, then run the web and API development servers. CI uses an isolated PostgreSQL service and applies the same migrations before integration tests.

Deploy the built frontend and API under one origin, with PostgreSQL accessible only to the API. Use environment variables for `DATABASE_URL`, `SESSION_SECRET`, `PORT`, and `APP_ORIGIN`. Use separate migration and runtime database roles, persistent database storage, and a tested backup/restore procedure. A local Compose demonstration is sufficient for the academic MVP; cloud hosting is optional.

## Database reference material

The transaction design uses PostgreSQL [row-level locking](https://www.postgresql.org/docs/current/explicit-locking.html) and [Read Committed isolation](https://www.postgresql.org/docs/current/transaction-iso.html). Cross-row totals require transaction functions and deferred constraint triggers rather than ordinary `CHECK` constraints; see [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

Redis, MongoDB, message queues, microservices, and an ORM are unnecessary for this scope. An optional later analytics store should consume committed ledger events and must not become a competing financial source of truth.
