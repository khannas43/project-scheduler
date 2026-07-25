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

## Overall progress

Counted by **build-order item**, not effort — TECHNICAL_DESIGN.md §13's
numbered list for Phases 0–2, this plan's own 8-item sequencing for Phase 2,
and one count per bullet in PROJECT_SCOPE.md §8's Phase 3–6 feature lists
(counting Phase 5's `MS Project XML round-trip / CSV/Excel/PDF/PNG export /
report builder / dashboards` as 4, matching how the source bullet is
already segmented). **Items are not equal size** — a Phase 0 step like
"CI: lint, typecheck, test, build" and a Phase 2 step like "Gantt drag-to-
move, resize, drag-to-link" both count as 1. Phases 3–6 in particular are
each roughly as large as Phase 0+1 combined, so this % likely *overstates*
true completion, not understates it — treat it as a checklist-coverage
number, not a timeline estimate.

| Phase | Items | Done | In progress | Pending | % done |
|---|---|---|---|---|---|
| 0 — Foundation | 12 | 12 | 0 | 0 | 100% |
| 1 — Core planning | 14 | 14 | 0 | 0 | 100% |
| 2 — Full scheduling | 8 | 2 (calendars; undo/redo) | 2 (link types+lag) | 4 | 25% |
| 3 — Resources | 6 | 0 | 0 | 6 | 0% |
| 4 — Tracking | 6 | 0 | 0 | 6 | 0% |
| 5 — Interop & reporting | 4 | 0 | 0 | 4 | 0% |
| 6 — Agile | 7 | 0 | 0 | 7 | 0% |
| **Total** | **57** | **28** | **2** | **27** | **~49%** |

**~49% done, ~47% pending, ~4% in progress** (28/57 done — Phases 0–1
complete, plus Phase 2's calendar-exceptions/recurrence and undo/redo
items; 2/57 in progress on terminal 2's `link-types-lag` branch;
27/57 not started). Nothing in Phases 3–6 (resources, tracking,
interop/reporting, agile) has started.

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
- **Undo/redo for task edits** (§13 item 33) — command-pattern stack
  (`apps/web/src/features/tasks/undoStack.ts`), capped at 50, replays the
  inverse/forward patch through the same `useTaskEdit` mutation (not a
  cache rollback) using the task's *live* current version, not one
  captured when the command was pushed — regression-tested by bumping the
  cached version between the edit and the undo. Cmd/Ctrl+Z, scoped to
  `ProjectDetailPage`'s mount lifecycle.
- **Recurring calendar exceptions** (part of §13 item 5) —
  `packages/scheduler/src/calendarRecurrence.ts`'s `expandRecurringExceptions`
  unrolls an annual-recurrence exception into one instance per year in the
  compile horizon, pure integer proleptic-Gregorian date math (no `Date`,
  per the package's purity rule), Feb 29 anchors skip non-leap years.
  `calendar_exceptions.recurrence` existed in the schema since the
  original design but was silently ignored until now — `scheduleRunner`'s
  `exceptionsFromDbRows` wires it through `compileCalendar`, proven with a
  test showing a *later* year's Dec 25 (not just the anchor) actually
  zeros working minutes.
- **Calendar exception CRUD routes** (rest of §13 item 5) —
  `GET/POST /api/calendars/:id/exceptions`, `DELETE
  /api/calendar-exceptions/:id`, `calendar.manage`. Scoped to
  project-owned calendars only — global template calendars
  (`calendar_id = null`) are deliberately rejected rather than guessing at
  an authorization model this codebase doesn't have (no superadmin
  concept). Create/delete trigger `rescheduleProject` and are
  audit-logged, same pattern as task/dependency mutations. Item 5's
  "resource calendars" sub-piece remains open — `resources.calendar_id`
  exists as a schema column but nothing schedules against it yet, which
  naturally belongs with Phase 3 (Resources) once resource assignment
  itself is built, not before.

## Next up

TECHNICAL_DESIGN.md §13's Phase 0/1 build order is complete, including
**Role management UI** (`apps/web/src/features/roles/`: `PermissionMatrix`
shared by create/edit, `RoleList` with system roles read-only, clone as a
client-side create-prefill, `/projects/$projectId/roles`).

**Phase 0's exit demo** (`docker compose up`, log in, create a custom role,
watch a 403) is fully reachable end-to-end today.

Phase 2 (§13 items 27–34), status:

1. **SS/FF/SF link types + golden cases** — **in progress** (Cursor,
   branch `link-types-lag`, `packages/scheduler` only: `taskTypes.ts`,
   `forwardPass.ts`, `backwardPass.ts`, `float.ts` + golden cases
   003–004+). Nothing else should touch these files until it lands and is
   reviewed/merged.
2. **Lead/lag, including negative** — **in progress**, same branch as #1.
3. **All eight constraint types + precedence rules + ADR** — blocked on
   #1–2 landing (same files). `§12.4`'s own worked ADR example *is* this
   feature ("hard constraints override dependencies"); write the real
   `docs/adr/002-*.md`, don't just reference the illustrative one in the
   design doc.
4. **Deadlines + warnings** — not started. `SchedulingWarning`
   (`schedule.ts`) already has the shape reserved for this
   (`code`/`taskIds`/`message`, "not yet populated by anything"), so this
   is largely filling it in. Blocked behind #1–3 the same way, same files.
5. **Calendars** — **done** except the resource-calendar sub-piece (see
   Done section above; deferred to Phase 3).
6. **Gantt interaction: drag-to-move, resize, drag-to-link** — not
   started. `packages/gantt`'s `GanttView` currently only exposes
   `onHover`; there is no drag-commit callback yet (confirmed when scoping
   the task-grid round — that's why the Gantt panel shipped read-only).
   Needs a new callback shape on `GanttView`, plus `apps/web` wiring the
   drag-end to `moveTask`/`patchTask`/dependency-create. Can start once
   #1–2 land (drag-to-link needs to know which link types are valid to
   offer).
7. **Undo/redo** — **done** (see Done section above).
8. **200-task reference plan vs. MS Project** — not started; capstone
   validation for 1–5, blocked until 1–4 land. Same constraint as golden
   cases 001/002: no MS Project install in this environment, so "validated
   against MS Project" will mean hand-computed/self-verified reference
   output unless real MS Project output is supplied from outside this
   environment.

Not blocked on #1–3 and safe to pick up now: **#6** (an FS-only
drag-to-move/resize slice, per the parallel-safety note below).

## What can run in parallel (one terminal per Claude Code session)

- **Items 1–4** share `packages/scheduler`'s pass/validation files closely
  enough that they're one terminal's sequential work, not four parallel
  ones — parallelizing them risks merge conflicts in the same functions.
  Currently occupied: terminal 2 / Cursor, branch `link-types-lag`
  (items 1–2). Don't start 1–4 elsewhere until that branch lands and is
  reviewed/merged.
- ~~Item 5~~ — done (both halves landed: scheduler-side recurrence
  expansion and the `apps/api` CRUD routes).
- ~~Item 7~~ — done (undo/redo).
- **Item 6 (Gantt interaction)** touches `packages/gantt` + `apps/web`
  only — no file overlap with 1–5 — but functionally wants #1–2 (link
  types) in place first for drag-to-link to offer real choices. Not
  blocked on the in-progress branch's files, so an FS-only drag-to-
  move/resize slice can start now in a free terminal.
- **Item 8** depends on 1–5 being done — not parallelizable, it's testing
  them, and 1–4 aren't done yet.

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
