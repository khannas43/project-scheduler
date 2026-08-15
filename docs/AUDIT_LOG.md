# Audit log

Append-only project activity trail (`audit_log` table). Writers use `writeAuditLog()` in `apps/api/src/services/scheduleRunner.ts`. Readers use `GET /api/projects/:id/audit-log` (`audit.view`).

In-product UI: project workspace → **Activity** (`/projects/:id/activity`) with Help → `#activity`. Creating/editing custom roles also surfaces here as `role.create` / `role.update`.

---

## Retention

| Policy | Default |
|--------|---------|
| Updates | **Never** — rows are insert-only |
| Deletes | Not exposed via API; ops may prune by `created_at` |
| Project delete | `project_id` set to `null` before the project row is removed; a `project.delete` event is written with `projectId: null` |
| Default retention | **Indefinite** — size grows with mutation volume |

Recommended ops approach: retain N days/months of `audit_log` per compliance need; archive older rows to cold storage if required. Do not rewrite `before`/`after` payloads.

Index used for project timelines: `audit_log_project_id_created_at_idx` `(project_id, created_at DESC)`.

---

## List / filter API

`GET /api/projects/:id/audit-log`

| Query | Meaning |
|-------|---------|
| `action` | Prefix match (e.g. `role.`, `task.`, `project.export`) |
| `entityType` | Exact match (`role`, `task`, `baseline`, …) |
| `userId` | Actor UUID |
| `from` / `to` | ISO datetime range on `created_at` |
| `limit` | Page size (default service limit; max 200) |
| `offset` | Pagination offset |

Auth: session/JWT + permission **`audit.view`** (seeded on Admin, Project Manager, Viewer). After upgrading, re-seed:

```bash
pnpm --filter api db:seed
```

Response: `{ items, total, limit, offset }` — each item includes `action`, `entityType`, `entityId`, actor email/name, `createdAt`, and optional `before` / `after` JSON.

---

## Activity UI

| Feature | Detail |
|---------|--------|
| Route | `/projects/:id/activity` |
| Filters | Action prefix + entity type (Apply); placeholders include `role.` / `role` |
| Rows | Newest first; expand for before/after JSON |
| Help | `?` → `/help#activity` |
| Roles link | Roles page notes that New role / Edit write `role.create` / `role.update` |

CSV export of the audit trail from the UI is not shipped yet; use the list API or DB for compliance dumps.

---

## Coverage (action catalog)

### Project & import / export

| Action | Notes |
|--------|--------|
| `project.create` | Blank project |
| `project.create_from_template` | Category template |
| `project.create_from_spreadsheet` | New project from CSV/Excel |
| `project.import_spreadsheet` | Merge/replace into existing |
| `project.import_xml` | MSPDI |
| `project.duplicate` | Clone (no baselines/audit copy) |
| `project.update` / `project.delete` | Settings / delete |
| `project.progress_update` | Status-date / % complete batch |
| `project.level_resources` / `project.level_resources_undo` | Resource leveling |
| `project.export_csv` / `project.export_excel` / `project.export_pdf` | Reports downloads |

### Schedule & resources

| Action | Notes |
|--------|--------|
| `task.create` / `task.update` / `task.delete` | WBS mutations |
| `task.move` / `task.backlog_rank` / `task.board_column` | Structure / Agile placement |
| `task.notify` / `member.notify_tasks` | Email / notify |
| `dependency.create` / `dependency.delete` | Links |
| `assignment.create` / `assignment.update` / `assignment.delete` | Assignments |
| `assignment.timephased.update` | Contour edits |
| `resource.create` / `resource.update` / `resource.delete` | Resource pool |
| `calendar_exception.create` / `calendar_exception.delete` | Non-working days |
| `baseline.save` / `baseline.clear` | Baseline / EVM snapshot |

### Agile

| Action | Notes |
|--------|--------|
| `sprint.create` / `sprint.update` / `sprint.delete` / `sprint.close` | Sprints |
| `board_column.create` / `board_column.update` / `board_column.delete` | Board columns |

### People, roles & reports

| Action | Notes |
|--------|--------|
| `member.add` / `member.update` / `member.remove` | Project membership |
| `user.create` / `user.update` | Login users (project-scoped audit when created from People) |
| **`role.create` / `role.update`** | **Custom roles** — `after` includes `permissionKeys`; system roles immutable (no update path) |
| `saved_report.create` / `saved_report.update` / `saved_report.delete` | Custom report definitions |

### Intentional gaps

- Auth login / refresh / logout (no project scope)
- System-role edits (forbidden)
- Saved-report **preview** (ephemeral)
- Most read-only GETs

---

## Related docs

- In-product Help: `/help#activity`, `/help#roles`
- README → **In-product help (User Manual)** (role creation activity + Activity filters)
