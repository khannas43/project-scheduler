import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects.js';

/**
 * Kanban columns for the agile board (PROJECT_SCOPE.md §5.10).
 * `wip_limit` null = unbounded. Column order is a plain integer
 * (admin-level, rare) — not fractional-indexing.
 */
export const boardColumns = pgTable(
  'board_columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    /** Null = unbounded WIP. */
    wipLimit: integer('wip_limit'),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('board_columns_project_id_idx').on(t.projectId)],
);
