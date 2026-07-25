import { boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { users } from './identity.js';

/**
 * `project_id = null` means a global template calendar, reusable across projects.
 * Mutually referenced with `projects` (a project points at its default calendar) —
 * safe because this column is nullable, so global templates can be seeded first.
 */
export const calendars = pgTable('calendars', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  projectId: uuid('project_id').references((): AnyPgColumn => projects.id, { onDelete: 'cascade' }),
  workingDays: smallint('working_days').array().notNull(),
  hoursPerDay: numeric('hours_per_day').notNull(),
  defaultStart: time('default_start').notNull(),
  defaultFinish: time('default_finish').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  // Computed — engine-written, like the CPM output columns on tasks (§3.3).
  finishDate: timestamp('finish_date', { withTimezone: true }),
  /** Status date for progress reporting / progress line (§5.8 / Phase 4). */
  statusDate: timestamp('status_date', { withTimezone: true }),
  calendarId: uuid('calendar_id')
    .notNull()
    .references(() => calendars.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  isArchived: boolean('is_archived').notNull().default(false),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const calendarExceptions = pgTable(
  'calendar_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    exceptionDate: date('exception_date').notNull(),
    isWorking: boolean('is_working').notNull(),
    startTime: time('start_time'),
    finishTime: time('finish_time'),
    name: text('name'),
    // e.g. { type: 'annual' } for fixed holidays that recur every year.
    recurrence: jsonb('recurrence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('calendar_exceptions_calendar_id_exception_date_idx').on(t.calendarId, t.exceptionDate)],
);
