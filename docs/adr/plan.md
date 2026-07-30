# Delivery Plan — Pending Work

**Not an ADR.** This is a living checklist, not a decision record — it lives
in `docs/adr/` alongside them because there's nowhere better yet, and it
should be updated in place as work completes rather than superseded like an
ADR would be. If it goes stale, trust `git log` and the actual code over this
file, and fix this file to match.

**Status as of 2026-07-30.** Cross-checked against `docs/PROJECT_SCOPE.md` §8
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
| 2 — Full scheduling | 8 | 8 (all items done) | 0 | 0 | 100% |
| 3 — Resources | 6 | 6 (all items done) | 0 | 0 | 100% |
| 4 — Tracking | 6 | 6 (all items done) | 0 | 0 | 100% |
| 5 — Interop & reporting | 4 | 4 (all items done) | 0 | 0 | 100% |
| 6 — Agile | 7 | 7 (all rounds done) | 0 | 0 | 100% |
| **Total** | **57** | **57** | **0** | **0** | **100%** |

**100% checklist coverage** (57/57 done — Phases 0–6 complete). CFD remains
explicitly deferred as a separate future feature (documented on the Agile
charts page), not a silent omission from Phase 6 Round 4.

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
  re-run.
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
  pattern as `lagPercent` (below, since fixed): `apps/api`'s
  `toTaskInputs` didn't read the `deadline` column at merge time —
  closed opportunistically in the very next commit (Gantt drag-to-move)
  while that function was already being touched for
  `constraintType`/`constraintDate`.
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
- **Gantt drag-to-link** (item 6, slice 3 of 3 — closes item 6) —
  Shift+right-edge starts a link-drag instead of a resize (checked
  inside the existing resize-edge branch, before `resizeDrag` is set,
  so it takes priority; plain right-edge is unaffected). Always creates
  a plain FS dependency with `lagMinutes: 0` — no UI anywhere lets a
  user choose link type/lag at creation time, deliberately out of scope
  rather than invented here. `DragGhost` gained a third
  `{ kind: 'link' }` variant (a live rubber-band line with an arrowhead
  angle computed from the actual line direction, not copied from the
  static arrows layer's fixed-direction assumption). Drop target
  resolves via the same `hitTest` used for hover, cancelling silently
  on empty space/same-task/summary-target, matching the existing
  no-op convention from move/resize. `apps/web` had never called
  `POST /api/dependencies` before this — added `createDependency`/
  `useCreateDependency`, no optimistic preview (creating a dependency
  needs the server's own graph/cycle validation, unlike a task edit's
  cheap local `schedule()` re-derivation), a 409 cycle-rejection
  surfaces through the existing error banner as a real, expected
  outcome. **Not undoable this round** — dependency creation doesn't
  fit the undo stack's single-task field-patch model.
  First-round review caught a real gap (not a bug): the hook landed
  with zero test coverage, including the 409 path explicitly called out
  as needing one. Closed in an immediate, isolated follow-up
  (`useDependencies.test.ts`, no production code changes) — success
  merge, 409 cycle surfacing the server's exact `detail`/`code`, and
  the no-cache-yet fallback to `invalidateQueries`, including an
  unprompted but valuable addition: asserting the query cache is
  provably unchanged after a failed mutation.
- **`lagPercent` wiring fix** (`apps/api`) — `toDependencyInputs` never
  read the `lag_percent` column; a `numeric()` column, which Drizzle
  returns as `string | null` not a native number, so a percentage-lag
  dependency was silently scheduled as if unset even though the engine,
  DB column, and Zod schema all supported it since items 27–28 landed.
  Fixed directly (not via Cursor — small and precise enough to do
  inline) with two new regression tests, and verified against the live
  dev server (`tsx watch`, picked up the change automatically): created
  a real FS dependency with `lagPercent: 50` via the API and confirmed
  the successor's `earlyStart` landed exactly 240 working minutes (50%
  of the 480-minute predecessor) later — proof the live server applies
  it now, not just an isolated unit test.

**Phase 2 (TECHNICAL_DESIGN.md §13, all eight build-order items) is now
fully done, with no known gaps anywhere in the codebase.**

