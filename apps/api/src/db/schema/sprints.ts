import { index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects.js';

/**
 * Sprint container for agile planning (PROJECT_SCOPE.md §5.10).
 * `state` is plain text with app-level enum validation (planned|active|closed),
 * matching constraint_type / task_type — no DB enum/CHECK.
 */
export const sprints = pgTable(
  'sprints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    goal: text('goal'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    /** Story-point capacity (nullable = unbounded). */
    capacity: numeric('capacity'),
    /** 'planned' | 'active' | 'closed' — Zod-validated only. */
    state: text('state').notNull().default('planned'),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('sprints_project_id_idx').on(t.projectId)],
);
