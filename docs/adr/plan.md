# Delivery Plan — Pending Work

**Not an ADR.** This is a living checklist, not a decision record — it lives
in `docs/adr/` alongside them because there's nowhere better yet, and it
should be updated in place as work completes rather than superseded like an
ADR would be. If it goes stale, trust `git log` and the actual code over this
file, and fix this file to match.

**Status as of 2026-07-25.** Cross-checked against `docs/PROJECT_SCOPE.md` §8
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
  tables and exits 0, api passes its healthcheck, web serves on :8080.
  Fixed two real bugs found in the process (this predates the `apps/web`
  shell landing below, verified again end-to-end after it did): `migrate.ts` resolved the migrations path relative to
  `process.cwd()` (only worked via `tsx` from `apps/api/`, not from the
  compiled `dist/db/migrate.js` the Docker init container runs — now
  resolved relative to the module's own URL); the api healthcheck hit
  `localhost`, which Alpine resolves to `::1` first against a server that
  only binds `0.0.0.0` — changed to `127.0.0.1`.
- **CI** — `.github/workflows/ci.yml`: lint, typecheck, test, build via
  turbo. Matches what `pnpm <script>` already does locally; all four pass
  on the current tree.
- **`packages/schema`** — Zod input schemas for Task/Project/Dependency/
  Calendar (§3.3's rule: CPM output columns omitted from input schemas).
- **`packages/gantt`** — 10k-task synthetic benchmark (risk R2) and the
  four-layer canvas (background/arrows/bars/interaction, §8.2), viewport
  virtualisation (§8.3), hit-testing (§8.4), dependency arrow routing (§8.5).
- **Task CRUD + Dependency routes** in `apps/api` — `services/taskService.ts`,
  `routes/tasks.ts`, `routes/dependencies.ts`, `services/scheduleRunner.ts`
  (transactional `schedule()` invocation per §9.3, `withSerializableRetry`,
  `writeAuditLog`), WBS maintenance, version checks (§9.1).
- **Project CRUD** — `GET/POST /api/projects`, `GET/PATCH/DELETE
  /api/projects/:id`; `POST` bootstraps a default Mon–Fri calendar when
  none is supplied (`projects.calendar_id` is `NOT NULL`) and grants the
  creator Admin membership.
- **Production API boot fix** — every workspace package's `package.json`
  pointed `main`/`types` at raw `./src/index.ts`; harmless under `tsx`/Vite
  (both carry their own TS loaders) but plain `node` in the production
  Docker image refuses to type-strip anything under `node_modules` and
  crash-looped the api container the moment real code (not just types) got
  imported from `@pkg/schema`. Fixed by pointing `main`/`types` at `dist/`
  for every package; safe because turbo's `typecheck`/`test` tasks already
  `dependsOn: ["^build"]`, and `declarationMap` keeps go-to-definition on
  real source.
- **`infra/docker/nginx.conf`** — `apps/web` calls relative `/api/...` paths
  (same-origin, matching its Vite dev-server proxy; no CORS registered on
  the api side, since none is needed this way). The production nginx image
  had no equivalent, so `docker compose up` served the web app but every
  API call 404'd. Added a `/api/` → `http://api:3000` `proxy_pass`.
  Verified end-to-end with a real `docker compose up --build`.
- **`apps/web` shell** — Vite + React 19, TanStack Router/Query, Zustand
  (access token in-memory only, never `localStorage`), feature-sliced under
  `src/features/{auth,projects,tasks}/` (§7.3). Login, silent refresh on
  reload (via the httpOnly refresh cookie), project list, create-project
  flow, task grid (TanStack Table) and a Gantt panel wired to `@pkg/gantt`,
  the optimistic edit cycle (§7.2: local `schedule()` call on mutate, real
  server response reconciled on success).
- **Role management API** — `GET/POST /api/roles`, `PATCH /api/roles/:id`,
  `GET /api/permissions` (§5.2, §6.1, §6.3). `role.manage` has no natural
  project to scope against (roles are a global catalog; this codebase has
  no instance-wide superadmin concept), resolved by having the caller
  supply which project they're acting as an admin of, purely to authorize
  the call — a new `requirePermissionForProject` sibling to
  `requirePermission` in `middleware/permissions.ts`. System roles rejected
  at the service layer (403), not just the route guard; name collisions →
  409; unknown permission keys → 400; every mutation audit-logged.
- 260+ tests passing across the whole workspace (`packages/schema` 45,
  `packages/scheduler` 88, `packages/gantt` 19, `apps/api` 25, `apps/web`
  18, plus `packages/rbac`/`packages/ui`).

## Next up

TECHNICAL_DESIGN.md §13's Phase 0/1 build order is complete, including
**Role management UI** (`apps/web/src/features/roles/`: `PermissionMatrix`
shared by create/edit, `RoleList` with system roles read-only, clone as a
client-side create-prefill, `/projects/$projectId/roles`).

**Phase 0's exit demo** (`docker compose up`, log in, create a custom role,
watch a 403) is fully reachable end-to-end today.

Phase 2 (§13 items 27–34) is next, in order:

1. **SS/FF/SF link types + golden cases** — `packages/scheduler`'s
   forward/backward pass are FS-only today (`graphValidation.ts`,
   `forwardPass.ts`, `backwardPass.ts` all scope to it explicitly). Extend
   each link-type's date-propagation rule, add golden cases alongside the
   existing 001/002 (hand-computed/self-verified — no MS Project access in
   this environment, see item 8).
2. **Lead/lag, including negative** — same files as #1; do together, since
   lag interacts with every link type's propagation formula.
3. **All eight constraint types + precedence rules + ADR** — `§12.4`'s own
   worked ADR example *is* this feature ("hard constraints override
   dependencies"); write the real `docs/adr/002-*.md`, don't just reference
   the illustrative one in the design doc.
4. **Deadlines + warnings** — smaller; `SchedulingWarning` (`schedule.ts`)
   already has the shape reserved for this (`code`/`taskIds`/`message`,
   "not yet populated by anything"), so this is largely filling it in.
5. **Calendars: exceptions, recurrence, resource/task calendars** — spans
   two packages. `compileCalendar` already accepts an `exceptions` array
   (`packages/scheduler/src/calendar.ts`); recurrence is new. On the API
   side there are currently **no calendar or calendar-exception routes at
   all** (`calendar_exceptions` is a real table with zero CRUD surface) —
   this closes that gap, and also closes the documented approximation in
   `apps/web`'s optimistic edit cycle (`optimisticEdit.ts` passes
   `exceptions: []` today specifically because the task-tree endpoint has
   nothing to return).
6. **Gantt interaction: drag-to-move, resize, drag-to-link** —
   `packages/gantt`'s `GanttView` currently only exposes `onHover`; there is
   no drag-commit callback yet (confirmed when scoping the task-grid round —
   that's why the Gantt panel shipped read-only). Needs a new callback shape
   on `GanttView`, plus `apps/web` wiring the drag-end to `moveTask`/
   `patchTask`/dependency-create. Can start once #1–2 land (drag-to-link
   needs to know which link types are valid to offer).
7. **Undo/redo (command pattern over the mutation queue)** — `apps/web`
   only, orthogonal to the scheduler internals. Safe to parallelize against
   1–6.
8. **200-task reference plan vs. MS Project** — capstone validation for
   1–5. Same constraint as golden cases 001/002: no MS Project install in
   this environment, so "validated against MS Project" will mean
   hand-computed/self-verified reference output unless real MS Project
   output is supplied from outside this environment.

## What can run in parallel (one terminal per Claude Code session)

- **Items 1–4** share `packages/scheduler`'s pass/validation files closely
  enough that they're one terminal's sequential work, not four parallel
  ones — parallelizing them risks merge conflicts in the same functions.
- **Item 5's `packages/scheduler` half** (calendar recurrence) can run
  alongside 1–4 — `calendar.ts` isn't touched by the link-type/constraint
  work. Its `apps/api` half (routes) should wait until the recurrence data
  shape is settled, to avoid building routes around a shape that's still
  moving.
- **Item 7 (undo/redo)** has no code-level dependency on 1–6 and can start
  immediately in its own terminal.
- **Item 6 (Gantt interaction)** touches `packages/gantt` + `apps/web` only
  — no file overlap with 1–5 — but functionally wants #1–2 (link types) in
  place first for drag-to-link to offer real choices; an FS-only drag-to-
  move/resize slice could still start early if a terminal is free.
- **Item 8** depends on 1–5 being done — not parallelizable, it's testing
  them.

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
above — it accretes as `apps/web` needs components.

## Working conventions carried forward

- Tests before implementation for anything in `packages/scheduler` (explicit
  instruction, repeated in the build order at every engine step).
- Verify enforcement mechanisms actually enforce (ESLint rules, guards,
  drift tests) by deliberately triggering them, not just reading the config.
- Only commit when asked; summarize and wait after each unit of work.
