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

## Next up, in order

The scheduler engine is the core deliverable (PROJECT_SCOPE.md §5.6,
Resolved Decision #12: "CPM core first") and has no dependency on the
frontend or infra existing — so it leads. Docker/CI is cheap and low-risk
and can slot in whenever; it's sequenced after the engine only because it's
less valuable to have a deployable shell around an engine that doesn't
schedule anything yet.

1. **Branded IDs** (`TaskId`, `ProjectId`, `DependencyId`, `CalendarId`, ...)
   in `packages/scheduler` — §12.1. Small, foundational, everything after
   this references them.
2. **Graph validation** — cycle detection (three-colour DFS, iterative, full
   cycle path in the error), orphan check, summary-link check (§4.3).
   Test-first.
3. **Forward pass**, FS links only (§4.4). Test-first, golden cases 001–010ish.
4. **Backward pass, float, critical path** (§4.5–4.6). Test-first, golden
   cases continuing the numbering.
5. **`schedule()` public entrypoint** wiring validation → forward → backward
   → summary rollup (§4.1, §4.7) together, with the golden-file corpus
   (§11.1) as the acceptance bar for this slice — not the full ≥800/100%
   branch target yet, that accrues over Phases 1–2.
6. **`packages/schema`** — Zod schemas for the core entities (Task, Project,
   Dependency, Calendar...), with the eight CPM output columns omitted from
   input schemas per §3.3's rule. Needed before task routes can validate
   input properly.
7. **Task CRUD service + routes** in `apps/api` — `services/taskService.ts`,
   `routes/tasks.ts`, engine invoked inside the transaction (§9.3), version
   checks (§9.1), WBS `ltree` maintenance on move/indent (§3.7).
8. **Dependency routes** — `POST/DELETE /api/dependencies`, cycle rejection
   surfaced as a 4xx, not a 500.
9. **`packages/gantt`** — 10k-task synthetic benchmark *first* (risk R2 —
   TECHNICAL_DESIGN.md is explicit that this must be prototyped before the
   canvas-layer design is locked in), then the four-layer canvas, viewport
   virtualisation, bar rendering, dependency arrow routing.
10. **`apps/web` shell** — Vite + React, TanStack Router, login page, project
    list, TanStack Table grid view, the optimistic edit cycle (§7.2).
11. **Role management UI** — permission matrix, clone/create/edit, wired to
    the existing `role.manage`-guarded routes (which don't exist yet either —
    add `routes/roles.ts` alongside this).
12. **`infra/`** — `compose.yaml`, `api.Dockerfile`, `web.Dockerfile`
    (multi-stage, non-root, migration init container per §10.2).
13. **CI** — `.github/workflows`: lint, typecheck, test, build across the
    workspace via turbo.

**Phase 0's exit demo** (`docker compose up`, log in, create a custom role,
watch a 403) becomes reachable once 10–13 land, even though the CPM engine
work (1–9) isn't part of Phase 0's own scope — it's sequenced first here
because it's the higher-value, lower-risk work and nothing else depends on
waiting for it.

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
