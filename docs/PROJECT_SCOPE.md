# Project Scope — Project Management & Scheduling Tool

**Document status:** v0.3
**Deployment model:** Single-tenant, self-hosted, multi-project
**Team:** Sameer Khanna (solo) + AI pair (Cursor / Claude)
**Last updated:** 2026-07-24

---

## 1. Purpose

A self-hosted web application for project planning and scheduling, combining a genuine CPM (Critical Path Method) engine with an interactive Gantt chart, resource management, progress tracking, and — as a distinct planning mode — Agile boards and sprints.

### 1.1 Problem statement

MS Project is desktop-bound, licence-heavy, and hostile to collaboration. Web alternatives (Asana, Monday, ClickUp, Jira) are task trackers with no real scheduling engine — no critical path, no float, no calendar-aware date arithmetic. Neither camp supports a plan that is partly predictive (CPM) and partly adaptive (Agile). This project targets that gap.

### 1.2 Success criteria

| # | Criterion | Measure |
|---|---|---|
| S1 | Schedule correctness | CPM output matches MS Project on a 200-task reference plan, ±0 days |
| S2 | Gantt performance | 10,000 tasks render and pan at ≥50 FPS |
| S3 | Recalculation latency | Full reschedule of 5,000 tasks < 200 ms |
| S4 | Interoperability | MS Project XML round-trip preserves tasks, dependencies, calendars, assignments |
| S5 | Deployment | `docker compose up` yields a working stack from a clean machine |
| S6 | Extensible authorisation | A new role with a custom permission set can be created through the UI, no code change |

---

## 2. Scope Summary

### 2.1 In scope

- Multiple projects within one self-hosted instance
- Hierarchical task planning (WBS): summary tasks, subtasks, milestones
- Full dependency model (FS, SS, FF, SF) with lead/lag
- Task constraints and deadlines
- CPM forward/backward pass, total float, free float, critical path
- Working-time calendars (project, resource, task) with exceptions
- Resource definition, assignment, cost, overallocation **detection**
- Baselines, actual progress tracking, earned value metrics
- **Agile mode**: boards, sprints, backlog, story points, burndown/burnup/velocity/CFD
- Interactive Gantt, grid/sheet, network diagram, resource usage views
- MS Project **XML** import/export, CSV/Excel, PDF/PNG export
- **Dynamic RBAC**: user-defined roles with arbitrary permission sets
- Local account authentication
- Docker Compose deployment

### 2.2 Out of scope (v1)

| Item | Rationale | Revisit |
|---|---|---|
| `.mpp` binary import | Requires a JVM sidecar (MPXJ); XML covers the need | v2 |
| Resource levelling (automatic) | Hardest algorithm in the domain; detection alone is most of the value | v2 |
| Real-time co-editing (CRDT) | Optimistic locking is ~2 days vs ~3 weeks | v2, likely never needed |
| WASM / Rust engine port | TypeScript is adequate below ~20k tasks | Only if profiling demands |
| SSO / SAML / OIDC | Single-tenant self-hosted; local accounts suffice | v2 |
| Multi-tenancy | Explicitly single-tenant | — |
| Primavera P6 XER | Niche interop | v2 |
| Native mobile apps | Responsive web only | — |
| Timesheets, invoicing, payroll | Out of domain | — |
| Monte Carlo risk simulation | Out of domain for v1 | v2 |

### 2.3 Explicit non-goals

- Not bug-for-bug MS Project parity. Documented, defensible scheduling behaviour is the standard; deliberate divergences are recorded.
- Not a Jira replacement. Agile mode serves hybrid plans, not dedicated software teams.

---

## 3. Authorisation Model (Dynamic RBAC)

Permissions are data, not code. Roles are user-definable.

### 3.1 Schema

```
permissions        key (e.g. 'task.delete'), category, description
roles              name, description, is_system (immutable flag), workspace_id
role_permissions   role_id × permission_id
project_members    user_id × project_id × role_id
```

A user's effective permission set on a project is the union of permissions granted to their role on that project. Assignment is **per project** — a user may be PM on one project and Viewer on another.

### 3.2 Permission namespace

Format: `resource.action`.

