import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity.js';
import { projects } from './projects.js';

/**
 * Project-scoped custom report definitions (columns / filters / sort).
 * `definition` is validated by SavedReportDefinitionSchema at the API boundary.
 */
export const savedReports = pgTable(
  'saved_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    definition: jsonb('definition').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('saved_reports_project_id_idx').on(t.projectId)],
);