- **Resource pool + task assignments backend** (Phase 3 kickoff, §3.5) —
  `packages/schema` (`resource.ts`/`assignment.ts`) + `apps/api`
  (`resourceService`/`resourceRoutes`, `assignmentService`/
  `assignmentRoutes`). Resources are a global, instance-wide pool (per
  the schema's own comment), not project-scoped — reuses roles'
  `requirePermissionForProject` pattern exactly. Assignments are
  project-scoped via `taskId` → task → project, resolved through
  `resolveProjectId` the same way dependency routes already are.
  `workMinutes`/`cost` are server-computed (`computeWorkAndCost`),
  never client input, matching §3.3's CPM-output-omission rule.
  `numericToDb`/`numericFromDb` centralize the Drizzle
  `numeric()`-as-string boundary conversion that's bitten this codebase
  twice before (`lagPercent`, `deadline`) — this time built as a shared
  helper from the start. Overallocation is computed across *all* of a
  resource's assignments globally (not scoped to one project, since the
  pool itself isn't project-scoped), bucketed by UTC calendar day —
  deliberately not working-minute granularity, which is
  `assignment_timephased`'s job and stays unbuilt. `listProjectTasks`
  (§5.3) now also returns `assignments`, matching how
  `dependencies`/`calendars` already ride along. Independently
  reviewed in full (numeric round-trip, delete-with-assignments guard,
  overallocation day-bucketing hand-traced against two overlapping
  spans, route-guard drift extended to assert all 8 new routes by
  name) — no bugs found.
  **Not built this round**: `assignment_timephased` (full timephased
  work distribution), any `apps/web` UI (resource sheet/usage views —
  Phase 3's stated exit criterion still needs this), overtime-rate
  costing.
- **Resource sheet, task-assignment UI, and timephased work
  distribution** — closes out Phase 3. `apps/web/src/features/resources/`
  (mirrors `features/roles/`'s layout) — global-catalog CRUD,
  `ResourceSheet` with a per-row `OverallocationBadge` (independently
  mounted so the table never blocks on any row's overallocation query),
  delete surfaces the server's 400-with-assignments through the
  existing error banner. `AssignmentPanel` (opened via a per-row
  "Resources" action in `TaskGrid`, skipped for summaries) filters
  `TaskTreeResponse.assignments` to the current task; its three
  mutations mirror `useCreateDependency`'s exact non-optimistic pattern
  since assignments don't drive the CPM engine.
  **Timephased distribution** (`assignment_timephased`, §3.5) —
  recomputed only when the assignment itself is created or its units
  change, deliberately *not* wired into `scheduleRunner.ts`'s
  `rescheduleProject` (the shared, safety-critical transaction loop
  every other mutation depends on) — if a task's own schedule shifts
  later for an unrelated reason, its assignments' timephased rows go
  stale until the assignment is touched again. **A deliberate,
  explicit limitation for this round**, not silently swept under the
  rug; wiring it into every reschedule is a separate, dedicated future
  round given the blast radius of touching that shared loop.
  `distributeWorkAcrossWorkingDays` is genuinely calendar-aware (reuses
  the newly-exported `loadCompiledCalendars`, checks each day's actual
  working capacity via the compiled calendar's `slots` array) — proven
  with a real mid-range holiday exception built through `compileCalendar`
  itself, not mocked. Evenly splits work minutes across working days,
  remainder on the last day so the total always matches exactly.
  `refreshTimephasedDistribution` deletes prior rows before inserting
  (the table's composite PK has no natural `(assignment_id,
  period_date)` uniqueness to upsert against — `id` is freshly
  generated per row purely to satisfy Postgres's partition-key
  requirement) — confirmed idempotent across two recomputes with
  different unit values in the same test. `GET
  /api/assignments/:id/timephased` added under the existing
  `resource.assign` guard; the route-guard drift test explicitly
  asserts its key since GET routes are otherwise skipped by that
  test's method filter — this was called out specifically because it
  would have been a silent, untested guard otherwise. Independently
  reviewed in full — no bugs found.

**Phase 3 (PROJECT_SCOPE.md §8: resource pool, assignments, cost
model, overallocation detection, timephased distribution, resource
sheet/usage views) is now fully done.**

- **Baselines, actuals, status date, summary % rollup** (Phase 4 slice
  1 of 2, §3.6/§4.7) — migration `0001` adds `projects.status_date`
  (genuinely missing until now). `TaskUpdateInputSchema` (update only,
  not create — a new task has no actuals yet) gains `percentComplete`,
  `actualStart`/`actualFinish`, `actualDurationMinutes`,
  `remainingDurationMinutes`. `rollupSummaries` finally implements
  §4.7's formula (`Σ(child.pct × child.duration) / Σ(child.duration)`,
  null child → 0, null when total duration is 0), correctly composing
  nested summaries bottom-up (a grandparent weights by a summary's own
  rolled-up duration, not its leaves' raw durations — verified by a
  hand-computed 3-level test). A leaf's `percentComplete` is user-set;
  a summary's is always engine-computed — `percentCompleteWritebackValue`
  plus a conditional-spread `.set()` ensure the reschedule write-back
  only ever touches summaries, confirmed **live against the running
  dev server**: set one child to 100%, edited its sibling's duration
  (an unrelated reschedule trigger), confirmed the 100% survived and
  the summary correctly re-rolled with the new weighting.
  `baselineService` snapshots schedule dates plus cost/work summed
  from each task's *assignments* (the task row has no cost field),
  distinguishing "no assignments" (`null`) from "assignments summing
  to exactly `0`" on both the capture and detail sides; 0..10
  baseline-slot exhaustion rejected with `BadRequestError`;
  `getBaselineDetail` computes start/finish/duration/cost variance
  against the live task. Independently reviewed in full — no bugs
  found.
- **Earned value metrics + S-curve** (Phase 4 slice 2 of 2, closes
  Phase 4) — `AssignmentUpdateInputSchema` makes `units` optional and
  adds `actualWorkMinutes`/`actualCost` — a genuine gap closed here:
  those columns existed since Phase 0 but nothing let a user set them,
  so CPI could never have real Actual Cost behind it.
  `earnedValueService` computes BAC/PV/EV/AC/SPI/CPI summed over leaf
  tasks only (`!isSummary`, tested against an adversarial case — a
  summary row carrying a huge baseline cost, proven not to leak into
  any sum). PV is a genuine time series interpolated from baseline
  start/finish dates (a milestone is a start-equals-finish step
  function, not a divide-by-zero); **EV and AC are single
  point-in-time values only** — this codebase has no historical
  `percentComplete`/`actualCost` tracking, so a fabricated EV/AC curve
  would misrepresent real data as history; that's a deliberate,
  explicit scope boundary, not an oversight. SPI/CPI resolve to `null`
  on divide-by-zero, never `NaN`/`Infinity`. `resolveBaseline`
  validates a caller-supplied `baselineId` actually belongs to the
  requested project before using it — prevents leaking another
  project's cost data via an arbitrary baseline id, a real check I
  didn't explicitly ask for. `apps/web/src/features/tracking/`:
  `BaselinesPage` (save/list/variance), `EarnedValuePanel` (the six
  stats), `SCurveChart` — a hand-rolled inline SVG (no new charting
  dependency) with a real PV polyline and distinct point markers for
  EV/AC, not fabricated curve data. Independently hand-verified the
  test's worked BAC/PV/EV/AC/SPI/CPI scenario — matches exactly.
  Reviewed in full — no bugs found.

**Phase 4 (PROJECT_SCOPE.md §8: baselines, actuals, status date,
variance columns, earned value metrics, S-curve) is now fully done.**

- **MS Project XML (MSPDI) export + import** (Phase 5, item 1 of 4) —
  `.mpp` (binary) stays explicitly out of scope per §10 ("no JVM
  sidecar"); this is the plain-XML MSPDI interchange format only.
  Every numeric code mapping (link type, constraint type, resource
  type, accrue-at, weekday) was independently verified against
  Microsoft's own primary documentation rather than memory — caught
  and fixed a real error in the first draft's `PredecessorLink` `Type`
  codes before it shipped (only `FS` was right; `SS`/`FF`/`SF` were
  transposed). `mspdiExportService.ts`'s `buildMspdiXml` is pure (no
  DB inside the builder), hand-verified against a golden fixture, well-
  formedness checked via a real stack-based tag-balance parse.
  `mspdiImportService.ts`'s reverse code maps are built by **probing
  the export functions** rather than re-deriving codes a second time —
  structurally impossible for import/export to disagree. Import
  replaces a project's tasks/dependencies/assignments wholesale
  (matching FK cascades already in place); resources/calendars are
  matched-or-created by case-insensitive name instead, since they're a
  shared pool. The file's graph is validated (existing
  cycle/orphan/summary-link checks) before any writes — a rejected
  file leaves the project untouched, proven by a test asserting the
  delete/reschedule calls never fire. The highest-value test
  round-trips `buildMspdiXml`'s own output back through `parseMspdiXml`
  and asserts every field matches the original input — real proof
  export and import agree. Independently reviewed in full, including
  tracing a dangling-`PredecessorUID` edge case through to its actual
  resolution (caught by the existing orphan check) rather than either
  assuming it was fine or flagging an unconfirmed suspicion — no bugs
  found.
- **CSV/Excel/PDF/PNG export** (Phase 5, item 2 of 4) — `GET
  /api/projects/:id/export/{csv,excel,pdf}` under the existing
  `data.export` permission (already registered for MSPDI, reused as-is
  — no new permission needed). All three share one DB read,
  `reportDataService.ts`'s `loadTaskReport`, and a pure row assembler
  (`assembleTaskReportRows`, unit-tested without a DB) so the
  CSV/Excel/PDF renderers can't disagree on what a row is. Rows are
  ordered by `wbsPath`/`sortOrder` (matching the Gantt/grid's own
  ordering) and include summaries. `cost` follows `baselineService`'s
  existing null-vs-zero convention — `null` for a task with no
  assignments at all, a real `0` only when assignments sum to exactly
  zero — via the same `numericFromDb` helper the codebase already
  centralizes the Drizzle `numeric()`-as-string conversion through.
  `excelExportService.ts` uses `exceljs`, `pdfExportService.ts` uses
  `pdfkit` (both new dependencies); `slugExportFilename` gives each
  format a real `Content-Disposition` filename derived from the
  project name. PNG export is a `packages/gantt` addition instead —
  `GanttView.exportToPngDataUrl()` composites the background/arrows/
  bars canvas layers into one offscreen canvas and returns a data URL,
  deliberately skipping the interaction overlay so a stale hover/drag
  ghost never ends up baked into the snapshot; wired into
  `apps/web`'s `GanttPanel` as a "Save as PNG" action. Reviewed in
  full — no bugs found.
- **Built-in reports** (Phase 5, item 3 of 4) — six of §5.14's built-in
  report list, deliberately scoped: the fully custom/dynamic report
  builder (arbitrary columns/filters/grouping/chart-type, saved
  definitions) is explicitly **out of scope**, its own future round;
  sprint report and velocity history are deferred to Phase 6 (no
  sprint/story-point data model exists yet). `GET
  /api/projects/:id/reports/{summary,critical-tasks,milestones,
  overallocated-resources,cost-overview,slipping-tasks}` under
  `report.view` — a permission key `packages/rbac` had already
  registered but nothing referenced until now, deliberately kept
  distinct from `data.export` (raw file downloads). New
  `builtinReportsService.ts` composes existing services rather than
  re-deriving their math — `earnedValueService.computeEarnedValue`,
  `baselineService.getBaselineDetail`, `assignmentService
  .getOverallocations` — and `reportDataService.ts`'s shared row model
  gained `isMilestone`/`deadline` (purely additive; the already-shipped
  CSV/Excel/PDF renderers are unchanged, verified by their existing
  test passing unmodified). "Slipping task" needed a real definition
  since nothing like it existed: deadline missed
  (`earlyFinish > deadline`, strict) and/or, when a `baselineId` is
  supplied, `finishVarianceMinutes > 0` from the baseline detail —
  merged and reason-tagged rather than two silently-different
  definitions; a cross-project `baselineId` 404s via the same ownership
  check `earnedValueService`'s private `resolveBaseline` already
  applies, replicated rather than exported. `apps/web/src/features
  /reports/`'s `ReportsPage` also closes a real, previously invisible
  gap: the CSV/Excel/PDF export routes shipped in the prior round had
  no UI entry point at all — added via a new `apiRequestBlob`/
  `downloadBlob` pair in `apiClient.ts` (a plain `<a href>` can't carry
  the in-memory bearer token this app uses instead of a cookie
  session). The EV report reuses the existing `EarnedValuePanel`/
  `SCurveChart` via a link rather than duplicating chart code — this
  repo has no charting dependency by deliberate convention and none of
  these six reports needed one either. Independently reviewed in full,
  including hand-tracing the `finishVarianceMinutes` sign convention
  end to end (a flipped sign there would have silently inverted what
  counts as "behind baseline") — no bugs found.
- **Project + portfolio dashboards** (Phase 5, item 4 of 4) —
  `dashboardService.ts` composes the already-tested built-in reports
  (`getProjectSummary`, `getOverallocatedResourcesReport`,
  `getMilestoneReport`, `getSlippingTasksReport`) rather than
  re-deriving EV/health math. Pure `computeProjectHealth` thresholds
  SPI/CPI (`no_baseline` / `unknown` / `behind` / `at_risk` /
  `on_track`, worse metric governs). `GET /api/projects/:id/dashboard`
  under `report.view`; `GET /api/dashboard/portfolio` auth-only
  (membership via `listProjectsForUser`, same pattern as
  `GET /api/projects`). Web: `features/dashboard/` with project
  dashboard (health badge, stat tiles, upcoming milestones, top
  slipping tasks, EV→baselines link) and portfolio table; topbar
  Portfolio link + project sub-nav Dashboard link. No new charting
  dependency; no archived filter (no such column); portfolio N+1 is
  deliberate at this scale.
- **Planner usability pass** (not a numbered roadmap item — closes
  latent gaps in already-100%-marked phases, plus a few additions
  beyond PROJECT_SCOPE.md's original bullet list; doesn't move the
  Phase 0–6 progress table). `apps/web`'s task grid had edit-only
  support since Phase 0 — no UI ever existed to create or delete a
  task, only the API did. Adds `CreateTaskModal`/`useCreateTask`/
  `useDeleteTask`, an inline predecessor cell (`predecessors.ts`
  resolves typed WBS codes like `1.2, 1.4` to dependency ids, still
  plain-FS-only — same deliberate scope limit as Gantt drag-to-link),
  a `ProjectSettingsPage` for project-level date/baseline fields, a
  `criticalOverride` column + UI toggle so a user can force a task's
  critical-path flag independent of the CPM-computed value (migration
  `0002_critical_override.sql`; `scheduleRunner.ts`'s write-back
  honours `row.criticalOverride ?? computed.isCritical` — the override
  is purely cosmetic, it doesn't change float/date math), a resource
  day-allocation calendar (`ResourceCalendarPage`, `resourceCalendar.ts`,
  `updateTimephasedDay` — editable per-day planned work, distinct from
  the still-open `resources.calendar_id` CPM-availability gap noted
  under Phase 3 below, which this does **not** close), and Gantt pan +
  a real time-scale header (`packages/gantt`'s `layers/timeHeader.ts`).
  This round landed and was pushed **without the usual review-before-
  commit pass** — reviewed after the fact instead of before. Found and
  fixed: a failing test (`useCreateTask.test.ts` missing the new
  `isMilestone` field), two lint errors already on `main`
  (`prefer-const` in `ganttView.ts`; a `react-hooks/exhaustive-deps`
  eslint-disable referencing a rule this repo's config doesn't
  register — no `eslint-plugin-react-hooks` dependency exists anywhere
  in the monorepo), and one real functional bug: unchecking the
  Milestone toggle sent `isMilestone: false` with no `durationMinutes`,
  leaving the task stuck at 0 minutes — checking it *on* correctly
  paired `durationMinutes: 0`, unchecking had no matching fallback.
  Fixed to restore a working day (480 min) on uncheck, with a
  regression test for the previously-uncovered direction. The new WBS
  insert-at-position logic (`taskService.ts`'s `shiftSiblingsForInsert`,
  raw ltree SQL for renumbering a subtree in place) has no test
  coverage — hand-verified correct against a worked 3-sibling
  insert-in-the-middle trace, but flagged as a real gap, not silently
  accepted.
- **Gantt status-date progress line** (closes the small gap flagged
  under Phase 4) — a dashed violet vertical marker at
  `project.statusDate`, drawn above task bars so it stays visible
  crossing one. New `packages/gantt/src/layers/statusDateLine.ts`
  (`drawStatusDateLine`), wired into `GanttView` as a genuine fifth
  canvas layer (`statusLine`, z-order between `bars` and
  `interaction` — `interaction` shifted from z=4 to z=5 to make room)
  rather than folded into an existing layer, so it redraws on its own
  dirty flag instead of piggybacking on bars' data-driven repaints.
  `parseStatusDateUtcMs` deliberately diverges from the existing
  `parseOriginUtcMs`: an unset/unparseable status date resolves to
  `null` (draw nothing), not epoch `0` like origin does — a missing
  status date must mean no line, not a line at 1970.
  `setOriginDateIso` now also marks the new layer dirty, since the
  line's x position is origin-relative even though the status date
  itself didn't change. Included in `exportToPngDataUrl()`'s
  composite (drawn last, on top of bars) since a stakeholder exporting
  a snapshot would want the marker in it — unlike the interaction
  layer's hover/drag ghosts, deliberately excluded from every export.
  Scoped deliberately narrow, matching the gap's original framing: no
  text label, no MS-Project-style per-task ahead/behind zigzag (would
  need `percentComplete` piped into `GanttTask`, which doesn't exist
  today — real, separate scope, not added here). `apps/web`'s
  `GanttPanel` syncs it via `setStatusDateIso` in a `useEffect` keyed
  on `project.statusDate`, mirroring the existing `setOriginDateIso`
  sync exactly. All 48 `packages/gantt` tests pass, including new
  pure draw-math cases (hand-verified against `minutesToX`, not just
  "was called") and a PNG-export compositing case. Reviewed in full —
  no bugs found in the implementation; the doc update itself had a
  gap, since fixed (see below).
- **Phase 6, round 1 — Agile backend foundation** (schema, planning-
  mode switch, sprints, backlog, story points; no UI). New `sprints`
  table (`project_id`, `name`, `goal`, `start`/`end` date, `capacity`,
  `state` — plain text, Zod-validated only, matching the
  `constraint_type`/`task_type` convention of no DB enum/CHECK) plus a
  real FK on `tasks.sprint_id` (`on delete set null`); `board_column_id`
  deliberately left as the bare, unreferenced `uuid` it already was —
  Round 2 adds `board_columns` and its FK together. `schedulingMode`
  (`'cpm' | 'agile'`) was already wired end-to-end from an earlier
  round with zero side effects on switching — this round adds them to
  the existing `updateTask` path rather than a new endpoint. Switching
  to agile mode rejects (via `BadRequestError`, mirroring
  `resourceService.ts`'s `deleteResource` guard) if the task has any
  dependency rows: `scheduleRunner.ts`'s `toTaskInputs` already filtered
  agile-mode tasks out of `SchedulerInput.tasks`, but `toDependencyInputs`
  never filtered dependencies referencing them — an agile task with live
  dependencies would hand the scheduler a dependency pointing outside
  its own input set. This closes a real, already-latent gap in
  already-shipped code, not a hypothetical. Switching also clears the
  seven CPM-output columns plus duration/constraint/deadline/
  criticalOverride explicitly at switch time — necessary because
  `toTaskInputs` filtering means an agile task is never visited by the
  reschedule write-back loop again, so stale CPM dates would otherwise
  persist forever if not cleared here. Cross-mode field rejection uses
  the *effective* post-patch mode so a same-patch `{schedulingMode:
  'agile', storyPoints: 5}` is validated correctly, not just the
  pre-patch mode. Backlog ranking uses the `fractional-indexing` npm
  package (added as a new dependency) rather than a hand-rolled
  midpoint-string algorithm — a deliberate choice, since rank-between
  algorithms have real rebalancing edge cases not worth reinventing,
  unlike this codebase's other small hand-rolled helpers. `sprint.view`
  was added to RBAC (create/edit existed, view didn't) and granted to
  exactly the same system role that already had create/edit. Two real
  issues found on review, both fixed: a `prefer-const` lint error in
  the new backlog-rank test, and a cross-package typecheck break — three
  `apps/web` test fixtures constructed a literal `ProjectSettings`
  object that became invalid once `storyPointScale` was added as a
  required field on that shared type, since Round 1 was scoped
  backend-only and didn't run `apps/web`'s typecheck. 153 api tests,
  79 schema tests, 104 web tests, and all 21 turbo lint/typecheck/build
  tasks pass. **Not built this round** (see the Phase 6 section below
  for the full remaining breakdown): `board_columns`, sprint ceremonies,
  epic hierarchy, Gantt sprint bars, charts.
- **Phase 6, round 2 — Board + backlog UI**. Closes the `board_columns`
  piece Round 1 deliberately deferred: table + real FK on
  `tasks.board_column_id`, `board.view`/`board.manage` RBAC (mirrored
  1:1 from wherever `task.view` was already granted), and
  `board.move_card` — pre-registered since before Round 1 but never
  wired to a route until now — gated a new dedicated
  `POST /api/tasks/:id/board-column` rather than the general task patch,
  the same "dedicated endpoint for a narrow action" shape Round 1 set
  with backlog-rank. `moveTaskBoardColumn`'s WIP-limit check skips
  entirely on a same-column no-op move rather than excluding the task's
  own row from the count — a cleaner solution to the self-counting edge
  case than what was originally specified. Also fixed a genuine Round 1
  gap while it was fresh: `createTask` never assigned a `backlogRank`
  when a task was created directly in agile mode (only the switch-to-
  agile path in `updateTask` did) — closed here since Round 2 is the
  round that actually builds the backlog UI this would have silently
  broken. **Conceptual model**: board (workflow column,
  `boardColumnId`) and backlog (sprint assignment, `sprintId` +
  `backlogRank`) are two independent dimensions of an agile task, not a
  placed/unplaced split of one — the Board page shows only the
  currently-selected sprint's tasks grouped by column; the Backlog page
  shows every agile task grouped by sprint (plus an unassigned
  "Backlog" bucket), ordered by rank. Both use native HTML5
  drag-and-drop, mirroring `TaskGrid.tsx`'s only existing DOM DnD
  precedent (column-header reordering) rather than adding a DnD
  library. "Swimlanes by assignee" is deliberately built as "group by
  resource" (first `AssignmentRow.resourceId`) and labelled as such —
  there is no genuine single-assignee field in this schema, only
  multi-resource assignments with hours/cost, so the UI doesn't
  overclaim a concept that doesn't exist. "Swimlanes by epic" is not
  built — epic hierarchy is Round 3. Independently reviewed in full;
  found and fixed three issues: a `prefer-const`-class lint error
  (unused mock parameter missing its `void` marker, same class of gap
  as prior rounds' lint misses); a monospace-styled prose phrase
  ("CPM dates / float / critical") sitting inside the mode-switch
  confirm modal's field-name list, inconsistent with the five real
  field names around it, split into a separate plain-text note; and a
  real functional gap in `BacklogPage.tsx`'s cross-section drag-drop —
  dragging a task into a different sprint's section patched `sprintId`
  but never recomputed `backlogRank` for the destination section, so
  the task kept whatever rank it had in its old section and could sort
  to an arbitrary position rather than landing where the user actually
  dropped it (there was even a test explicitly asserting the rank call
  did *not* happen — a deliberate simplification, not an oversight, but
  one that produced a real UX mismatch). Fixed to recompute the rank
  against the destination section immediately after the sprint patch,
  with the existing test updated to assert the corrected two-mutation
  sequence. One flagged, not-fixed gap: `createTask`'s new agile-mode
  `backlogRank` assignment has no test coverage (the function itself
  has no unit tests at all in this codebase, agile or otherwise) — the
  fix was hand-verified correct by inspection, not left unverified.
  164 api tests, 109 web tests, and all 21 turbo lint/typecheck/build
  tasks pass.

- **Phase 6, round 3 — Epic hierarchy, sprint ceremonies, Gantt sprint
  bars**. Revises Round 1's hard block on summary→agile: agile
  summaries (epics) are allowed as pure containers, with
  `rejectSummaryAgileFields` rejecting `storyPoints` / `sprintId` /
  `boardColumnId` on summaries at create and update (same shape as
  `rejectSummaryDurationOrConstraint`). `board_columns.is_done` +
  Manage Columns checkbox; `POST /api/sprints/:id/close` carries
  incomplete tasks (cleared column + fresh backlog rank) while done
  tasks stay on the closed sprint; PATCH `state` narrowed to
  planned/active only. Gantt: amber `isAgile` bars spanning sprint
  dates (unsprinted agile omitted), drag refused like summaries.
  Board Group by None/Resource/Epic; Backlog epic badge + Start/Close
  sprint ceremonies (no dedicated planning page).

- **Phase 6, round 4 — Velocity, burndown, burnup charts** (final). Closes
  Phase 6 and the roadmap checklist. Rejects assigning tasks into closed
  sprints (Backlog closed sections are read-only); `GET …/velocity` and
  `GET …/points-summary` feed hand-rolled SVG charts (ideal line + current
  point, SCurveChart precedent). CFD is explicitly out of scope — audit log
  is write-only and closeSprint's aggregate carry-over would make any
  reconstructed CFD silently wrong; the UI documents why, not a fake chart.

## Next up

TECHNICAL_DESIGN.md §13's Phase 0/1/2 build order is **entirely done**
(see Done section above for the full walkthrough — not repeated here to
avoid two copies drifting out of sync). **Phase 0's exit demo**
(`docker compose up`, log in, create a custom role, watch a 403) is
fully reachable end-to-end today.

**Phases 3–6 are entirely done** — Phase 6 Round 4 closed the agile charts
slice (velocity / burndown / burnup). CFD remains a documented future
feature, not an open checklist item in this plan.

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

Phase 2 is fully done and closed out — no unclaimed work remains from
it. Phase 3 (below) is now in progress.

## Phase 3 — Resources (PROJECT_SCOPE.md §8) — done

All six items complete (see Done section above for the full
walkthrough): resource pool CRUD, assignments CRUD, cost model
(`computeWorkAndCost` — standard rate + cost-per-use; overtime rate
unused, no threshold defined yet), overallocation detection
(UTC-calendar-day granularity — a working-minute-precise version isn't
needed now that item 5 has landed, since the day-bucket approach was
always the deliberately-simpler stand-in), timephased work distribution
(`assignment_timephased`, recomputed on assignment mutation only — see
the Done section's explicit note on what's *not* covered: a task
reschedule alone doesn't refresh it), and the resource sheet /
task-assignment UI in `apps/web` making all of the above visible.

**Exit criterion met**: "Assignments compute cost and work correctly;
overallocations surface" — verifiable end-to-end today via
`/projects/$projectId/resources` and the per-task "Resources" panel.

## Phase 4 — Tracking (PROJECT_SCOPE.md §8) — done

1. **Baselines** (capture/list/detail-with-variance/clear) — **done**.
2. **Actuals capture** (`percentComplete`, `actualStart`/`actualFinish`,
   `actualDurationMinutes`, `remainingDurationMinutes`) — **done**.
   Pure recording fields this round — editing an actual does not feed
   back into the CPM engine's forward/backward pass (no "resume
   incomplete work" recalculation); that's a separate, more advanced
   feature, not built here.
3. **Status date** (`projects.status_date`) — **done**.
4. **Variance columns** (baseline vs. current start/finish/duration/cost)
   — **done**, via `getBaselineDetail`.
5. **Earned value metrics** (PV/EV/AC/SPI/CPI) — **done**.
6. **S-curve** — **done** as a standalone chart in `EarnedValuePanel`.
7. **Gantt status-date progress line** — **done** (see Done section
   above).

**Exit criterion met**: "A baselined plan reports accurate SPI/CPI
against recorded actuals" — verifiable end-to-end via
`/projects/$projectId/baselines`.

## Phase 5 — Interop & reporting (PROJECT_SCOPE.md §8) — done

1. **MS Project XML (MSPDI) round-trip** — **done** (export + import,
   see Done section above).
2. **CSV/Excel/PDF/PNG export** — **done** (see Done section above).
3. **Report builder** — **done, scoped** (see Done section above): the
   six built-in reports from §5.14 are done; the fully custom/dynamic
   report builder (arbitrary columns/filters/grouping/chart-type,
   saved definitions) and the Agile-dependent reports (sprint report,
   velocity history) are deliberately deferred, not silently dropped.
4. **Project and portfolio dashboards** — **done** (see Done section
   above).

**Exit criterion** ("round-trip with MS Project preserves the plan")
is **partially verifiable** — the export→import round-trip is proven
against our own generated files (no MS Project install in this
environment, same standing caveat as every golden case), but not yet
against a real MS Project export.

## Phase 6 — Agile module (PROJECT_SCOPE.md §8) — **done**

Split into four rounds — all complete.

1. **Round 1 (backend foundation)** — **done** (see Done section above).
2. **Round 2 (board + backlog UI)** — **done** (see Done section above).
3. **Round 3 (epics, ceremonies, Gantt sprint bars)** — **done** (see Done
   section above).
4. **Round 4 (velocity / burndown / burnup)** — **done** (see Done section
   above). CFD deferred with an explicit UI explanation.

`packages/ui` (shadcn/ui-based shared components) has no dedicated line item
above — it accretes as `apps/web` needs components.

## Working conventions carried forward

- Tests before implementation for anything in `packages/scheduler` (explicit
  instruction, repeated in the build order at every engine step).
- Verify enforcement mechanisms actually enforce (ESLint rules, guards,
  drift tests) by deliberately triggering them, not just reading the config.
- Only commit when asked; summarize and wait after each unit of work.
