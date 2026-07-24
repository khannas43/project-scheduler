# Technical Design Document

**Project:** Project Management & Scheduling Tool
**Companion to:** `PROJECT_SCOPE.md` v0.3
**Status:** v1.0 — approved for implementation
**Author:** Sameer Khanna
**Last updated:** 2026-07-24

> **Purpose of this document.** `PROJECT_SCOPE.md` defines *what* is built. This defines *how*. It is the authoritative reference for schema, algorithms, API contracts, and conventions. When Cursor is asked to generate code, point it at the relevant section here first — the context window forgets, this file does not.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Structure](#2-repository-structure)
3. [Database Schema](#3-database-schema)
4. [Scheduling Engine Design](#4-scheduling-engine-design)
5. [API Design](#5-api-design)
6. [RBAC Implementation](#6-rbac-implementation)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Gantt Renderer Design](#8-gantt-renderer-design)
9. [Concurrency & Locking](#9-concurrency--locking)
10. [Docker & Deployment](#10-docker--deployment)
11. [Testing Strategy](#11-testing-strategy)
12. [Coding Conventions](#12-coding-conventions)
13. [Build Order](#13-build-order)

---

## 1. Architecture Overview

### 1.1 Shape

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│  ┌───────────┐  ┌────────────┐  ┌────────────┐  │
│  │ React UI  │  │ @pkg/gantt │  │ @pkg/      │  │
│  │           │  │ (canvas)   │  │ scheduler  │  │
│  └───────────┘  └────────────┘  └────────────┘  │
│         │              │               │        │
│         └──────────────┴───────────────┘        │
│                    │ TanStack Query             │
└────────────────────┼────────────────────────────┘
                     │ HTTP / JSON
┌────────────────────┼────────────────────────────┐
│  Fastify API       │                            │
│  ┌─────────────────▼──────────────┐             │
│  │ Route → authGuard → permGuard  │             │
│  │      → handler → service       │             │
│  └─────────────────┬──────────────┘             │
│  ┌─────────────────▼──────────────┐             │
│  │ @pkg/scheduler (authoritative) │             │
│  └─────────────────┬──────────────┘             │
│  ┌─────────────────▼──────────────┐             │
│  │ Drizzle ORM                    │             │
│  └─────────────────┬──────────────┘             │
└────────────────────┼────────────────────────────┘
                     │
              ┌──────▼──────┐    ┌─────────┐
              │ PostgreSQL  │    │  Redis  │
              │     17      │    │ (BullMQ)│
              └─────────────┘    └─────────┘
```

### 1.2 The isomorphic engine

`@pkg/scheduler` is the single most important design decision. It is a pure TypeScript package that runs **unchanged** in both browser and Node.

- **Browser:** on every edit, recalculate locally and repaint immediately. No network round-trip, no spinner. The user drags a bar and dependent bars move in the same frame.
- **Server:** on persist, recalculate authoritatively and store the result. The client's optimistic calculation is never trusted.

Because it is the same code, the two results always agree. If they diverge, that is a bug in input assembly, not in scheduling.

**Non-negotiable constraints on this package:**
- No imports outside itself (no `date-fns`, no `lodash`, no Node builtins)
- No `Date.now()`, no `new Date()` without an explicit argument, no `Math.random()`
- No I/O, no logging, no mutation of inputs
- Every exported function is `(input) => output`, referentially transparent

Violating any of these breaks testability and the browser/server equivalence. Enforce with an ESLint boundary rule.

### 1.3 Data flow for a task edit

```
User drags task bar
  → Zustand: optimistic local mutation
  → @pkg/scheduler.recalculate(dirtySubgraph)
  → Canvas repaint                        [~5ms, no network]
  → TanStack Query mutation → PATCH /api/tasks/:id
      → permGuard('task.edit')
      → version check (409 if stale)
      → DB write in transaction
      → @pkg/scheduler.recalculate(full project)
      → persist computed fields
      → return updated task set + new version
  → Client reconciles; rollback on 409
```

---

## 2. Repository Structure

pnpm workspaces + Turborepo monorepo.

```
project-scheduler/
├── apps/
│   ├── web/                    React + Vite frontend
│   │   ├── src/
│   │   │   ├── features/       Feature-sliced (tasks/, gantt/, rbac/, resources/)
│   │   │   ├── components/     Shared app components
│   │   │   ├── lib/            api client, query client, auth
│   │   │   ├── stores/         Zustand stores
│   │   │   └── routes/         TanStack Router
│   │   └── vite.config.ts
│   └── api/                    Fastify backend
│       ├── src/
│       │   ├── routes/         HTTP layer only — no business logic
│       │   ├── services/       Business logic
│       │   ├── db/             Drizzle schema, migrations, seeds
│       │   ├── middleware/     auth, permissions, errors
│       │   └── jobs/           BullMQ workers
│       └── drizzle.config.ts
├── packages/
│   ├── scheduler/              CPM engine — PURE, zero deps
│   ├── schema/                 Zod schemas + shared TS types
│   ├── gantt/                  Canvas rendering library
│   ├── rbac/                   Permission registry + guard helpers
│   └── ui/                     shadcn/ui-based shared components
├── infra/
│   ├── compose.yaml
│   ├── compose.override.yaml   dev hot-reload
│   └── docker/
│       ├── api.Dockerfile
│       └── web.Dockerfile
├── docs/
│   ├── PROJECT_SCOPE.md
│   ├── TECHNICAL_DESIGN.md     ← this file
│   └── adr/                    Architecture Decision Records
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 2.1 Dependency rules

```
web  → schema, gantt, scheduler, rbac, ui
api  → schema, scheduler, rbac
scheduler → (nothing)
schema    → zod only
rbac      → schema
gantt     → schema
```

`scheduler` importing anything is a build failure. Enforce in `eslint.config.js` with `import/no-restricted-paths`.

---

## 3. Database Schema

PostgreSQL 17. All tables carry `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`.

### 3.1 Identity & authorisation

```sql
users
  id, email (unique, citext), password_hash (argon2id),
  full_name, is_active, last_login_at

permissions
  id, key (unique, e.g. 'task.edit'), category, description
  -- seeded from @pkg/rbac registry; never user-created

roles
  id, name, description, is_system (bool)
  -- is_system rows are immutable, used as clone templates
  unique(name)

role_permissions
  role_id fk, permission_id fk
  primary key (role_id, permission_id)

project_members
  user_id fk, project_id fk, role_id fk
  primary key (user_id, project_id)
  -- per-project role assignment
```

### 3.2 Projects & calendars

```sql
projects
  id, name, description, status, start_date, finish_date (computed),
  calendar_id fk, owner_id fk, is_archived, version int

calendars
  id, name, project_id fk nullable,   -- null = global template
  working_days smallint[],            -- [1,2,3,4,5] = Mon–Fri
  hours_per_day numeric, default_start time, default_finish time

calendar_exceptions
  id, calendar_id fk, exception_date date, is_working bool,
  start_time time, finish_time time, name,
  recurrence jsonb  -- {type:'annual'} for fixed holidays
  index (calendar_id, exception_date)
```

### 3.3 Tasks

The central table. Computed columns are written by the engine, never by the client.

```sql
tasks
  id, project_id fk, parent_id fk nullable,

  -- hierarchy
  wbs_path ltree,              -- '1.3.2' — GIST indexed
  wbs_code text,               -- display form
  sort_order int,              -- ordering among siblings

  -- identity
  name, notes, is_milestone bool, is_summary bool,

  -- planning mode (Phase 6; column exists from Phase 0)
  scheduling_mode text default 'cpm',   -- 'cpm' | 'agile'

  -- CPM inputs
  duration_minutes int,
  task_type text,              -- 'fixed_duration'|'fixed_units'|'fixed_work'
  is_effort_driven bool,
  is_manually_scheduled bool,
  constraint_type text,        -- 'asap'|'alap'|'snet'|'snlt'|'fnet'|'fnlt'|'mso'|'mfo'
  constraint_date timestamptz,
  deadline timestamptz,
  calendar_id fk nullable,

  -- CPM outputs (ENGINE-WRITTEN — never accept from client)
  early_start timestamptz, early_finish timestamptz,
  late_start  timestamptz, late_finish  timestamptz,
  total_float_minutes int, free_float_minutes int,
  is_critical bool,

  -- tracking
  percent_complete numeric(5,2),
  actual_start timestamptz, actual_finish timestamptz,
  actual_duration_minutes int, remaining_duration_minutes int,

  -- agile (Phase 6)
  story_points numeric, sprint_id fk nullable, board_column_id fk nullable,
  backlog_rank text,           -- lexorank for O(1) reordering

  version int not null default 0,   -- optimistic lock

  index (project_id, parent_id),
  index using gist (wbs_path),
  index (project_id) where is_critical = true
```

**Rule:** the eight CPM output columns are computed. The API strips them from any inbound payload. This is enforced in the Zod input schema by omission, not by validation.

### 3.4 Dependencies

```sql
task_dependencies
  id, predecessor_id fk, successor_id fk,
  link_type text,              -- 'FS'|'SS'|'FF'|'SF'
  lag_minutes int default 0,
  lag_percent numeric nullable,
  unique(predecessor_id, successor_id)
  check(predecessor_id <> successor_id)
  index (successor_id)         -- forward pass traversal
  index (predecessor_id)       -- backward pass traversal
```

Cycle prevention is application-level (see §4.3) — a database constraint cannot express it.

### 3.5 Resources

```sql
resources
  id, name, resource_type,     -- 'work'|'material'|'cost'
  email, max_units numeric,    -- 1.0 = 100%
  standard_rate numeric, overtime_rate numeric, cost_per_use numeric,
  accrual_type text,           -- 'start'|'prorated'|'end'
  calendar_id fk nullable, skills text[]
  -- instance-wide pool, shared across projects

assignments
  id, task_id fk, resource_id fk,
  units numeric,               -- 0.5 = 50%
  work_minutes int, actual_work_minutes int,
  cost numeric, actual_cost numeric,
  unique(task_id, resource_id)

assignment_timephased
  id, assignment_id fk, period_date date,
  planned_work_minutes int, actual_work_minutes int
  -- PARTITION BY RANGE (period_date), monthly
  index (assignment_id, period_date)
```

### 3.6 Baselines & audit

```sql
baselines
  id, project_id fk, baseline_number smallint,  -- 0..10
  name, captured_at, captured_by fk
  unique(project_id, baseline_number)

baseline_tasks
  id, baseline_id fk, task_id fk,
  start, finish, duration_minutes, work_minutes, cost

audit_log
  id, user_id fk, project_id fk nullable,
  action, entity_type, entity_id,
  before jsonb, after jsonb, created_at
  index (project_id, created_at desc)
```

### 3.7 Why ltree

WBS queries are subtree queries. With `ltree` and a GIST index:

```sql
-- entire subtree, one indexed operation
SELECT * FROM tasks WHERE wbs_path <@ '1.3'::ltree;

-- direct children only
SELECT * FROM tasks WHERE wbs_path ~ '1.3.*{1}'::lquery;

-- all ancestors of a task
SELECT * FROM tasks WHERE '1.3.2'::ltree <@ wbs_path;
```

A recursive CTE would work but is materially slower at depth. Cost: `wbs_path` must be rewritten on move/indent — done in a transaction with a single `UPDATE ... WHERE wbs_path <@ old_path`.

---

## 4. Scheduling Engine Design

`packages/scheduler`. The heart of the system. Build it first, test it hardest.

### 4.1 Public interface

```typescript
export interface SchedulerInput {
  readonly projectStart: EpochMinutes;
  readonly tasks: readonly TaskInput[];
  readonly dependencies: readonly DependencyInput[];
  readonly calendars: ReadonlyMap<CalendarId, CompiledCalendar>;
  readonly defaultCalendarId: CalendarId;
}

export interface SchedulerOutput {
  readonly tasks: ReadonlyMap<TaskId, ComputedSchedule>;
  readonly projectFinish: EpochMinutes;
  readonly criticalPath: readonly TaskId[];
  readonly warnings: readonly SchedulingWarning[];
}

export function schedule(input: SchedulerInput): SchedulerOutput;

export function scheduleIncremental(
  input: SchedulerInput,
  previous: SchedulerOutput,
  dirtyTaskIds: readonly TaskId[],
): SchedulerOutput;
```

**Time representation:** all times are `EpochMinutes` — a branded `number` of minutes since Unix epoch, UTC. No `Date` objects inside the engine. Conversion happens at the boundary only. This eliminates timezone bugs and DST arithmetic errors, and makes the whole engine integer math.

```typescript
export type EpochMinutes = number & { readonly __brand: 'EpochMinutes' };
```

### 4.2 Calendar compilation

Naive calendar arithmetic ("add 3 working days") walks day by day and is the dominant cost in any CPM engine. Precompute instead.

At the input boundary, compile each calendar into a **working-minute prefix-sum index** over the project's date horizon:

```typescript
interface CompiledCalendar {
  readonly horizonStart: EpochMinutes;
  readonly slots: Int32Array;          // working minutes cumulative, per day
  readonly dayStarts: Int32Array;      // offset of each day's first working minute
}
```

This converts "add N working minutes to time T" from an O(days) walk into two binary searches — O(log n). For a 5,000-task project this is the difference between ~2s and ~30ms.

Compile once per `schedule()` call, cache by calendar version.

### 4.3 Graph validation

Before any pass, validate:

1. **Cycle detection** — iterative DFS with a three-colour marking (white/grey/black). On detecting a back edge, walk the stack to produce the full cycle path for the error message. Never recursive — deep chains blow the stack.
2. **Orphan check** — every dependency references extant tasks.
3. **Summary link check** — reject a dependency between a summary and its own descendant.

Failure throws `SchedulingError` with the offending task IDs. Reject the mutation; do not attempt partial scheduling.

### 4.4 Forward pass

Topological order (Kahn's algorithm, using the in-degree map built during validation).

For each task, early start is the maximum over all predecessor constraints:

| Link type | Successor earliest start derived from |
|---|---|
| FS | predecessor `early_finish` + lag |
| SS | predecessor `early_start` + lag |
| FF | predecessor `early_finish` + lag − successor duration |
| SF | predecessor `early_start` + lag − successor duration |

Then apply the task constraint:

```
asap  → early_start unchanged
snet  → early_start = max(early_start, constraint_date)
mso   → early_start = constraint_date            (hard override)
mfo   → early_finish = constraint_date; early_start derived backward
snlt  → if early_start > constraint_date, emit warning (do not move)
fnlt  → if early_finish > constraint_date, emit warning
```

`early_finish = addWorkingMinutes(early_start, duration_minutes, calendar)`.

**Constraint precedence** (documented divergence point from MS Project — record any deviation in an ADR):
1. Hard constraints (`mso`, `mfo`) win over dependencies; emit a `CONSTRAINT_OVERRIDES_DEPENDENCY` warning.
2. Semi-hard (`snet`, `fnet`) push later, never earlier.
3. Soft (`snlt`, `fnlt`) never move a task — warn only.
4. Deadlines never move a task — warn only.

### 4.5 Backward pass

Reverse topological order. Tasks with no successors get `late_finish = projectFinish`.

| Link type | Predecessor latest finish derived from |
|---|---|
| FS | successor `late_start` − lag |
| SS | successor `late_start` − lag + predecessor duration |
| FF | successor `late_finish` − lag |
| SF | successor `late_finish` − lag + predecessor duration |

Take the minimum across all successors.

### 4.6 Float and critical path

```
total_float = late_start − early_start
free_float  = min(successor.early_start) − this.early_finish
is_critical = total_float <= criticalThresholdMinutes   // default 0
```

Critical path = all tasks where `is_critical`, ordered by `early_start`.

Negative total float indicates an over-constrained schedule — surface prominently in the UI; it is the most common real-world planning error.

### 4.7 Summary rollup

After both passes, walk the WBS tree bottom-up:

```
summary.early_start  = min(children.early_start)
summary.early_finish = max(children.early_finish)
summary.duration     = workingMinutesBetween(start, finish, calendar)
summary.percent_complete = Σ(child.pct × child.duration) / Σ(child.duration)
summary.cost         = Σ(children.cost)
summary.is_critical  = any(children.is_critical)
```

Summary tasks are never directly scheduled. Reject any attempt to set duration or constraints on one.

### 4.8 Incremental recalculation

Full recalculation of 5,000 tasks is roughly 30–50 ms with compiled calendars — fast enough that incremental mode is an optimisation, not a necessity. Implement `schedule()` first; add `scheduleIncremental()` only when profiling justifies it.

When implemented: compute the transitive closure of successors from the dirty set, recalculate only that subgraph, and detect whether `projectFinish` changed — if it did, the backward pass must run over the whole graph regardless.

### 4.9 Agile-mode exclusion (Phase 6)

Tasks with `scheduling_mode = 'agile'` are filtered out of `SchedulerInput.tasks` before scheduling. Their dates derive from their sprint:

```
task.start  = sprint.start_date
task.finish = sprint.end_date
```

They appear on the Gantt but never participate in CPM, carry no float, and can never be critical.

---

## 5. API Design

REST over JSON. Fastify with `@fastify/type-provider-zod` so route schemas and TypeScript types share one definition.

### 5.1 Conventions

- Base path `/api`
- Auth: `Authorization: Bearer <jwt>`; refresh token in httpOnly cookie
- Every mutating route declares a permission (see §6)
- Errors: RFC 7807 problem+json
- Pagination: cursor-based, `?cursor=&limit=`
- Optimistic locking: `If-Match: <version>` header or `version` in body

### 5.2 Core routes

```
POST   /api/auth/login                    → { accessToken, user }
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/projects                      project.view
POST   /api/projects                      project.create
GET    /api/projects/:id                  project.view
PATCH  /api/projects/:id                  project.edit
DELETE /api/projects/:id                  project.delete

GET    /api/projects/:id/tasks            task.view      (full tree, single call)
POST   /api/projects/:id/tasks            task.create
PATCH  /api/tasks/:id                     task.edit
DELETE /api/tasks/:id                     task.delete
POST   /api/tasks/:id/move                task.reorder   { parentId, sortOrder }
POST   /api/projects/:id/tasks/bulk       task.edit      (grid paste)

POST   /api/dependencies                  dependency.create
DELETE /api/dependencies/:id              dependency.delete

POST   /api/projects/:id/reschedule       schedule.recalculate

GET    /api/resources                     resource.view
POST   /api/assignments                   resource.assign

POST   /api/projects/:id/baselines        baseline.save
GET    /api/projects/:id/baselines        baseline.view

GET    /api/roles                         role.manage
POST   /api/roles                         role.manage
PATCH  /api/roles/:id                     role.manage
GET    /api/permissions                   role.manage

POST   /api/projects/:id/import/xml       data.import
GET    /api/projects/:id/export/xml       data.export
```

### 5.3 Task tree fetch

`GET /api/projects/:id/tasks` returns the **entire** task tree in one response — flat array plus parent pointers, not nested. Rationale: the Gantt and grid both need the whole set for virtualisation, the engine needs it for recalculation, and 20k tasks of this shape is roughly 4 MB uncompressed, ~400 KB gzipped. Pagination would force partial-graph scheduling, which is far worse.

```json
{
  "tasks": [ { "id": "...", "parentId": null, "wbsCode": "1", ... } ],
  "dependencies": [ ... ],
  "calendars": [ ... ],
  "projectVersion": 42
}
```

### 5.4 Mutation response

Any mutation touching the schedule returns all tasks whose computed fields changed:

```json
{
  "task": { ...updated task... },
  "affected": [ { "id": "...", "earlyStart": "...", "isCritical": true, ... } ],
  "projectVersion": 43
}
```

This lets the client reconcile without refetching the tree.

---

## 6. RBAC Implementation

### 6.1 Permission registry

`packages/rbac/src/permissions.ts` is the single source of truth. Adding a permission means adding it here; a migration seeds it into the database.

```typescript
export const PERMISSIONS = {
  PROJECT_VIEW:   { key: 'project.view',   category: 'Project', description: 'View project' },
  PROJECT_EDIT:   { key: 'project.edit',   category: 'Project', description: 'Edit settings' },
  TASK_EDIT:      { key: 'task.edit',      category: 'Task',    description: 'Edit tasks' },
  COST_VIEW:      { key: 'cost.view',      category: 'Cost',    description: 'View costs' },
  ROLE_MANAGE:    { key: 'role.manage',    category: 'Admin',   description: 'Manage roles' },
  // ...
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]['key'];
```

### 6.2 Route guard

```typescript
fastify.patch('/api/tasks/:id', {
  preHandler: [requireAuth, requirePermission('task.edit')],
  schema: { body: UpdateTaskSchema },
}, updateTaskHandler);
```

`requirePermission` resolves the project from the route (task → project), loads the user's role for that project, and checks the permission set. Results cached per-request.

### 6.3 Enforcement invariants

- **Server-side is authoritative.** Client-side hiding is cosmetic.
- **Fail closed.** Unknown permission key → 403.
- **System roles immutable.** `is_system = true` rejects updates at the service layer.
- **New features add permission rows.** Existing custom roles do not inherit them.
- **Audit everything.** Role and permission changes always written to `audit_log`.

### 6.4 Drift prevention (risk R5)

An integration test enumerates every registered Fastify route and asserts that each non-GET route declares a `requirePermission` preHandler. A new route without a guard fails CI. This is the single highest-value test in the suite.

---

## 7. Frontend Architecture

### 7.1 State ownership

Three stores, strictly separated — this boundary is what keeps the app comprehensible.

| Layer | Tool | Owns |
|---|---|---|
| Server state | TanStack Query | Tasks, projects, resources — anything persisted |
| Schedule state | Zustand | Locally computed CPM output, optimistic edits |
| UI state | Zustand | Selection, zoom, scroll, column layout, open panels |

Never store computed schedule output in TanStack Query cache. It is derived, not fetched.

### 7.2 Optimistic edit cycle

```typescript
function useTaskEdit(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch) => api.patchTask(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['tasks', projectId] });
      const snapshot = qc.getQueryData(['tasks', projectId]);
      const next = applyPatch(snapshot, patch);
      const scheduled = schedule(toSchedulerInput(next));   // local, ~5ms
      qc.setQueryData(['tasks', projectId], merge(next, scheduled));
      return { snapshot };
    },
    onError: (err, _patch, ctx) => {
      qc.setQueryData(['tasks', projectId], ctx.snapshot);
      if (err.status === 409) showStaleDialog();
    },
    onSuccess: (res) => applyAffected(qc, projectId, res.affected),
  });
}
```

### 7.3 Feature-sliced structure

```
src/features/
  tasks/     components/ hooks/ api.ts types.ts
  gantt/     GanttView.tsx useGanttViewport.ts
  grid/      TaskGrid.tsx columns.tsx
  resources/
  rbac/      RoleEditor.tsx PermissionMatrix.tsx usePermission.ts
```

Cross-feature imports go through a feature's `index.ts` barrel only.

---

## 8. Gantt Renderer Design

`packages/gantt`. The component with the highest technical risk (R2). **Prototype this in Phase 1 with 10,000 synthetic tasks before committing to the design.**

### 8.1 Why canvas

SVG creates one DOM node per bar plus several per dependency arrow. At 5,000 tasks that is 20,000+ nodes and the browser stops coping — scroll drops below 20 FPS. Canvas 2D draws the same content in a single element and holds 50,000+ bars at 60 FPS.

Cost: no DOM means no CSS, no accessibility tree, no hit-testing for free. All three must be built.

### 8.2 Layer composition

Four stacked `<canvas>` elements, each redrawn only when its own inputs change:

```
┌────────────────────────────────────┐
│ 4. Interaction  (drag ghost, hover)│  every pointer move
│ 3. Bars         (tasks, progress)  │  on data or viewport change
│ 2. Arrows       (dependencies)     │  on data or viewport change
│ 1. Background   (grid, non-working)│  on viewport change only
└────────────────────────────────────┘
```

Dragging a bar repaints only layer 4 — a few hundred microseconds regardless of project size.

### 8.3 Viewport virtualisation

Render only what is visible plus a small overscan:

```typescript
const first = Math.floor(scrollTop / ROW_HEIGHT);
const last  = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT);
const visible = tasks.slice(
  Math.max(0, first - OVERSCAN),
  Math.min(tasks.length, last + OVERSCAN),
);
```

Horizontal culling likewise: skip any bar whose date range falls outside the visible time window. Draw cost becomes proportional to viewport size, not project size.

### 8.4 Hit testing

Maintain a parallel spatial index — a flat `Float32Array` of `[x, y, w, h, taskId]` rebuilt on each bars-layer repaint. Pointer events binary-search it by row, then linear-scan that row's bars. Sub-millisecond at any project size.

### 8.5 Dependency arrow routing

Orthogonal (Manhattan) routing with three cases:

- **Successor starts after predecessor ends:** simple three-segment elbow.
- **Successor starts before predecessor ends:** route around — down, back, up.
- **Adjacent rows:** shorten the vertical segment to avoid overlapping the bars.

Batch all arrows into a single `Path2D` and stroke once. Stroking per-arrow is roughly 10× slower.

### 8.6 Accessibility

The canvas is `aria-hidden="true"`. A visually-hidden, semantically correct `<table>` mirrors the same data and receives keyboard focus. Screen readers get the table; sighted users get the canvas. This satisfies WCAG 2.1 AA without compromising rendering performance.

---

## 9. Concurrency & Locking

Optimistic locking. No CRDT, no websockets in v1.

### 9.1 Mechanism

Every mutable row carries `version int`. Updates are conditional:

```sql
UPDATE tasks SET name = $1, version = version + 1
WHERE id = $2 AND version = $3
RETURNING *;
```

Zero rows affected → someone else wrote first → HTTP 409 with the current server state. The client shows a reload prompt.

### 9.2 Granularity

Version stamps are **per row**, not per project. Two users editing different tasks never conflict. Project-level stamping would serialise all editing and was rejected for that reason (risk R7).

Schedule recalculation runs inside the same transaction as the mutation, so computed fields can never be stale relative to their inputs.

### 9.3 Transaction boundaries

Every schedule-affecting mutation:

```
BEGIN
  version-checked UPDATE          → 409 on mismatch
  load full project graph
  schedule(input)                 → pure, in-process
  bulk UPDATE computed fields
  INSERT audit_log
COMMIT
```

Use `SERIALIZABLE` isolation for reschedules; retry once on serialisation failure.

---

## 10. Docker & Deployment

Five services. No JVM sidecar — `.mpp` is out of scope.

### 10.1 compose.yaml

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: scheduler
      POSTGRES_USER: scheduler
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scheduler"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  migrate:
    build: { dockerfile: infra/docker/api.Dockerfile }
    command: ["pnpm", "db:migrate"]
    depends_on:
      postgres: { condition: service_healthy }
    restart: "no"          # init container: runs once, exits 0

  api:
    build: { dockerfile: infra/docker/api.Dockerfile }
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
      migrate:  { condition: service_completed_successfully }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]

  web:
    build: { dockerfile: infra/docker/web.Dockerfile }
    ports: ["8080:80"]
    depends_on:
      api: { condition: service_healthy }

volumes:
  pgdata:
```

### 10.2 Principles

- **Multi-stage builds.** Build stage has the toolchain; runtime stage carries only `dist/` and production dependencies.
- **Non-root.** Every image runs as `node` or `nginx`, never root.
- **Migrations as an init container.** Never on API boot — two API replicas would race.
- **Secrets via Docker secrets or env file**, never baked into images.
- **`compose.override.yaml`** mounts source and runs dev servers with hot reload; it is git-ignored in production deployments.
- **Backup:** nightly `pg_dump` to a mounted host volume via host cron or a `postgres:17-alpine` sidecar with a sleep loop. 30-day retention. **Test the restore before trusting it.**

---

## 11. Testing Strategy

Effort is deliberately unbalanced. The engine gets the overwhelming majority.

| Layer | Tool | Target | Notes |
|---|---|---|---|
| Scheduler engine | Vitest | **≥800 tests, 100% branch** | The executable specification |
| RBAC guards | Vitest | Every route asserted | Includes the drift test (§6.4) |
| Services | Vitest + testcontainers | Real Postgres | No mocked database |
| API routes | Vitest + Fastify inject | Contract level | |
| Frontend | Vitest + Testing Library | Hooks and critical components | |
| E2E | Playwright | ~15 core journeys | |

### 11.1 Golden-file corpus

The highest-value asset in the repository, and the mitigation for risk R1.

```
packages/scheduler/test/golden/
  001-simple-fs-chain/          input.json  expected.json  notes.md
  002-parallel-paths/
  003-ss-with-lag/
  004-negative-lag/
  005-mso-vs-dependency/
  ...
  200-reference-plan/           ← the 200-task MS Project comparison
```

Build each case in MS Project, export the computed dates, encode as `expected.json`. `notes.md` records observed MS Project behaviour and any deliberate divergence.

These tests are the answer to "does this match MS Project?" — the only answer that means anything.

### 11.2 Property-based tests

Use `fast-check` for invariants that must hold universally:

- No task starts before its FS predecessor finishes (modulo lag)
- `total_float >= free_float`, always
- The critical path is a connected chain from a project start to a project finish
- `schedule(schedule(x)) === schedule(x)` — idempotence
- No scheduled time falls in non-working time

Property tests catch the edge cases hand-written tests miss, which in a scheduling engine is most of them.

---

## 12. Coding Conventions

### 12.1 TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- `any` is banned; use `unknown` and narrow
- Branded types for all identifiers: `TaskId`, `ProjectId`, `EpochMinutes` — prevents passing a project ID where a task ID belongs
- `readonly` on every engine interface
- No default exports outside route modules

### 12.2 Naming

| Concept | Convention | Example |
|---|---|---|
| Database columns | `snake_case` | `early_start` |
| TypeScript | `camelCase` | `earlyStart` |
| Types / components | `PascalCase` | `TaskInput` |
| Constants | `SCREAMING_SNAKE` | `ROW_HEIGHT` |
| Permissions | `resource.action` | `task.edit` |
| Duration fields | always suffix the unit | `durationMinutes` |

**All durations are minutes. All times are `EpochMinutes` UTC.** Never store or pass a bare number without a unit-suffixed name. This convention alone prevents an entire class of bug.

### 12.3 Error handling

- Domain errors extend `AppError` with a stable `code` and HTTP status
- `SchedulingError` carries the offending task IDs for UI highlighting
- Never swallow an error to keep the UI alive; surface it

### 12.4 Architecture Decision Records

Any decision that is non-obvious or diverges from MS Project gets an ADR in `docs/adr/NNN-title.md`:

```markdown
# ADR 007: Hard constraints override dependencies

## Status
Accepted

## Context
MS Project's behaviour when Must-Start-On conflicts with an FS
predecessor is undocumented and version-dependent.

## Decision
Hard constraints (MSO, MFO) win. A CONSTRAINT_OVERRIDES_DEPENDENCY
warning is emitted.

## Consequences
Divergence from some MS Project versions. Golden case 005 documents
the observed behaviour and our deliberate difference.
```

ADRs are how a solo project remembers *why*. Six weeks on, the reasoning is gone and only the record remains.

---

## 13. Build Order

Concrete sequencing for Phases 0–2. Each step ends with something demonstrable.

### Phase 0 — Foundation

1. Monorepo scaffold: pnpm workspaces, Turborepo, shared `tsconfig`, ESLint with the `scheduler` boundary rule
2. `packages/schema` — Zod schemas for core entities
3. `packages/rbac` — permission registry
4. Drizzle schema: users, permissions, roles, role_permissions, project_members, projects
5. Migrations + seed (system roles, permission rows, admin user)
6. Fastify skeleton: `requireAuth`, `requirePermission`, error handler, `/health`
7. Auth routes: login, refresh, logout
8. **Route-guard drift test** (§6.4) — write it now, before there are routes to miss
9. Vite + React shell, TanStack Router, login page, project list
10. Role management UI: permission matrix, clone, create, edit
11. `compose.yaml` + both Dockerfiles
12. CI: lint, typecheck, test, build

**Demo:** `docker compose up`, log in, create a custom role, assign it, watch a permission denial return 403.

### Phase 1 — Core planning

13. `packages/scheduler` skeleton: types, `EpochMinutes`, branded IDs
14. Calendar compilation + `addWorkingMinutes` — **with tests before use**
15. Graph validation: cycle detection with path reporting
16. Forward pass, FS links only
17. Backward pass, float, critical path
18. Golden cases 001–020
19. Tasks + dependencies tables, WBS `ltree` maintenance
20. Task CRUD service, engine invoked inside the transaction
21. Task routes with guards and version checks
22. `packages/gantt`: **10k-task synthetic benchmark first** (risk R2 — if the layered canvas design fails here, it fails cheaply)
23. Canvas layers, viewport virtualisation, bar rendering
24. Dependency arrow routing
25. TanStack Table grid view with inline editing
26. Wire optimistic edit cycle (§7.2)

**Demo:** build a 50-task plan, see the critical path highlighted, scroll a 10k-task project at 60 FPS.

### Phase 2 — Full scheduling

27. SS, FF, SF link types + golden cases
28. Lead/lag, including negative and percentage
29. All eight constraint types + precedence rules + ADR
30. Deadlines and warnings
31. Calendars: exceptions, recurrence, resource and task calendars
32. Gantt interaction: drag to move, resize, drag-to-link
33. Undo/redo (command pattern over the mutation queue)
34. The 200-task reference plan validated against MS Project

**Demo:** a plan whose computed schedule matches MS Project exactly.

---

## Appendix A — Reference Task Payload

```json
{
  "id": "0193f2a1-...",
  "projectId": "0193f000-...",
  "parentId": "0193f1b2-...",
  "wbsCode": "1.3.2",
  "name": "Pour foundation",
  "isMilestone": false,
  "isSummary": false,
  "schedulingMode": "cpm",
  "durationMinutes": 2880,
  "taskType": "fixed_duration",
  "isEffortDriven": true,
  "isManuallyScheduled": false,
  "constraintType": "asap",
  "constraintDate": null,
  "deadline": "2026-09-15T00:00:00Z",
  "earlyStart": "2026-08-14T09:00:00Z",
  "earlyFinish": "2026-08-19T17:00:00Z",
  "lateStart": "2026-08-14T09:00:00Z",
  "lateFinish": "2026-08-19T17:00:00Z",
  "totalFloatMinutes": 0,
  "freeFloatMinutes": 0,
  "isCritical": true,
  "percentComplete": 0,
  "version": 7
}
```

## Appendix B — Environment Variables

```
DATABASE_URL=postgresql://scheduler:***@postgres:5432/scheduler
REDIS_URL=redis://redis:6379
JWT_SECRET=***
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
ARGON2_MEMORY_KB=65536
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
CORS_ORIGIN=http://localhost:8080
MAX_UPLOAD_MB=25
```

## Appendix C — How to Use This Document With Cursor

- Point Cursor at the specific section, not the whole file. `@TECHNICAL_DESIGN.md#4-scheduling-engine-design` when writing the engine.
- **Write the tests from §11 before the implementation.** Cursor generates far better engine code against a concrete test suite than against prose.
- When Cursor proposes something contradicting this document, the document wins — or the document gets updated deliberately, with an ADR.
- After any architectural decision made in a Cursor session, write the ADR immediately. That context is gone by tomorrow.
- The `scheduler` package purity rules (§1.2) are the constraint Cursor is most likely to violate — it will reach for `date-fns` unprompted. The ESLint boundary rule is what actually stops it.
