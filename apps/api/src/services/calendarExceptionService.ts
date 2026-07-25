import type { CalendarExceptionCreateInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { calendarExceptions, calendars } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import {
  rescheduleProject,
  withSerializableRetry,
  writeAuditLog,
  type MutationResult,
} from './scheduleRunner.js';

function rejectGlobalTemplate(projectId: string | null): asserts projectId is string {
  if (projectId === null) {
    throw new BadRequestError('Cannot manage exceptions on a global template calendar');
  }
}

export async function listExceptions(calendarId: string): Promise<Array<typeof calendarExceptions.$inferSelect>> {
  const [calendar] = await db.select().from(calendars).where(eq(calendars.id, calendarId)).limit(1);
  if (!calendar) throw new NotFoundError('Calendar not found');
  rejectGlobalTemplate(calendar.projectId);

  return db.select().from(calendarExceptions).where(eq(calendarExceptions.calendarId, calendarId));
}

export async function createException(
  calendarId: string,
  input: CalendarExceptionCreateInput,
  userId: string,
): Promise<MutationResult & { exception: typeof calendarExceptions.$inferSelect }> {
  return withSerializableRetry(async (tx) => {
    const [calendar] = await tx.select().from(calendars).where(eq(calendars.id, calendarId)).limit(1);
    if (!calendar) throw new NotFoundError('Calendar not found');
    rejectGlobalTemplate(calendar.projectId);

    const [created] = await tx
      .insert(calendarExceptions)
      .values({
        calendarId,
        exceptionDate: input.exceptionDate,
        isWorking: input.isWorking,
        startTime: input.startTime ?? null,
        finishTime: input.finishTime ?? null,
        name: input.name ?? null,
        recurrence: input.recurrence ?? null,
      })
      .returning();

    if (!created) throw new Error('Insert returned no row');

    const result = await rescheduleProject(tx, calendar.projectId);

    await writeAuditLog(tx, {
      userId,
      projectId: calendar.projectId,
      action: 'calendar_exception.create',
      entityType: 'calendar_exception',
      entityId: created.id,
      after: created,
    });

    return { ...result, exception: created };
  }, db);
}

export async function deleteException(exceptionId: string, userId: string): Promise<MutationResult> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx
      .select()
      .from(calendarExceptions)
      .where(eq(calendarExceptions.id, exceptionId))
      .limit(1);
    if (!existing) throw new NotFoundError('Calendar exception not found');

    const [calendar] = await tx
      .select()
      .from(calendars)
      .where(eq(calendars.id, existing.calendarId))
      .limit(1);
    if (!calendar) throw new NotFoundError('Calendar not found');
    rejectGlobalTemplate(calendar.projectId);

    await tx.delete(calendarExceptions).where(eq(calendarExceptions.id, exceptionId));

    const result = await rescheduleProject(tx, calendar.projectId);

    await writeAuditLog(tx, {
      userId,
      projectId: calendar.projectId,
      action: 'calendar_exception.delete',
      entityType: 'calendar_exception',
      entityId: exceptionId,
      before: existing,
    });

    return result;
  }, db);
}