| Category | Example keys |
|---|---|
| Project | `project.view`, `project.edit`, `project.delete`, `project.archive` |
| Task | `task.view`, `task.create`, `task.edit`, `task.delete`, `task.reorder` |
| Dependency | `dependency.create`, `dependency.delete` |
| Schedule | `schedule.recalculate`, `schedule.override_constraint` |
| Baseline | `baseline.view`, `baseline.save`, `baseline.clear` |
| Resource | `resource.view`, `resource.create`, `resource.edit`, `resource.assign` |
| Cost | `cost.view`, `cost.edit`, `rate.view` |
| Tracking | `actuals.report_own`, `actuals.report_any`, `actuals.approve` |
| Agile | `sprint.create`, `sprint.edit`, `board.move_card`, `backlog.reorder` |
| Report | `report.view`, `report.create`, `report.export` |
| Import/Export | `data.import`, `data.export` |
| Admin | `role.manage`, `user.manage`, `calendar.manage`, `settings.manage` |

### 3.3 Seeded system roles

Shipped as immutable seeds (`is_system = true`), usable as clone templates:

| Role | Summary |
|---|---|
| **Admin** | All permissions |
| **Project Manager** | Full project CRUD, baselines, resources, cost, reports |
| **Scheduler** | Task and dependency editing, no cost visibility, no user management |
| **Team Member** | View project, report own actuals, move own cards, comment |
| **Viewer** | Read-only, no cost visibility |

### 3.4 Custom roles

Users with `role.manage` may clone a system role or start empty, tick permissions in a categorised matrix UI, name it, and save. Custom roles are editable and deletable (with reassignment of affected members).

### 3.5 Enforcement rules

- **Server-side is authoritative.** Every mutating route carries a Fastify `preHandler` permission guard. UI hiding is cosmetic only.
- **Fail closed.** Unknown permission key → denied.
- **New features add a permission row.** Existing custom roles do not receive it until explicitly granted.
- All permission changes written to the audit log.

---

## 4. Planning Modes

The application supports two planning paradigms. **A task belongs to exactly one mode.** This is the central design constraint — CPM and Scrum make contradictory claims about what determines a task's dates, and allowing both to drive one task produces incoherent behaviour.

| | CPM mode | Agile mode |
|---|---|---|
| Dates determined by | Dependencies, constraints, calendars | Sprint boundaries |
| Duration unit | Days / hours | Story points |
| Ordering | Dependency graph | Backlog rank, board column |
| Included in critical path | Yes | No |
| Gantt representation | Task bar | Sprint-length bar |

A single project may contain both. Agile tasks are excluded from the CPM graph entirely; they render on the master Gantt as sprint-shaped bars so hybrid plans remain readable. Switching a task's mode is an explicit, warned action that clears mode-specific fields.

---

## 5. Functional Scope

### 5.1 Multi-project workspace

- Unlimited projects within the single tenant
- Project list with status, health, owner, date range
- Portfolio dashboard aggregating across projects
- Shared resource pool across all projects
- Global calendars, overridable per project
- Project archive and restore
- Project templates and duplication

### 5.2 Task & WBS management

- Create, edit, delete, reorder, indent/outdent
- Automatic WBS code generation and renumbering
- Summary rollup: dates, duration, cost, work, % complete derived from children
- Milestones (zero duration)
- Recurring tasks
- Notes, attachments, custom fields (text, number, date, flag, cost, list)
- Task types: Fixed Duration, Fixed Units, Fixed Work
- Effort-driven toggle
- Manual vs auto-scheduled
- Cycle detection with a readable error path

### 5.3 Dependencies

- Four link types: FS, SS, FF, SF
- Lead/lag in days or percentage of predecessor duration
- Drag-to-link on the Gantt
- Validation: no self-links, no cycles, no links into a summary's own descendants
- Cross-project dependencies deferred to v2

### 5.4 Constraints & deadlines

ASAP (default), ALAP, Start No Earlier Than, Start No Later Than, Finish No Earlier Than, Finish No Later Than, Must Start On, Must Finish On.

Plus deadline dates (non-driving; raise a warning when missed) and conflict reporting when a constraint contradicts a dependency.

### 5.5 Calendars

- Project calendar: working days, hours, shift patterns
- Resource calendars inheriting from project, with overrides
- Task calendars
- Exception dates: holidays, shutdowns, one-off working weekends
- Recurring annual exceptions
- Duration↔work conversion honouring the applicable calendar

### 5.6 Scheduling engine

The core deliverable.

- Forward pass → early start / early finish
- Backward pass → late start / late finish
- Total float and free float per task
- Critical path identification (float ≤ configurable threshold)
- Constraint application with documented precedence rules
- Calendar-aware date arithmetic
- Deterministic: identical input always yields identical output
- Pure and side-effect free — no I/O, no clock reads, no randomness
- Incremental recalculation of dirty subgraphs only
- Isomorphic: same code runs in browser (optimistic) and server (authoritative)
- Agile-mode tasks excluded from the graph

