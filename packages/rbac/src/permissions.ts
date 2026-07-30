/**
 * Permission registry — the single source of truth (TECHNICAL_DESIGN.md §6.1).
 * Adding a permission means adding it here; a migration seeds it into the database.
 * Keys and categories are exactly those enumerated in PROJECT_SCOPE.md §3.2.
 */
export const PERMISSIONS = {
  // Project
  PROJECT_VIEW: { key: 'project.view', category: 'Project', description: 'View project' },
  PROJECT_EDIT: { key: 'project.edit', category: 'Project', description: 'Edit project settings' },
  PROJECT_DELETE: { key: 'project.delete', category: 'Project', description: 'Delete project' },
  PROJECT_ARCHIVE: { key: 'project.archive', category: 'Project', description: 'Archive project' },

  // Task
  TASK_VIEW: { key: 'task.view', category: 'Task', description: 'View tasks' },
  TASK_CREATE: { key: 'task.create', category: 'Task', description: 'Create tasks' },
  TASK_EDIT: { key: 'task.edit', category: 'Task', description: 'Edit tasks' },
  TASK_DELETE: { key: 'task.delete', category: 'Task', description: 'Delete tasks' },
  TASK_REORDER: { key: 'task.reorder', category: 'Task', description: 'Reorder or move tasks' },

  // Dependency
  DEPENDENCY_CREATE: { key: 'dependency.create', category: 'Dependency', description: 'Create task dependencies' },
  DEPENDENCY_DELETE: { key: 'dependency.delete', category: 'Dependency', description: 'Delete task dependencies' },

  // Schedule
  SCHEDULE_RECALCULATE: { key: 'schedule.recalculate', category: 'Schedule', description: 'Trigger schedule recalculation' },
  SCHEDULE_OVERRIDE_CONSTRAINT: { key: 'schedule.override_constraint', category: 'Schedule', description: 'Override a scheduling constraint' },

  // Baseline
  BASELINE_VIEW: { key: 'baseline.view', category: 'Baseline', description: 'View baselines' },
  BASELINE_SAVE: { key: 'baseline.save', category: 'Baseline', description: 'Save a new baseline' },
  BASELINE_CLEAR: { key: 'baseline.clear', category: 'Baseline', description: 'Clear a baseline' },

  // Resource
  RESOURCE_VIEW: { key: 'resource.view', category: 'Resource', description: 'View resources' },
  RESOURCE_CREATE: { key: 'resource.create', category: 'Resource', description: 'Create resources' },
  RESOURCE_EDIT: { key: 'resource.edit', category: 'Resource', description: 'Edit resources' },
  RESOURCE_ASSIGN: { key: 'resource.assign', category: 'Resource', description: 'Assign resources to tasks' },

  // Cost
  COST_VIEW: { key: 'cost.view', category: 'Cost', description: 'View costs' },
  COST_EDIT: { key: 'cost.edit', category: 'Cost', description: 'Edit costs' },
  RATE_VIEW: { key: 'rate.view', category: 'Cost', description: 'View resource rates' },

  // Tracking
  ACTUALS_REPORT_OWN: { key: 'actuals.report_own', category: 'Tracking', description: 'Report actuals on own assignments' },
  ACTUALS_REPORT_ANY: { key: 'actuals.report_any', category: 'Tracking', description: 'Report actuals on any assignment' },
  ACTUALS_APPROVE: { key: 'actuals.approve', category: 'Tracking', description: 'Approve reported actuals' },

  // Agile
  SPRINT_VIEW: { key: 'sprint.view', category: 'Agile', description: 'View sprints' },
  SPRINT_CREATE: { key: 'sprint.create', category: 'Agile', description: 'Create sprints' },
  SPRINT_EDIT: { key: 'sprint.edit', category: 'Agile', description: 'Edit sprints' },
  BOARD_VIEW: { key: 'board.view', category: 'Agile', description: 'View the agile board' },
  BOARD_MANAGE: { key: 'board.manage', category: 'Agile', description: 'Manage board columns' },
  BOARD_MOVE_CARD: { key: 'board.move_card', category: 'Agile', description: 'Move a card on the agile board' },
  BACKLOG_REORDER: { key: 'backlog.reorder', category: 'Agile', description: 'Reorder the backlog' },

  // Report
  REPORT_VIEW: { key: 'report.view', category: 'Report', description: 'View reports' },
  REPORT_CREATE: { key: 'report.create', category: 'Report', description: 'Create reports' },
  REPORT_EXPORT: { key: 'report.export', category: 'Report', description: 'Export reports' },

  // Import/Export
  DATA_IMPORT: { key: 'data.import', category: 'Import/Export', description: 'Import project data' },
  DATA_EXPORT: { key: 'data.export', category: 'Import/Export', description: 'Export project data' },

  // Admin
  ROLE_MANAGE: { key: 'role.manage', category: 'Admin', description: 'Manage roles' },
  USER_MANAGE: { key: 'user.manage', category: 'Admin', description: 'Manage users' },
  CALENDAR_MANAGE: { key: 'calendar.manage', category: 'Admin', description: 'Manage calendars' },
  SETTINGS_MANAGE: { key: 'settings.manage', category: 'Admin', description: 'Manage workspace settings' },
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]['key'];
