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
| 2 — Full scheduling | 8 | 7 (link types+lag; constraints+ADR; deadlines; calendars; undo/redo; 200-task reference plan) | 1 (Gantt interaction — slices 1–2/3 done: move, resize; drag-to-link remains) | 0 | 88% |
| 3 — Resources | 6 | 0 | 0 | 6 | 0% |
| 4 — Tracking | 6 | 0 | 0 | 6 | 0% |
| 5 — Interop & reporting | 4 | 0 | 0 | 4 | 0% |
| 6 — Agile | 7 | 0 | 0 | 7 | 0% |
| **Total** | **57** | **33** | **1** | **23** | **~58%** |

**~58% done, ~40% pending, ~2% in progress** (33/57 done — Phases 0–1
complete, plus seven of Phase 2's eight items; 1/57 in progress — Gantt
drag interaction's final drag-to-link slice; 23/57 not started). Nothing
in Phases 3–6 (resources, tracking, interop/reporting, agile) has
started.

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
- **Task deadlines + `DEADLINE_MISSED`** (§13 item 30, Cursor,
  `packages/scheduler`) — observational only (never moves a task),
  checked against the *constraint-adjusted* `earlyFinish` (not a
  pre-constraint value) as one more step in the existing per-task forward
  pass loop; no backward-pass/float/schedule.ts changes needed since the
  warning-collection plumbing already existed from item 29. A task can
  carry both `CONSTRAINT_OVERRIDES_DEPENDENCY`/`SOFT_CONSTRAINT_VIOLATED`
  and `DEADLINE_MISSED` in the same warnings array — independent checks,
  not exclusive. Golden corpus grew 13 → 15 (014–015); 014 independently
  re-derived by hand during review, matches exactly. Same flagged-gap
  pattern as `lagPercent`: `apps/api`'s `toTaskInputs` didn't read the
  `deadline` column at merge time — closed opportunistically in the very
  next commit (Gantt drag-to-move) while that function was already being
  touched for `constraintType`/`constraintDate`.
- **Gantt drag-to-move** (§13 item 6, slice 1 of 3) — task dates are
  computed (ASAP from dependencies), not directly settable, so dragging
  a bar sets an MSO constraint at the drop date via the existing
  `PATCH /api/tasks/:id`, reusing item 29's constraint system rather
  than inventing new engine/API surface. `GanttView` gained a real
  pointer-down/move/up state machine (previously only `onHover`
  existed): preserves the grab offset so the bar doesn't jump to align
  its edge with the cursor, snaps to whole-day boundaries, uses
  `setPointerCapture`/`releasePointerCapture` with `pointercancel`
  wired to the same handler so an OS-interrupted drag can't leave the
  state stuck, forces a synchronous paint before hit-testing so the
  spatial index can't be stale, and refuses to start a drag on a
  summary bar (`GanttTask` gained `isSummary`). `MutationResult` gained
  a `warnings` field (previously `schedule()`'s warnings were computed
  and silently discarded by *every* mutation, not just this one) —
  `CONSTRAINT_OVERRIDES_DEPENDENCY` now surfaces through the web app's
  error banner with a new distinct info (green, `role="status"`)
  styling rather than the red error treatment. Undo/redo's
  `TaskEditFields` widened to cover constraints so a drag-move is
  undoable via the same Cmd/Ctrl+Z stack as a grid edit — this also
  fixed a latent bug where the old hardcoded name/duration-only check
  would have silently dropped a constraint-only undo command. **Resize
  and drag-to-link remain out of scope** — separate follow-up rounds.
- **200-task reference plan capstone** (§13 item 34, Cursor,
  `packages/scheduler`) — 203 tasks (193 leaf + 10 summary), 197
  dependencies, three calendars (a 24/7 continuous calendar hosting the
  130-task critical spine so weekend/holiday packing can't insert
  artificial float into the TF=0 chain; a Mon–Fri calendar with a
  holiday exception; a Mon–Sat ops calendar), all four link types,
  fixed/negative/percentage lag, six of the seven implemented constraint
  types, both `CONSTRAINT_OVERRIDES_DEPENDENCY` and `DEADLINE_MISSED`
  firing on purpose. No MS Project install in this environment (the
  standing caveat on every golden case), so validated two ways instead:
  a 16-task hand-verified sample in `notes.md`, and five global
  invariants (link-type/lag ordering, float ordering, critical-path
  connectivity, working-time-only spans, `schedule()` determinism) in
  `referencePlanInvariants.test.ts` asserted against the full output.
  Independently re-verified during review with a from-scratch script,
  outside their test harness, that rebuilds the package and calls
  `schedule()` directly on the fixture's raw input — byte-for-byte match
  against `expected.json`, proving it's real engine output, not a
  hand-typed or drifted fixture.
- **Gantt bar resize** (item 6, slice 2 of 3) — right-edge only
  (`RESIZE_EDGE_PX` hit-slop), disambiguated from a move-drag by
  checking edge proximity in `handlePointerDown` before falling through
  to the existing move logic. `DragGhost` became a
  `{ kind: 'move' | 'resize' }` union. `snapDurationMinutes` clamps to a
  minimum of one day. Commits plain `durationMinutes` through the same
  `useTaskEdit` mutation `TaskGrid`'s inline duration cell already
  uses — no new undo/optimistic-edit plumbing needed, unlike move's MSO
  mapping. Left-edge resize remains explicitly out of scope.

**Phase 2 (TECHNICAL_DESIGN.md §13, all eight build-order items) is now
fully done**, except item 6's final drag-to-link slice (always scoped
as a follow-up) and the small flagged `lagPercent` wiring gap.