**Acceptance:** ≥800 unit tests including a golden-file corpus validated against MS Project output.

### 5.7 Resources

- Types: Work, Material, Cost
- Instance-wide resource pool
- Max units (capacity), standard rate, overtime rate, cost per use
- Cost accrual: start / prorated / end
- Assignments with units (50%, 200%)
- Timephased work distribution
- **Overallocation detection** with a dedicated conflict view
- Skill/role tagging for assignment suggestions
- Automatic levelling → v2

### 5.8 Baselines & tracking

- Up to 11 baselines per project (baseline 0 + 10 interim)
- Capture: start, finish, duration, work, cost per task
- Actuals: actual start/finish, actual duration, remaining duration, actual work, actual cost
- % Complete, % Work Complete, Physical % Complete
- Status date with progress line on the Gantt
- Variance columns: planned vs baseline vs actual

### 5.9 Earned value

PV (BCWS), EV (BCWP), AC (ACWP), SV, CV, SPI, CPI, BAC, EAC, ETC, VAC, TCPI — as a table and an S-curve chart.

### 5.10 Agile module

- **Boards**: configurable columns, WIP limits, drag-drop, swimlanes by assignee or epic
- **Sprints**: name, goal, start/end, capacity, state (planned / active / closed)
- **Backlog**: ordered, drag to rank, drag into sprint
- **Estimation**: story points (Fibonacci or linear), configurable per project
- **Hierarchy**: epic → story → subtask, mapped onto the WBS tree
- **Charts**: burndown, burnup, velocity, cumulative flow diagram
- **Sprint ceremonies**: planning view, sprint close with carry-over handling
- **Hybrid rendering**: sprints appear on the master Gantt as bars

### 5.11 Views

| View | Description |
|---|---|
| **Gantt** | Canvas-rendered bars, dependency arrows, timescale zoom (day→quarter), drag to move, resize to change duration, drag-link, critical path highlight, baseline overlay, progress bars, sprint bars |
| **Grid / Sheet** | Virtualised spreadsheet, inline editing, column chooser, sort, group, filter, saved presets |
| **Board** | Agile kanban with columns and WIP limits |
| **Backlog** | Ranked list with sprint assignment |
| **Network diagram** | PERT node graph, auto-layout |
| **Resource sheet** | Capacity, rates, allocation summary |
| **Resource usage** | Timephased: resource → assignments → work per period |
| **Task usage** | Timephased: task → resources → work per period |
| **Calendar** | Month view of tasks by date |
| **Timeline** | Condensed executive roadmap |
| **Dashboard** | Health, EV charts, overallocations, upcoming milestones, slipping tasks |
| **Portfolio** | Cross-project rollup |

### 5.12 Collaboration (v1 — optimistic locking)

- Row version stamps; stale writes rejected with HTTP 409 and a reload prompt
- Comments and @mentions at task level
- File attachments
- Activity feed / audit log
- In-app notifications
- Real-time co-editing deferred to v2

### 5.13 Import / export

| Format | Direction | Notes |
|---|---|---|
| MS Project XML (`.xml`) | Import + Export | Primary interop path |
| CSV | Import + Export | Flat task lists |
| Excel `.xlsx` | Import + Export | Task lists with formatting |
| PDF | Export | Gantt and reports, paginated |
| PNG / SVG | Export | Gantt snapshot |
| iCal | Export | Task dates to calendar clients |
| JSON | Import + Export | Native full-fidelity format |
| `.mpp` | — | v2 |

### 5.14 Reporting

- Built-in: project summary, critical tasks, overallocated resources, milestone report, cost overview, EV report, slipping tasks, sprint report, velocity history
- Custom report builder: columns, filters, grouping, chart type
- Scheduled email delivery → v2

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | 10k tasks: Gantt ≥50 FPS; grid scroll ≥60 FPS; full reschedule <200 ms; project load <2 s |
| **Scale** | 20k tasks per project, 200 resources, 20 concurrent users (single-tenant reality) |
| **Security** | Argon2id hashing, JWT + refresh rotation, server-side RBAC on every mutating route, rate limiting, audit log |
| **Data integrity** | Schedule mutations transactional; optimistic locking via version stamps |
| **Backup** | Nightly `pg_dump` to a mounted volume, 30-day retention, documented restore procedure |
| **Browser support** | Latest 2 versions of Chrome, Edge, Firefox, Safari |
| **Accessibility** | WCAG 2.1 AA for grid and forms; Gantt canvas backed by an equivalent accessible grid |
| **i18n** | UTF-8 throughout, locale-aware dates/numbers, strings externalised from day one; translations v2 |
| **Observability** | Structured logs, health/readiness endpoints, basic Prometheus metrics |

