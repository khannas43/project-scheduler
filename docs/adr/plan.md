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
| 2 — Full scheduling | 8 | 5 (link types+lag; constraints+ADR; calendars; undo/redo) | 0 | 3 | 63% |
| 3 — Resources | 6 | 0 | 0 | 6 | 0% |
| 4 — Tracking | 6 | 0 | 0 | 6 | 0% |
| 5 — Interop & reporting | 4 | 0 | 0 | 4 | 0% |
| 6 — Agile | 7 | 0 | 0 | 7 | 0% |
| **Total** | **57** | **31** | **0** | **26** | **~54%** |

**~54% done, ~46% pending** (31/57 done — Phases 0–1 complete, plus
Phase 2's link types+lag, constraints+ADR, calendar-exceptions/recurrence,
and undo/redo items; 26/57 not started, none currently in progress).
Nothing in Phases 3–6 (resources, tracking, interop/reporting, agile)
has started.

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
- **SS/FF/SF link types, signed + percentage lag** (§13 items 27–28,
  Cursor, `packages/scheduler`) — forward/backward pass were FS-only;
  now all four link types per §4.4/§4.5's formula tables, via a shared
  `applyLag`/`unapplyLag` (`lag.ts`) that picks `addWorkingMinutes` vs
  `subtractWorkingMinutes` by lag sign. FF/SF's duration back-derivation
  is calendar-aware (derive a candidate finish, then
  `subtractWorkingMinutes` to the true start), not flat arithmetic — the
  same technique the backward pass's SS/SF branches mirror going the
  other direction. `lagPercent` (MS Project convention: percentage of
  the *predecessor's* duration) resolved once via `resolveLagMinutes`
  before either pass touches it. Golden corpus grew 2 → 7 cases
  (003–007); one (007, percentage lag crossing a Monday→Tuesday working
  boundary) independently re-derived by hand during review, not just
  re-run. **Not yet wired**: `apps/api`'s `toDependencyInputs` doesn't
  read `lagPercent` off the DB row, so the live server still silently
  ignores it on a real dependency today — flagged explicitly, not
  hidden, and `DependencyInput.lagPercent`'s type is optional
  specifically so this doesn't block compilation until it's fixed.
- **Constraint types + precedence + ADR** (§13 item 29, Cursor,
  `packages/scheduler`) — seven of eight types (`asap`/`snet`/`fnet`/
  `mso`/`mfo`/`snlt`/`fnlt`) applied per-task in the forward pass after
  the dependency-derived early start, per §4.4's four-rule precedence
  model (hard override unconditionally + warn, semi-hard push later
  only, soft never move + warn-only). `docs/adr/002-constraint-precedence.md`
  is the real ADR §12.4 only sketched an example of. **ALAP deliberately
  throws** rather than shipping a silently-wrong schedule — the naive
  "snap to late dates" approach can leave a successor's displayed early
  start before this task's displayed early finish unless the change is
  re-propagated through the downstream subgraph, which is out of scope
  for this round; both the has-successors and no-successors cases throw
  (the latter is actually safe, but implementing only one arm would
  leave an asymmetric surface). `runForwardPass` now returns
  `{ results, warnings }` (a deliberate breaking change, all call sites
  updated) so `schedule()`'s `warnings` field is finally populated
  instead of hardcoded to `[]`. Golden corpus grew 7 → 13 (008–013).
  Independently verified during review: MSO's override is confirmed at
  the source to be a true unconditional assignment, not an accidental
  `max()`; golden case 010 (MSO override) independently re-derived by
  hand, including confirming the backward pass/float/criticality all
  correctly use the *post-constraint* early dates, not the pre-constraint
  dependency candidate.

## Next up

TECHNICAL_DESIGN.md §13's Phase 0/1 build order is complete, including
**Role management UI** (`apps/web/src/features/roles/`: `PermissionMatrix`
shared by create/edit, `RoleList` with system roles read-only, clone as a
client-side create-prefill, `/projects/$projectId/roles`).

**Phase 0's exit demo** (`docker compose up`, log in, create a custom role,
watch a 403) is fully reachable end-to-end today.