## Next up

TECHNICAL_DESIGN.md §13's Phase 0/1 build order is complete, including
**Role management UI** (`apps/web/src/features/roles/`: `PermissionMatrix`
shared by create/edit, `RoleList` with system roles read-only, clone as a
client-side create-prefill, `/projects/$projectId/roles`).

**Phase 0's exit demo** (`docker compose up`, log in, create a custom role,
watch a 403) is fully reachable end-to-end today.

Phase 2 (§13 items 27–34), status:

1. **SS/FF/SF link types + golden cases** — **done**.
2. **Lead/lag, including negative and percentage** — **done**. **Loose
   end still open**: `apps/api`'s `scheduleRunner.ts#toDependencyInputs`
   still doesn't read `lagPercent` off the DB row (confirmed still true
   as of this check), so a percentage-lag dependency set via the API is
   silently ignored by the live server even though the engine, DB
   column, and Zod schema all support it. Small, precise, `apps/api`-only
   fix — good pickup for a spare terminal.
3. **All eight constraint types + precedence rules + ADR** — **done**
   (seven of eight — ALAP deliberately throws; `docs/adr/002-constraint-precedence.md`).
4. **Deadlines + warnings** — **done**. `DEADLINE_MISSED`, checked
   against the constraint-adjusted `earlyFinish`. Golden corpus 13 → 15.
5. **Calendars** — **done** except the resource-calendar sub-piece
   (deferred to Phase 3, `resources.calendar_id` exists but nothing
   schedules against it yet).
6. **Gantt interaction: drag-to-move, resize, drag-to-link** — **slices 1–2
   of 3 done** (drag-to-move → MSO constraint; right-edge resize →
   `durationMinutes`). **Drag-to-link remains** — the only Phase 2 item
   not yet done. `apps/web` has never called `POST /api/dependencies` —
   `createDependency` doesn't exist yet in `features/tasks/api.ts`, so
   this slice also adds that, not just the Gantt-side gesture.
7. **Undo/redo** — **done**.
8. **200-task reference plan vs. MS Project** — **done**. No MS Project
   install in this environment (same standing caveat as every other
   golden case), so this uses a two-tier approach instead: `expected.json`
   is engine-generated, a 16-task representative sample is hand-verified
   in `notes.md`, and five global invariants (`referencePlanInvariants.test.ts`)
   are asserted against the full 203-task output. Independently
   re-verified during review by rebuilding `packages/scheduler` and
   running a from-scratch script (outside their test harness) that
   recompiles the fixture's calendars/tasks/dependencies and calls
   `schedule()` directly — byte-for-byte match against `expected.json`.

**Phase 2 (§13 items 27–34) is now fully done**, except item 6's resize
and drag-to-link slices (always scoped as separate follow-ups) and the
small flagged `lagPercent` wiring gap under item 2.

## What can run in parallel (one terminal per Claude Code session)

**No longer relevant** — back to a single active terminal on this
project as of 2026-07-25 (the second, parallel Cursor/Claude Code
session used earlier in Phase 2 is no longer in use). Two of its
worktrees were fully merged and cleaned up already
(`link-types-lag`); `project-scheduler-role-mgmt` remains — `git`
operations on it (`status`, `worktree remove --force`) hung
repeatedly during cleanup with no error, cause not yet diagnosed
(no `index.lock` present; Cursor background git-worker processes were
running and may be the culprit). Left untouched; the user will handle
it outside this session. Don't attempt to remove it again without new
information — retrying the same hung command isn't productive.

Remaining unclaimed work (item 6's drag-to-link slice, the small
`lagPercent` gap) is now just sequential backlog, not something to
split across terminals.

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
