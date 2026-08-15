export type HelpTopicId =
  | 'getting-started'
  | 'schedule'
  | 'resources'
  | 'progress'
  | 'import-export'
  | 'reports'
  | 'activity'
  | 'agile'
  | 'roles'
  | 'settings';

export interface HelpTopic {
  readonly id: HelpTopicId;
  readonly title: string;
  readonly summary: string;
  readonly paragraphs: readonly string[];
  readonly tips?: readonly string[];
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'Sign in, open a project, and find your way around the workspace.',
    paragraphs: [
      'Sign in with the admin account created by the database seed (see the project README for SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).',
      'From Projects you can create a blank plan, start from a category template, or import a spreadsheet. Portfolio shows health across projects you can access.',
      'Inside a project, use the workspace tabs: Schedule (grid + Gantt), Dashboard, Resources, People, Board/Backlog, Baselines, Reports, Charts, Roles, Activity, and Settings. Use the ? links on those pages to open this manual at the matching topic.',
    ],
    tips: [
      'Keep the API running when using the Vite app — /api and /health are proxied to port 3100. If the API is down, login shows an unreachable hint instead of a bare Failed to fetch.',
      'Use Undo/Redo on the Schedule page after supported edits.',
      'After you create a custom role, confirm it on Activity (filter role.) — see Roles and Activity topics.',
    ],
  },
  {
    id: 'schedule',
    title: 'Schedule & Gantt',
    summary: 'Build the WBS, link tasks, filter the plan, and read CPM dates.',
    paragraphs: [
      'The Schedule page combines a task grid and Gantt. Add tasks and subtasks, set duration, predecessors, constraints, and % complete. Summary rows roll up dates and progress.',
      'Focus filters (All, Critical path, Near-critical, Lookahead) and optional resource filter narrow both the grid and Gantt. Parents of matches stay visible for WBS context.',
      'Drag Gantt bars to move or resize where supported; dependency links drive the critical-path engine. Critical tasks are highlighted in the grid.',
    ],
    tips: [
      'Lookahead uses the project status date when set, otherwise today.',
      'Switch view modes (grid / Gantt / split) from the Schedule toolbar.',
    ],
  },
  {
    id: 'resources',
    title: 'Resources & leveling',
    summary: 'Assign people or equipment, spot overallocation, and level selected work.',
    paragraphs: [
      'Manage the project resource pool under Resources. Open a resource for calendar/assignment detail. Assign resources from a task’s Resources action on the Schedule grid.',
      'Overallocation badges and reports show days where assigned units exceed max units.',
      'Level resources (Schedule toolbar) can delay eligible non-critical work within float. Choose all tasks or a selected subset; unselected tasks still consume load but will not be moved.',
    ],
    tips: [
      'Preview leveling before applying when the modal offers a dry run.',
      'Leveling respects float — overconstrained plans may still show pressure.',
    ],
  },
  {
    id: 'progress',
    title: 'Progress & baselines',
    summary: 'Record % complete, status date, and compare against a saved baseline.',
    paragraphs: [
      'Update progress from the Schedule toolbar: set a status date, apply as-scheduled %, set a target %, and optionally reschedule incomplete work.',
      'Baselines capture a point-in-time plan. Capture, compare variance, and review earned value (SPI/CPI, S-curve) on the Baselines page.',
      'Project Settings controls status date, date display formats, and which baseline to show on the Gantt when enabled.',
    ],
  },
  {
    id: 'import-export',
    title: 'Import & export',
    summary: 'Bring tasks in from Excel/CSV or MSPDI; export plans for sharing.',
    paragraphs: [
      'New project → from spreadsheet creates a project from a CSV/Excel template. Open project → Import merges or replaces tasks in the current plan. Merge appends new WBS roots and highlights new rows with a New badge.',
      'Duplicate copies an existing project (calendars, tasks, links, assignments, board columns, sprints) without baselines.',
      'Export CSV/Excel/PDF from Reports (full task list). MSPDI XML import/export is available via the API/data export permissions for MS Project XML interchange.',
    ],
    tips: [
      'Download the Excel/CSV template from the import dialog before filling rows.',
      'Replace mode deletes existing tasks — confirm carefully.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports & custom reports',
    summary: 'Run built-in reports or save your own column/filter definitions.',
    paragraphs: [
      'Built-in reports include project summary, critical tasks, milestones, overallocated resources, cost overview, and slipping tasks.',
      'Custom reports let you pick columns, filters (critical, milestones, summaries, resources, % complete), and sort order. Preview against live data, save the definition on the project, and export CSV.',
      'Earned value charts live primarily on Baselines; Reports links there for SPI/CPI context.',
    ],
  },
  {
    id: 'activity',
    title: 'Activity & audit log',
    summary: 'Who changed what on this project — append-only history.',
    paragraphs: [
      'The Activity page lists audit events for the project (newest first): action, actor, entity, and optional before/after JSON. Filter by action prefix (for example task. or role.) or entity type (task, role, baseline, …). The same filters are available on GET /api/projects/:id/audit-log.',
      'Coverage includes projects and imports/exports, tasks and dependencies, assignments and resources, calendars, baselines, leveling and progress updates, Agile sprints/board columns, members and users, custom roles (role.create / role.update with permissionKeys in after), saved reports, and CSV/Excel/PDF exports. Auth login/refresh is not project-scoped and is not shown here.',
      'Rows are append-only — the API never updates an audit event. Deleting a project nulls project_id on older rows and logs project.delete. Retention is indefinite by default; operators should prune or archive with a documented ops policy (see docs/AUDIT_LOG.md). Do not rewrite before/after payloads.',
    ],
    tips: [
      'Requires the audit.view permission (Admin, Project Manager, and Viewer system roles include it after re-seed).',
      'To verify a new custom role, filter Activity by action prefix role. or entity type role.',
      'Re-run pnpm --filter api db:seed after upgrading so new permissions land in the database.',
    ],
  },
  {
    id: 'agile',
    title: 'Agile board & backlog',
    summary: 'Run Agile-mode tasks beside CPM without mixing their engines.',
    paragraphs: [
      'Tasks can be CPM or Agile. Agile tasks appear on the Board and Backlog with story points and sprints; they are excluded from the CPM graph.',
      'Manage board columns, WIP limits, and done columns. Close sprints to carry incomplete work forward. Charts show velocity, burndown, and burnup.',
      'A cumulative flow diagram (CFD) is intentionally deferred — the product documents why rather than showing a misleading chart.',
    ],
  },
  {
    id: 'roles',
    title: 'Roles & permissions',
    summary: 'Control who can edit schedules, costs, reports, and admin functions.',
    paragraphs: [
      'Roles are a permission catalog granted per project membership. System roles (Admin, Project Manager, Viewer, and others) are seeded and immutable. Custom roles are created on the Roles page (New role, or Clone from an existing role) where you have role.manage.',
      'Creating or updating a custom role writes Activity events role.create and role.update (entity type role), including the permission key set in the after snapshot. Open Activity and filter role. to confirm the change.',
      'Create login users and assign them a role on People. Tick “Also create a work resource” so you can assign their tasks and email them. Email assignees from the task resource panel, or Email tasks on the People row. Without SMTP_HOST the message is logged on the API instead of sent.',
      'Sensitive actions (import, export, leveling, report create, audit view) require matching permission keys. Viewers typically have report.view and audit.view only.',
    ],
    tips: [
      'System roles cannot be edited in the UI — clone them into a custom role instead.',
      'People ? opens this topic; Activity ? covers how role.create appears in the audit trail.',
    ],
  },
  {
    id: 'settings',
    title: 'Project settings',
    summary: 'Name, status, dates, display formats, and import into this project.',
    paragraphs: [
      'Settings cover project name and status, start/status dates, date format and date/time display, and baseline display on the Gantt.',
      'You can also import a spreadsheet into this project (merge or replace) from Settings — same capability as Schedule → Import.',
    ],
  },
];

export function helpTopicById(id: string | undefined): HelpTopic | undefined {
  if (!id) return undefined;
  return HELP_TOPICS.find((t) => t.id === id);
}
