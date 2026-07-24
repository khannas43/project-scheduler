import { index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity.js';
import { projects } from './projects.js';
import { tasks } from './tasks.js';

export const baselines = pgTable(
  'baselines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    baselineNumber: smallint('baseline_number').notNull(), // 0..10
    name: text('name'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    capturedBy: uuid('captured_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique('baselines_project_id_baseline_number_key').on(t.projectId, t.baselineNumber)],
);

/** A point-in-time snapshot of a task's plan — captured once, never edited. */
export const baselineTasks = pgTable('baseline_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  baselineId: uuid('baseline_id')
    .notNull()
    .references(() => baselines.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  start: timestamp('start', { withTimezone: true }),
  finish: timestamp('finish', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  workMinutes: integer('work_minutes'),
  cost: numeric('cost'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Append-only — events are never modified, so there's no updated_at. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    projectId: uuid('project_id').references(() => projects.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_project_id_created_at_idx').on(t.projectId, t.createdAt.desc())],
);
