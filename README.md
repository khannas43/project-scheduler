# Project Scheduler

CPM project scheduling with optional Agile boards — critical path, resources, baselines/EVM, reports, and spreadsheet/MSPDI interop.

Engineering specs: [`docs/PROJECT_SCOPE.md`](docs/PROJECT_SCOPE.md), [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md).

---

## Requirements

- **Node.js** ≥ 22 (`pnpm` ≥ 9 — see root `packageManager`)
- **PostgreSQL** 16+ (local or Docker)
- Optional: Docker Compose for the full stack (`infra/`)

---

## Quick start (local API + Vite)

### 1. Install

```bash
pnpm install
```

### 2. Database

Create a database/user (example matches the defaults below), then from `apps/api`:

```bash
cp .env.example .env
```

Edit `.env` so it includes at least:

```env
DATABASE_URL=postgresql://scheduler:scheduler@localhost:5432/scheduler
JWT_SECRET=dev-only-not-secret-32-characters-min
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me
```

(`JWT_SECRET` is required by the API even though older `.env.example` copies may omit it.)

Migrate and seed:

```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

Seed creates the admin user from `SEED_ADMIN_*`. Re-running seed upserts that password.

### 3. Run API and web

Terminal A — API (default compose/docs often use **3100** in local Vite proxy setups):

```bash
cd apps/api
# ensure .env is loaded (tsx/node pick it up from apps/api)
PORT=3100 CORS_ORIGIN=* pnpm exec tsx src/server.ts
# or: pnpm build && PORT=3100 CORS_ORIGIN=* node dist/server.js
```

Terminal B — web:

```bash
pnpm --filter web exec vite --port 5173 --host
```

Open **http://localhost:5173** and sign in with your `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

Vite proxies `/api` → `http://localhost:3100` ([`apps/web/vite.config.ts`](apps/web/vite.config.ts)). If login shows a generic Internal Server Error, the API is usually down — check port 3100.

### 4. Workspace scripts

| Command | Purpose |
|--------|---------|
| `pnpm lint` | ESLint (Turbo) |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Vitest across packages/apps (unit + API contract) |
| `pnpm test:coverage` | Vitest + LCOV (for Sonar / CI artifacts) |
| `pnpm test:integration` | API integration tests (testcontainers Postgres; needs Docker) |
| `pnpm test:e2e` | Playwright critical-path UI (needs API + Vite + seeded DB) |
| `pnpm sonar` | Local SonarQube scan + quality gate (`docs/SONAR.md`) |
| `pnpm build` | Build all packages |

---

## Docker Compose

From the repo root (see [`infra/.env.example`](infra/.env.example)):

```bash
cp infra/.env.example infra/.env
# edit POSTGRES_PASSWORD, JWT_SECRET, SEED_ADMIN_* …
docker compose -f infra/compose.yaml up --build
```

Typical ports: web via nginx (see compose), API inside the network. Full notes: `docs/TECHNICAL_DESIGN.md` §10.

---

## In-product help (User Manual)

After signing in, open **Help** in the top bar (`/help`). Use the **?** links on Schedule, Reports, Settings, People, Roles, and Activity to jump to the matching topic (`#schedule`, `#reports`, `#settings`, `#roles`, `#activity`, …).

Topics cover getting started, schedule/Gantt, resources & leveling, progress & baselines, import/export, custom reports, Agile, **Roles & permissions**, and **Activity/audit**.

### Activity / audit log (onboarding)

| Piece | Where |
|-------|--------|
| **UI** | Project → **Activity** — filter by action prefix / entity type; expand before/after |
| **API** | `GET /api/projects/:id/audit-log` (`audit.view`) — see query params in the audit doc |
| **Roles** | New role / Edit → `role.create` / `role.update` on Activity (`role.` or entity `role`) |
| **Retention** | Append-only, indefinite by default; ops prune/archive per policy — never rewrite rows |
| **Seed** | Re-run `pnpm --filter api db:seed` after upgrades so `audit.view` lands on system roles |

Full action catalog, filters, gaps, and retention: [`docs/AUDIT_LOG.md`](docs/AUDIT_LOG.md).

API exception contract (no stack leak, `/health` vs `/ready`): [`docs/EXCEPTION_HANDLING.md`](docs/EXCEPTION_HANDLING.md).  
FE banners / API-down / validation UX: [`docs/ERROR_HANDLING_UX.md`](docs/ERROR_HANDLING_UX.md).  
SonarQube (local `:9012` + CI quality gate): [`docs/SONAR.md`](docs/SONAR.md).

Testing pyramid (unit / API contract / integration / Playwright): [`docs/TESTING.md`](docs/TESTING.md).

---

## Monorepo layout

| Path | Role |
|------|------|
| `apps/api` | Fastify API, Drizzle, migrations, seed |
| `apps/web` | Vite + React UI |
| `packages/scheduler` | CPM engine |
| `packages/gantt` | Canvas Gantt |
| `packages/schema` | Zod input schemas |
| `packages/rbac` | Permissions & system roles |
| `infra/` | Compose + Dockerfiles |

---

## Troubleshooting

| Symptom | Likely fix |
|--------|------------|
| Login “Internal Server Error” / Failed to fetch | Start API on **3100**. Login shows an API-down hint; errors use code `api_unreachable` — see [`docs/ERROR_HANDLING_UX.md`](docs/ERROR_HANDLING_UX.md) |
| Invalid email or password | Use current `SEED_ADMIN_*` from `.env`, or re-seed |
| Migration errors | Run `pnpm --filter api db:migrate`; ensure Postgres is up |
| `Missing required environment variable: JWT_SECRET` | Add `JWT_SECRET` to `apps/api/.env` |
| API up but app flaky | Check `GET /health` (liveness) vs `GET /ready` (DB). Ready returns 503 if Postgres is down |
| Client sees stack / internal paths in JSON | Should not happen — API strips stacks on 5xx; see [`docs/EXCEPTION_HANDLING.md`](docs/EXCEPTION_HANDLING.md) |