Phase 2 (§13 items 27–34), status:

1. **SS/FF/SF link types + golden cases** — **done** (see Done section
   above). Golden corpus grew 2 → 7 (003–007), each hand-verified — one
   independently re-derived by hand during review (007's percentage lag
   across a Monday→Tuesday working-day boundary, including the
   free-float-under-zero-total-float subtlety), not just re-run.
2. **Lead/lag, including negative and percentage** — **done**, same
   commit as #1. **One flagged loose end**: `apps/api`'s
   `scheduleRunner.ts#toDependencyInputs` doesn't read `lagPercent` off
   the DB row yet, so a percentage-lag dependency set via the API is
   silently ignored by the live server even though the engine, DB column,
   and Zod schema all support it now. `DependencyInput.lagPercent` was
   deliberately made optional so this doesn't break compilation in the
   meantime — small, precise fix before item 3 leans on it further.
3. **All eight constraint types + precedence rules + ADR** — **done**
   (seven of eight — ALAP deliberately throws; see Done section above
   and `docs/adr/002-constraint-precedence.md`).
4. **Deadlines + warnings** — next up. `SchedulingWarning`
   (`schedule.ts`) already has the shape (`code`/`taskIds`/`message`)
   and is now actually threaded through to `SchedulerOutput.warnings`
   (item 3's work), so this is filling in the deadline-specific warning
   path ADR 002 explicitly scoped out ("Deadlines... are out of scope
   here"). Same files as items 1–3 (`forwardPass.ts` most likely).
5. **Calendars** — **done** except the resource-calendar sub-piece (see
   Done section above; deferred to Phase 3).
6. **Gantt interaction: drag-to-move, resize, drag-to-link** — not
   started. `packages/gantt`'s `GanttView` currently only exposes
   `onHover`; there is no drag-commit callback yet (confirmed when scoping
   the task-grid round — that's why the Gantt panel shipped read-only).
   Needs a new callback shape on `GanttView`, plus `apps/web` wiring the
   drag-end to `moveTask`/`patchTask`/dependency-create. Drag-to-link can
   now offer real link-type choices since #1 landed.
7. **Undo/redo** — **done** (see Done section above).
8. **200-task reference plan vs. MS Project** — not started; capstone
   validation for 1–5, blocked until #4 lands. Same constraint as golden
   cases 001–013: no MS Project install in this environment, so "validated
   against MS Project" will mean hand-computed/self-verified reference
   output unless real MS Project output is supplied from outside this
   environment.

Remaining work: #4 (`packages/scheduler`, alone now — no other terminal
contending for those files at the moment) and #6 (`packages/gantt`/
`apps/web`) can run in separate terminals. The `lagPercent` wiring gap
(flagged under item 2) is a small, separate `apps/api`-only fix that
doesn't conflict with either.

## What can run in parallel (one terminal per Claude Code session)

- ~~Items 1–3, 5, 7~~ — done.
- **Item 4 (deadlines + warnings)** — `packages/scheduler`, alone for now
  (no other terminal currently contending for `forwardPass.ts`/
  `schedule.ts`).
- **Item 6 (Gantt interaction)** — `packages/gantt` + `apps/web`, no file
  overlap with item 4. Safe to run in its own terminal alongside it.
- **Item 8** depends on items 1–5 — not parallelizable (it's testing
  them), and item 4 isn't done yet.
- The small **`lagPercent` wiring gap** (flagged under item 2's Done
  entry) lives in `apps/api/src/services/scheduleRunner.ts`, not
  `packages/scheduler` — doesn't conflict with item 4 or item 6, so it
  can land from either terminal without waiting on anything.

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
