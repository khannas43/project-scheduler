import { date, index, integer, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity.js';
import { calendars } from './projects.js';
import { tasks } from './tasks.js';

/** Instance-wide pool, shared across projects — not scoped to a single project. */
export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  resourceType: text('resource_type').notNull(), // 'work' | 'material' | 'cost'
  email: text('email'),
  maxUnits: numeric('max_units'), // 1.0 = 100%
  standardRate: numeric('standard_rate'),
  overtimeRate: numeric('overtime_rate'),
  costPerUse: numeric('cost_per_use'),
  accrualType: text('accrual_type'), // 'start' | 'prorated' | 'end'
  calendarId: uuid('calendar_id').references(() => calendars.id),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  skills: text('skills').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    units: numeric('units'), // 0.5 = 50%
    workMinutes: integer('work_minutes'),
    actualWorkMinutes: integer('actual_work_minutes'),
    cost: numeric('cost'),
    actualCost: numeric('actual_cost'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique('assignments_task_id_resource_id_key').on(t.taskId, t.resourceId)],
);

/**
 * PARTITION BY RANGE (period_date), monthly (§3.5). Drizzle's schema DSL has
 * no partitioning primitive, so this table definition is for typing and query
 * building only — the actual `PARTITION BY` clause and the first partition
 * are hand-added to the generated migration (see the note in the migrations
 * folder). Postgres requires the partition key in every unique/primary key,
 * hence the composite primary key here instead of a plain `id` PK.
 */
export const assignmentTimephased = pgTable(
  'assignment_timephased',
  {
    id: uuid('id').defaultRandom().notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    periodDate: date('period_date').notNull(),
    plannedWorkMinutes: integer('planned_work_minutes'),
    actualWorkMinutes: integer('actual_work_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.periodDate] }),
    index('assignment_timephased_assignment_id_period_date_idx').on(t.assignmentId, t.periodDate),
  ],
);
