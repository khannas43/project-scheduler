import { PERMISSIONS, type PermissionKey } from './permissions.js';

/**
 * Seeded, immutable roles (`is_system = true`) — PROJECT_SCOPE.md §3.3.
 * Usable as clone templates for custom roles (§3.4).
 */
export interface SystemRole {
  readonly name: string;
  readonly description: string;
  readonly isSystem: true;
  readonly permissions: readonly PermissionKey[];
}

const ALL_PERMISSION_KEYS: readonly PermissionKey[] = (
  Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]
).map((k) => PERMISSIONS[k].key);

export const SYSTEM_ROLES = {
  ADMIN: {
    name: 'Admin',
    description: 'All permissions',
    isSystem: true,
    // Derived, not hand-listed: an Admin has every permission that exists,
    // by definition — adding a permission must never require updating this role.
    permissions: ALL_PERMISSION_KEYS,
  },

  PROJECT_MANAGER: {
    name: 'Project Manager',
    description: 'Full project CRUD, baselines, resources, cost, reports',
    isSystem: true,
    permissions: [
      PERMISSIONS.PROJECT_VIEW.key,
      PERMISSIONS.PROJECT_EDIT.key,
      PERMISSIONS.PROJECT_DELETE.key,
      PERMISSIONS.PROJECT_ARCHIVE.key,
      PERMISSIONS.TASK_VIEW.key,
      PERMISSIONS.TASK_CREATE.key,
      PERMISSIONS.TASK_EDIT.key,
      PERMISSIONS.TASK_DELETE.key,
      PERMISSIONS.TASK_REORDER.key,
      PERMISSIONS.DEPENDENCY_CREATE.key,
      PERMISSIONS.DEPENDENCY_DELETE.key,
      PERMISSIONS.SCHEDULE_RECALCULATE.key,
      PERMISSIONS.SCHEDULE_OVERRIDE_CONSTRAINT.key,
      PERMISSIONS.BASELINE_VIEW.key,
      PERMISSIONS.BASELINE_SAVE.key,
      PERMISSIONS.BASELINE_CLEAR.key,
      PERMISSIONS.RESOURCE_VIEW.key,
      PERMISSIONS.RESOURCE_CREATE.key,
      PERMISSIONS.RESOURCE_EDIT.key,
      PERMISSIONS.RESOURCE_ASSIGN.key,
      PERMISSIONS.COST_VIEW.key,
      PERMISSIONS.COST_EDIT.key,
      PERMISSIONS.RATE_VIEW.key,
      PERMISSIONS.ACTUALS_REPORT_OWN.key,
      PERMISSIONS.ACTUALS_REPORT_ANY.key,
      PERMISSIONS.ACTUALS_APPROVE.key,
      PERMISSIONS.SPRINT_VIEW.key,
      PERMISSIONS.SPRINT_CREATE.key,
      PERMISSIONS.SPRINT_EDIT.key,
      PERMISSIONS.BOARD_MOVE_CARD.key,
      PERMISSIONS.BACKLOG_REORDER.key,
      PERMISSIONS.REPORT_VIEW.key,
      PERMISSIONS.REPORT_CREATE.key,
      PERMISSIONS.REPORT_EXPORT.key,
      PERMISSIONS.DATA_IMPORT.key,
      PERMISSIONS.DATA_EXPORT.key,
      // No Admin-category permissions: role/user/calendar/settings management
      // is reserved for the Admin role.
    ],
  },

  SCHEDULER: {
    name: 'Scheduler',
    description: 'Task and dependency editing, no cost visibility, no user management',
    isSystem: true,
    permissions: [
      PERMISSIONS.PROJECT_VIEW.key,
      PERMISSIONS.TASK_VIEW.key,
      PERMISSIONS.TASK_CREATE.key,
      PERMISSIONS.TASK_EDIT.key,
      PERMISSIONS.TASK_DELETE.key,
      PERMISSIONS.TASK_REORDER.key,
      PERMISSIONS.DEPENDENCY_CREATE.key,
      PERMISSIONS.DEPENDENCY_DELETE.key,
      PERMISSIONS.SCHEDULE_RECALCULATE.key,
      PERMISSIONS.SCHEDULE_OVERRIDE_CONSTRAINT.key,
    ],
  },

  TEAM_MEMBER: {
    name: 'Team Member',
    description: 'View project, report own actuals, move own cards, comment',
    isSystem: true,
    permissions: [
      PERMISSIONS.PROJECT_VIEW.key,
      PERMISSIONS.TASK_VIEW.key,
      PERMISSIONS.ACTUALS_REPORT_OWN.key,
      PERMISSIONS.BOARD_MOVE_CARD.key,
      // Scope §5.12 lists task-level comments as a v1 feature, but §3.2's
      // permission namespace has no corresponding key yet — nothing to grant here.
    ],
  },

  VIEWER: {
    name: 'Viewer',
    description: 'Read-only, no cost visibility',
    isSystem: true,
    permissions: [
      PERMISSIONS.PROJECT_VIEW.key,
      PERMISSIONS.TASK_VIEW.key,
      PERMISSIONS.RESOURCE_VIEW.key,
      PERMISSIONS.BASELINE_VIEW.key,
      PERMISSIONS.REPORT_VIEW.key,
    ],
  },
} as const satisfies Record<string, SystemRole>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
