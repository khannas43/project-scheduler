import { boolean, customType, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { calendars, projects } from './projects.js';
import { sprints } from './sprints.js';

/**
 * Postgres `ltree` — WBS path as a materialised label path ('1.3.2'), GIST
 * indexed for O(log n) subtree/ancestor queries (§3.7). Requires
 * `CREATE EXTENSION IF NOT EXISTS ltree` (see the first migration).
 */
const ltree = customType<{ data: string }>({
  dataType() {
    return 'ltree';
  },
});

/**
 * The central table (§3.3). Computed columns (the eight CPM outputs) are
 * written by @pkg/scheduler, never by the client — the API strips them from
 * any inbound payload at the Zod layer, by omission rather than validation.
 *
 * NOT NULL follows the source doc's own convention: an FK column is nullable
 * only where §3.3 explicitly marks it "nullable" (parent_id, calendar_id,
 * sprint_id, board_column_id); every other FK is required. Boolean flags are
 * NOT NULL with an explicit default — a tri-state flag isn't meaningful here.
 * Everything else (dates, computed fields, tracking fields) stays nullable,
 * since those are genuinely absent until the engine runs or the task starts.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),

    // Hierarchy
    wbsPath: ltree('wbs_path'),
    wbsCode: text('wbs_code'),
    sortOrder: integer('sort_order'),

    // Identity
    name: text('name').notNull(),
    notes: text('notes'),
    isMilestone: boolean('is_milestone').notNull().default(false),
    isSummary: boolean('is_summary').notNull().default(false),

    // Planning mode (Phase 6; column exists from Phase 0) — 'cpm' | 'agile'
    schedulingMode: text('scheduling_mode').notNull().default('cpm'),

    // CPM inputs
    durationMinutes: integer('duration_minutes'),
    taskType: text('task_type'), // 'fixed_duration' | 'fixed_units' | 'fixed_work'
    isEffortDriven: boolean('is_effort_driven').notNull().default(true),
    isManuallyScheduled: boolean('is_manually_scheduled').notNull().default(false),
    constraintType: text('constraint_type'), // 'asap'|'alap'|'snet'|'snlt'|'fnet'|'fnlt'|'mso'|'mfo'
    constraintDate: timestamp('constraint_date', { withTimezone: true }),
    deadline: timestamp('deadline', { withTimezone: true }),
    calendarId: uuid('calendar_id').references(() => calendars.id),

    // CPM outputs (ENGINE-WRITTEN — never accept from client)
    earlyStart: timestamp('early_start', { withTimezone: true }),
    earlyFinish: timestamp('early_finish', { withTimezone: true }),
    lateStart: timestamp('late_start', { withTimezone: true }),
    lateFinish: timestamp('late_finish', { withTimezone: true }),
    totalFloatMinutes: integer('total_float_minutes'),
    freeFloatMinutes: integer('free_float_minutes'),
    isCritical: boolean('is_critical').notNull().default(false),
    /**
     * When set, forces `is_critical` on schedule writeback (true/false).
     * `null` means follow the CPM calculation.
     */
    criticalOverride: boolean('critical_override'),

    // Tracking
    percentComplete: numeric('percent_complete', { precision: 5, scale: 2 }),
    actualStart: timestamp('actual_start', { withTimezone: true }),
    actualFinish: timestamp('actual_finish', { withTimezone: true }),
    actualDurationMinutes: integer('actual_duration_minutes'),
    remainingDurationMinutes: integer('remaining_duration_minutes'),

    // Agile (Phase 6) — sprint_id FK lands with the sprints table; board_column_id
    // stays a bare uuid until Round 2 adds board_columns.
    storyPoints: numeric('story_points'),
    sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
    boardColumnId: uuid('board_column_id'),
    backlogRank: text('backlog_rank'), // fractional-indexing rank for O(1) reordering

    version: integer('version').notNull().default(0), // optimistic lock (§9.1)

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('tasks_project_id_parent_id_idx').on(t.projectId, t.parentId),
    index('tasks_wbs_path_gist_idx').using('gist', t.wbsPath),
    index('tasks_project_id_critical_idx')
      .on(t.projectId)
      .where(sql`${t.isCritical} = true`),
  ],
);