---

## 7. Technical Architecture

### 7.1 Stack

**Frontend**
- React 19 + TypeScript (strict)
- Vite
- TanStack Table v8 — virtualised grid
- TanStack Query — server state
- Zustand — UI state
- Canvas 2D custom renderer — Gantt
- dnd-kit — board and backlog drag-drop
- Tailwind CSS + shadcn/ui
- Recharts — burndown, velocity, S-curve

**Backend**
- Node.js 22 + TypeScript
- Fastify
- Drizzle ORM, with raw recursive CTEs where needed
- Zod validation, schemas shared with frontend
- BullMQ + Redis — imports, exports, PDF generation

**Database**
- PostgreSQL 17
- `ltree` extension for WBS path traversal
- Partitioned timephased data tables
- Drizzle Kit migrations, applied by an init container

**Scheduling engine**
- Standalone TypeScript package in a pnpm + Turborepo monorepo
- Zero runtime dependencies
- Consumed by both browser and server
- No WASM (see §9)

### 7.2 Repository layout

```
/apps
  /web            React frontend
  /api            Fastify backend
/packages
  /scheduler      CPM engine (pure TypeScript)
  /schema         Zod schemas + shared types
  /gantt          Canvas rendering library
  /rbac           Permission definitions + guard helpers
  /ui             Shared components
/infra
  compose.yaml
  compose.override.yaml
  /docker         Dockerfiles
```

### 7.3 Deployment (Docker)

```
compose.yaml
├── postgres   :17-alpine, named volume, healthcheck-gated
├── redis      :7-alpine
├── migrate    init container, runs migrations, exits 0
├── api        Node 22 alpine, multi-stage build, non-root user
└── web        Vite build → nginx:alpine
```

Five services — no JVM sidecar, since `.mpp` is out of scope.

Principles: multi-stage builds, non-root users, `depends_on` with `condition: service_healthy`, migrations as a separate init container (never on API boot), secrets via environment or Docker secrets, `compose.override.yaml` for dev hot-reload, named volume for Postgres persistence, nightly backup sidecar or host cron.

---

## 8. Delivery Phases

Sequenced for a single developer. Each phase is independently shippable — stop at any boundary and the product still stands up.

### Phase 0 — Foundation
Monorepo, Postgres schema, local auth, **dynamic RBAC (permissions, roles, role_permissions, project_members, guard middleware, role management UI)**, multi-project shell, CI, Docker Compose stack.
**Exit:** `docker compose up` gives a running app where a custom role can be created and enforced.

### Phase 1 — Core planning
Task CRUD, WBS hierarchy, FS dependencies, CPM v1 (forward/backward pass, float, critical path), read-only Gantt, grid view.
**Exit:** A plan can be built and its critical path is correct against reference cases.
*Prototype the Gantt renderer here with 10k synthetic tasks — before the design is locked in.*

### Phase 2 — Full scheduling
All four dependency types, lead/lag, all constraint types, deadlines, project/resource/task calendars with exceptions, fully interactive Gantt (drag, resize, link).
**Exit:** Schedule matches MS Project on the 200-task reference plan.

### Phase 3 — Resources
Resource pool, assignments, units, cost model, timephased work distribution, overallocation detection, resource sheet and usage views.
**Exit:** Assignments compute cost and work correctly; overallocations surface.

### Phase 4 — Tracking
Baselines, actuals capture, % complete variants, status date, progress lines, variance columns, earned value metrics and S-curve.
**Exit:** A baselined plan reports accurate SPI/CPI against recorded actuals.

### Phase 5 — Interop & reporting
MS Project XML import/export, CSV/Excel/PDF/PNG export, report builder, project and portfolio dashboards.
**Exit:** Round-trip with MS Project preserves the plan.

### Phase 6 — Agile module
Planning-mode field, boards, sprints, backlog, story points, epic hierarchy, burndown/burnup/velocity/CFD, sprint bars on the master Gantt, sprint close and carry-over.
**Exit:** A project runs CPM and Agile tasks side by side without the engine and the board fighting each other.

### Phase 7 — Deferred (v2)
Automatic resource levelling · `.mpp` import via MPXJ sidecar · real-time co-editing (Yjs) · SSO/OIDC · cross-project dependencies · scheduled report email · WASM engine port (only if profiling demands).

---

## 9. Resolved Decisions

