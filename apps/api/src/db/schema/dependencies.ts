import { check, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { tasks } from './tasks.js';

/**
 * Cycle prevention is application-level (§4.3) — a database constraint can't
 * express "no cycles in this graph."
 */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    predecessorId: uuid('predecessor_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    successorId: uuid('successor_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    linkType: text('link_type').notNull(), // 'FS' | 'SS' | 'FF' | 'SF'
    lagMinutes: integer('lag_minutes').notNull().default(0),
    lagPercent: numeric('lag_percent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('task_dependencies_predecessor_id_successor_id_key').on(t.predecessorId, t.successorId),
    check('task_dependencies_no_self_link', sql`${t.predecessorId} <> ${t.successorId}`),
    // Forward pass traversal
    index('task_dependencies_successor_id_idx').on(t.successorId),
    // Backward pass traversal
    index('task_dependencies_predecessor_id_idx').on(t.predecessorId),
  ],
);
