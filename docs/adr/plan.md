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

## Next up, in order

`packages/schema` (item 1) has no code dependency on `packages/gantt` or
`infra/` — see "What can run in parallel" below if you want to split this
across two terminals.

1. **`packages/schema`** — Zod schemas for the core entities (Task, Project,
   Dependency, Calendar...), with the eight CPM output columns omitted from
   input schemas per §3.3's rule. Needed before task routes can validate
   input properly.
2. **Task CRUD service + routes** in `apps/api` — `services/taskService.ts`,
   `routes/tasks.ts`, engine invoked inside the transaction (§9.3), version
   checks (§9.1), WBS `ltree` maintenance on move/indent (§3.7).
3. **Dependency routes** — `POST/DELETE /api/dependencies`, cycle rejection
   surfaced as a 4xx, not a 500.
4. **`packages/gantt`** — 10k-task synthetic benchmark *first* (risk R2 —
   TECHNICAL_DESIGN.md is explicit that this must be prototyped before the
   canvas-layer design is locked in), then the four-layer canvas, viewport
   virtualisation, bar rendering, dependency arrow routing.
5. **`apps/web` shell** — Vite + React, TanStack Router, login page, project
   list, TanStack Table grid view, the optimistic edit cycle (§7.2).
6. **Role management UI** — permission matrix, clone/create/edit, wired to
   the existing `role.manage`-guarded routes (which don't exist yet either —
   add `routes/roles.ts` alongside this).
7. **`infra/`** — `compose.yaml`, `api.Dockerfile`, `web.Dockerfile`
   (multi-stage, non-root, migration init container per §10.2).
8. **CI** — `.github/workflows`: lint, typecheck, test, build across the
   workspace via turbo.

**Phase 0's exit demo** (`docker compose up`, log in, create a custom role,
watch a 403) becomes reachable once 5–8 land, even though the CPM engine
work (the scheduler package, now done, and items 2–4) isn't part of Phase
0's own scope — it's sequenced first here because it's the higher-value,
lower-risk work and nothing else depends on waiting for it.

## What can run in parallel (one terminal per Claude Code session)

The dependency chain is: **1 → {2, 3}**, **{2,3} → partially 6**, **5 → 6**.
Everything else has no code-level dependency on that chain. With one
terminal on the critical path (currently item 1, `packages/schema`), these
can run concurrently in separate terminals/worktrees without file overlap
or blocking:

- **Item 4, `packages/gantt` benchmark** — the 10k-task synthetic benchmark
  needs a task/dependency data shape, not a working API. Fully separate
  package, zero file overlap with 1–3, and the engine's `schedule()` output
  shape it'll eventually render against is already settled.
- **Item 7, `infra/`** — Dockerfiles and `compose.yaml` don't need the
  application code to be finished, only to exist. Zero file overlap.
- **Item 8, CI workflows** — `.github/workflows` referencing `turbo run
  lint/typecheck/test/build` works today against the current tree; it
  doesn't need items 1–7 to land first, just to keep passing as they do.
- **Item 5, `apps/web` shell scaffolding** — Vite config, router, login page
  against the *existing* auth routes can start now; it just won't be wired
  to real task data until item 2 lands.

Not safe to parallelize against the critical path: **items 2 and 3** (need
the schemas from item 1 — starting them early means rework once it lands),
and **item 6** (needs item 5's shell plus a not-yet-written
`routes/roles.ts`, which item 2/3's route work would naturally establish
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
