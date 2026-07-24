# Delivery Plan — Pending Work

**Not an ADR.** This is a living checklist, not a decision record — it lives
in `docs/adr/` alongside them because there's nowhere better yet, and it
should be updated in place as work completes rather than superseded like an
ADR would be. If it goes stale, trust `git log` and the actual code over this
file, and fix this file to match.

**Status as of 2026-07-24.** Cross-checked against `docs/PROJECT_SCOPE.md` §8
and `docs/TECHNICAL_DESIGN.md` §13 (the authoritative build order — this plan
sequences within it, it doesn't override it).

---

## Done

- Monorepo scaffold (pnpm + Turborepo + ESLint boundary rules)
- `packages/rbac` — permission registry, five system roles
- Drizzle schema — all 16 tables per TECHNICAL_DESIGN.md §3
- Migrations + seed script
- Fastify skeleton — `requireAuth`, `requirePermission`, RFC 7807 errors, `/health`
- Auth routes — login/refresh/logout (stateless rotation, see ADR 001)
- Route-guard drift test (§6.4)
- `packages/scheduler` — `EpochMinutes`, calendar compilation, `addWorkingMinutes` (test-first)
- **Branded IDs** (`TaskId`, `CalendarId`, ...) in `packages/scheduler` — §12.1
- **Graph validation** — cycle detection, orphan check, summary-link check (§4.3)
- **Forward pass**, FS links only (§4.4)
- **Backward pass, float, critical path** (§4.5–4.6)
- **`schedule()` public entrypoint** — validation → forward → backward →
  float → summary rollup (§4.1, §4.7), plus the `TaskInput`/`DependencyInput`
  type consolidation into a shared `taskTypes.ts` that it needed
- 85 passing tests across 8 files in `packages/scheduler`
- **`infra/`** — `compose.yaml`, `compose.override.yaml`, `api.Dockerfile`,
  `web.Dockerfile` (§10.1–10.2: multi-stage via `turbo prune` + `pnpm
  deploy`, non-root, migration init container). Verified with a real
  `docker compose up` — postgres/redis healthy, migrate applies all 18
  tables and exits 0, api passes its healthcheck, web serves on :8080
  (empty until the `apps/web` shell below lands). Fixed two real bugs found
  in the process: `migrate.ts` resolved the migrations path relative to
  `process.cwd()` (only worked via `tsx` from `apps/api/`, not from the
  compiled `dist/db/migrate.js` the Docker init container runs — now
  resolved relative to the module's own URL); the api healthcheck hit
  `localhost`, which Alpine resolves to `::1` first against a server that
  only binds `0.0.0.0` — changed to `127.0.0.1`.
- **CI** — `.github/workflows/ci.yml`: lint, typecheck, test, build via
  turbo. Matches what `pnpm <script>` already does locally; all four pass
  on the current tree.

**Uncommitted, in progress (other terminal):** `packages/schema` — Zod
schemas for Task/Project/Dependency/Calendar have landed with tests (45
passing), not yet committed.

## Next up, in order

1. **Task CRUD service + routes** in `apps/api` — `services/taskService.ts`,
   `routes/tasks.ts`, engine invoked inside the transaction (§9.3), version
   checks (§9.1), WBS `ltree` maintenance on move/indent (§3.7). Waits on
   `packages/schema` landing (in progress above).
2. **Dependency routes** — `POST/DELETE /api/dependencies`, cycle rejection
   surfaced as a 4xx, not a 500.
3. **`packages/gantt`** — 10k-task synthetic benchmark *first* (risk R2 —
   TECHNICAL_DESIGN.md is explicit that this must be prototyped before the
   canvas-layer design is locked in), then the four-layer canvas, viewport
   virtualisation, bar rendering, dependency arrow routing.
4. **`apps/web` shell** — Vite + React, TanStack Router, login page, project
   list, TanStack Table grid view, the optimistic edit cycle (§7.2). Note:
   `infra/docker/web.Dockerfile` already assumes this produces a standard
   Vite `dist/` — shouldn't need changes once this lands.
5. **Role management UI** — permission matrix, clone/create/edit, wired to
   the existing `role.manage`-guarded routes (which don't exist yet either —
   add `routes/roles.ts` alongside this).

**Phase 0's exit demo** (`docker compose up`, log in, create a custom role,
watch a 403) is now infrastructure-ready — `docker compose up` itself
works — and becomes fully reachable once item 4 (web shell) and item 5
(role UI) land.

## What can run in parallel (one terminal per Claude Code session)

The dependency chain is: **`packages/schema` → {1, 2}**, **{1,2} →
partially 5**, **4 → 5**. With one terminal on the critical path (currently
`packages/schema`, then item 1, Task CRUD routes), these have no
code-level dependency on that chain and can run concurrently without file
overlap:

- **Item 3, `packages/gantt` benchmark** — the 10k-task synthetic benchmark
  needs a task/dependency data shape, not a working API. Fully separate
  package, and the engine's `schedule()` output shape it'll eventually
  render against is already settled.
- **Item 4, `apps/web` shell scaffolding** — Vite config, router, login page
  against the *existing* auth routes can start now; it just won't be wired
  to real task data until item 1 lands.

Not safe to parallelize against the critical path: **items 1 and 2** (need
the schemas from `packages/schema` — starting them early means rework once
it lands), and **item 5** (needs item 4's shell plus a not-yet-written
`routes/roles.ts`, which item 1/2's route work would naturally establish
the pattern for).

## Phase 2 (TECHNICAL_DESIGN.md §13) — not started

SS/FF/SF link types, lead/lag (negative + percentage), all eight constraint
types + precedence + ADR, deadlines, calendar exceptions/recurrence/resource
calendars, Gantt drag/resize/link interaction, undo/redo, the 200-task
MS Project reference plan.

## Phases 3–6 (PROJECT_SCOPE.md §8) — not started

- **Phase 3 — Resources:** pool, assignments, cost model, timephased work,
  overallocation detection, resource sheet/usage views.
- **Phase 4 — Tracking:** baselines, actuals, % complete variants, status
  date, progress lines, earned value + S-curve.
- **Phase 5 — Interop & reporting:** MS Project XML round-trip, CSV/Excel/
  PDF/PNG export, report builder, dashboards.
- **Phase 6 — Agile module:** boards, sprints, backlog, story points, epic
  hierarchy, burndown/burnup/velocity/CFD, sprint bars on the master Gantt.

`packages/ui` (shadcn/ui-based shared components) has no dedicated line item
above — it accretes as `apps/web` needs components, starting around step 10.

## Working conventions carried forward

- Tests before implementation for anything in `packages/scheduler` (explicit
  instruction, repeated in the build order at every engine step).
- Verify enforcement mechanisms actually enforce (ESLint rules, guards,
  drift tests) by deliberately triggering them, not just reading the config.
- Only commit when asked; summarize and wait after each unit of work.