| # | Question | Decision | Consequence |
|---|---|---|---|
| 1 | Tenancy | Single-tenant self-hosted, multi-project | No tenant isolation layer; shared resource pool and global calendars are natural |
| 2 | Team | One developer + AI pair | Phases sequenced, not parallelised; engine API frozen early so UI can build against a stub |
| 3 | `.mpp` import | XML only for v1 | JVM sidecar dropped; five containers instead of six |
| 4 | Concurrency | Optimistic locking | ~2 days vs ~3 weeks for CRDT; no websocket infrastructure in v1 |
| 5 | Auth | Local accounts | Argon2id + JWT; no OIDC/SAML surface |
| 6 | Resource levelling | v2 | Detection retained in v1 — most of the value, none of the algorithmic risk |
| 7 | WASM engine | **No** | TypeScript handles the realistic ceiling (~20k tasks) well inside budget. A Rust→WASM port would mean a second language in the codebase for an optimisation that only pays off above that. Kept as a documented escape hatch if profiling ever shows a wall. |
| 8 | Agile module | **Yes, Phase 6** | Requires a per-task `scheduling_mode` (`cpm` \| `agile`); agile tasks excluded from the CPM graph |
| 9 | RBAC | **Dynamic, user-defined roles** | Permissions stored as data; system roles seeded immutable; new features add permission rows |
| 10 | Delivery date | **None fixed** — schedule-flexible | Phase boundaries serve as checkpoints; each phase independently shippable |
| 11 | Field-level cost stripping | **Dropped** | Role-level `cost.view` gate only; no serialiser complexity |
| 12 | Build priority | **CPM core first** | Phases 1–5 deliver a complete CPM tool; Agile (Phase 6) is cuttable without loss |

---

## 10. Risk Register

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | MS Project's undocumented scheduling edge cases | High | Budget explicit reverse-engineering time; build the golden-file corpus in Phase 1; record deliberate divergences |
| R2 | Gantt canvas performance at scale | High | Prototype the renderer in Phase 1 against 10k synthetic tasks before locking the design |
| R3 | Agile and CPM models bleeding into each other | High | Hard `scheduling_mode` split enforced at the schema level, not by convention |
| R4 | Single-developer bus factor and context loss | Medium | Comprehensive test suite as executable specification; architecture decision records; the engine spec written before the engine |
| R5 | Permission checks drifting out of sync with new routes | Medium | Central permission registry in `/packages/rbac`; integration test asserting every mutating route declares a guard |
| R6 | Scope creep toward MS Project or Jira parity | High | Enforce §2.2 at every phase boundary |
| R7 | Optimistic locking proving too coarse in practice | Low | Row-level rather than project-level version stamps; Yjs remains available in v2 |

---

## 11. Remaining Open Items

All blocking questions resolved as of 2026-07-24. Development may begin.

| # | Item | Status |
|---|---|---|
| 1 | Delivery date | **No fixed date.** Schedule-flexible; owner driving to closure. Phase boundaries are the checkpoints. |
| 2 | Field-level cost restriction | **Dropped.** Single-tenant, solo-administered; role-level permission is sufficient. |
| 3 | Agile module | **Deferred to Phase 6.** CPM core proven first; `scheduling_mode` field present in schema from Phase 0 so retrofitting is not required. |
| 4 | Realistic project size | To be confirmed by real usage. No-WASM decision holds below ~20k tasks. |
| 5 | Backup destination | Local mounted volume for v1; offsite at owner's discretion. |

---

## 12. Glossary

| Term | Definition |
|---|---|
| **WBS** | Work Breakdown Structure — hierarchical decomposition of project scope |
| **CPM** | Critical Path Method — algorithm determining the longest dependent task chain |
| **Total float** | Delay a task can absorb without delaying project finish |
| **Free float** | Delay a task can absorb without delaying any successor |
| **Lead / Lag** | Negative / positive offset applied to a dependency link |
| **Baseline** | Frozen snapshot of the plan used as comparison reference |
| **Timephased data** | Values distributed across time periods rather than stored as a single total |
| **Levelling** | Resolving resource overallocation by shifting tasks within available float |
| **EV / PV / AC** | Earned Value / Planned Value / Actual Cost |
| **SPI / CPI** | Schedule / Cost Performance Index — EV÷PV and EV÷AC |
| **CFD** | Cumulative Flow Diagram — work-in-state over time |
| **Velocity** | Story points completed per sprint |
| **RBAC** | Role-Based Access Control |
| **CRDT** | Conflict-free Replicated Data Type — enables real-time co-editing |
| **WASM** | WebAssembly — compiled binary format running at near-native speed in browsers |
