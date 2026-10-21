# SplitWise+ — Technology Stack

## Recommended stack

Use a React web application with a Python FastAPI backend, PostgreSQL, and explicit SQL. Python keeps financial rules readable while FastAPI provides typed request validation and an OpenAPI contract. These are proposed choices; no packages are installed by this document.

| Layer | Choice | Purpose |
| --- | --- | --- |
| Browser | React + TypeScript, built with Vite | Group dashboard, expense forms, history, settlement and report screens. |
| Navigation | React Router in library mode | Client-side page navigation; the FastAPI service owns server behavior. |
| Styling | CSS Modules and shared design tokens | Responsive layouts without another application framework. |
| API | Python 3.12+ + FastAPI + Pydantic | Small REST API with typed schemas, explicit service/repository layers, and generated OpenAPI. |
| Validation | Zod | Validate request shapes and share nonfinancial DTO definitions. |
| Database | PostgreSQL 18 | Relational data, constraints, transactions, locks, SQL reports, and indexes. |
| SQL access | `pg` / node-postgres | Parameterized queries and explicit transaction boundaries using one checked-out connection. |
| Migrations | `node-pg-migrate`, with explicit SQL where appropriate | Versioned tables, functions, triggers, views, and indexes. |
| Authentication | Argon2id password hashes; `express-session` with PostgreSQL session store | Server-side sessions, HTTP-only cookies, and persistent login state. |
| Charts | Recharts | Category and monthly spending charts backed by SQL results. |
| Exports | Server-generated CSV | Monthly report download using the same report query as the screen. |
| Tests | pytest, HTTPX, Playwright | Financial unit tests, API/database tests, and complete browser journeys. |
| Local environment | Docker Compose for PostgreSQL; Python virtual environment | Reproducible database and web/API development. |
| Quality | Ruff, mypy, pytest, GitHub Actions | Reviewable formatting, type checks, and automated tests. |

Use supported stable Python versions, pin resolved dependencies in `uv.lock` or a requirements lockfile, and commit the database image version when scaffolding. Python 3.12 is the selected baseline. FastAPI publishes the interactive OpenAPI documentation at `/docs` and `/redoc`.

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
  api/app/
    main.py            # FastAPI routes, sessions, and exception mapping
    domain/            # Split rules and domain errors
    services/          # Split, settlement, correction, reporting workflows
    repositories/      # Parameterized SQL
    db/                # Pool and transaction helpers
  tests/               # pytest unit, API, and concurrency tests
```

The root also contains `db/migrations/`, `db/seeds/`, `db/queries/`, `tests/integration/`, `tests/e2e/`, `docs/evidence/`, `compose.yaml`, `.env.example`, and these four planning documents. Keep secrets out of version control.

## Development and delivery

Provide scripts for `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `db:migrate`, and `db:seed` during scaffolding. These are planned commands, not commands available in the empty repository yet.

Local workflow: copy `.env.example`, start PostgreSQL with Compose, install from the lockfile, run migrations and seed data, then run the web and API development servers. CI uses an isolated PostgreSQL service and applies the same migrations before integration tests.

Deploy the built frontend and API under one origin, with PostgreSQL accessible only to the API. Use environment variables for `DATABASE_URL`, `SESSION_SECRET`, `PORT`, and `APP_ORIGIN`. Use separate migration and runtime database roles, persistent database storage, and a tested backup/restore procedure. A local Compose demonstration is sufficient for the academic MVP; cloud hosting is optional.

## Database reference material

The transaction design uses PostgreSQL [row-level locking](https://www.postgresql.org/docs/current/explicit-locking.html) and [Read Committed isolation](https://www.postgresql.org/docs/current/transaction-iso.html). Cross-row totals require transaction functions and deferred constraint triggers rather than ordinary `CHECK` constraints; see [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

Redis, MongoDB, message queues, microservices, and an ORM are unnecessary for this scope. An optional later analytics store should consume committed ledger events and must not become a competing financial source of truth.
