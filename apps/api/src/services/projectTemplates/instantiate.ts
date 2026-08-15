import { SYSTEM_ROLES } from '@pkg/rbac';
import { DEFAULT_PROJECT_SETTINGS, PROJECT_TEMPLATES, type ProjectCreateFromTemplateInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { db } from '../../db/client.js';
import { calendars, projectMembers, projects, roles, taskDependencies, tasks } from '../../db/schema/index.js';
import { BadRequestError } from '../../middleware/errors.js';
import { rescheduleProject, withSerializableRetry, writeAuditLog } from '../scheduleRunner.js';
import { wbsCodeFromPath } from '../wbs.js';
import { getTemplateDefinition, resolveTemplateKey } from './catalog.js';
import { compileDefinition } from './flatten.js';

const DEFAULT_CALENDAR = {
  name: 'Standard Mon–Fri',
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: '8',
  defaultStart: '09:00',
  defaultFinish: '17:00',
} as const;

const TEMPLATE_SETTINGS = {
  ...DEFAULT_PROJECT_SETTINGS,
  dateFormat: 'dd/mm/yyyy' as const,
};

export interface CreateFromTemplateResult {
  readonly project: typeof projects.$inferSelect;
  readonly taskCount: number;
  readonly dependencyCount: number;
}

export async function createProjectFromTemplate(
  input: ProjectCreateFromTemplateInput,
  userId: string,
): Promise<CreateFromTemplateResult> {
  let templateKey;
  try {
    templateKey = resolveTemplateKey(input.templateKey);
  } catch {
    throw new BadRequestError('Unknown project template');
  }

  const meta = PROJECT_TEMPLATES.find((t) => t.key === templateKey);
  if (!meta) throw new BadRequestError('Unknown project template');

  const { tasks: flatTasks, links } = compileDefinition(getTemplateDefinition(templateKey));

  return withSerializableRetry(async (tx) => {
    const [cal] = await tx
      .insert(calendars)
      .values({
        name: DEFAULT_CALENDAR.name,
        projectId: null,
        workingDays: [...DEFAULT_CALENDAR.workingDays],
        hoursPerDay: DEFAULT_CALENDAR.hoursPerDay,
        defaultStart: DEFAULT_CALENDAR.defaultStart,
        defaultFinish: DEFAULT_CALENDAR.defaultFinish,
      })
      .returning();
    if (!cal) throw new Error('Calendar insert returned no row');

    const [created] = await tx
      .insert(projects)
      .values({
        name: input.name,
        description: input.description?.trim() || meta.description,
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : null,
        calendarId: cal.id,
        ownerId: userId,
        isArchived: false,
        category: meta.categoryKey,
        templateKey: meta.key,
        settings: TEMPLATE_SETTINGS,
      })
      .returning();
    if (!created) throw new Error('Project insert returned no row');

    await tx.update(calendars).set({ projectId: created.id }).where(eq(calendars.id, cal.id));

    const [adminRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, SYSTEM_ROLES.ADMIN.name))
      .limit(1);
    if (!adminRole) {
      throw new Error(`System role '${SYSTEM_ROLES.ADMIN.name}' is not seeded`);
    }
    await tx.insert(projectMembers).values({
      userId,
      projectId: created.id,
      roleId: adminRole.id,
    });

    const idByKey = new Map<string, string>();
    for (const t of flatTasks) {
      const [row] = await tx
        .insert(tasks)
        .values({
          projectId: created.id,
          parentId: t.parentKey ? (idByKey.get(t.parentKey) ?? null) : null,
          name: t.name,
          wbsPath: t.wbsPath,
          wbsCode: wbsCodeFromPath(t.wbsPath),
          sortOrder: t.sortOrder,
          isSummary: t.isSummary,
          isMilestone: t.isMilestone,
          durationMinutes: t.isSummary ? null : (t.durationMinutes ?? 0),
          taskType: t.isSummary || t.isMilestone ? null : 'fixed_duration',
          constraintType: t.isSummary ? null : 'asap',
          isEffortDriven: true,
          isManuallyScheduled: false,
          schedulingMode: 'cpm',
        })
        .returning({ id: tasks.id });
      if (!row) throw new Error(`Failed to insert template task ${t.key}`);
      idByKey.set(t.key, row.id);
    }

    if (links.length > 0) {
      await tx.insert(taskDependencies).values(
        links.map((l) => {
          const predecessorId = idByKey.get(l.pred);
          const successorId = idByKey.get(l.succ);
          if (!predecessorId || !successorId) {
            throw new Error(`Unknown dependency endpoints ${l.pred} → ${l.succ}`);
          }
          return {
            predecessorId,
            successorId,
            linkType: l.linkType ?? 'FS',
            lagMinutes: 0,
            lagPercent: null,
          };
        }),
      );
    }

    await rescheduleProject(tx, created.id);

    const [fresh] = await tx.select().from(projects).where(eq(projects.id, created.id)).limit(1);

    await writeAuditLog(tx, {
      userId,
      projectId: created.id,
      action: 'project.create_from_template',
      entityType: 'project',
      entityId: created.id,
      after: {
        templateKey: meta.key,
        category: meta.categoryKey,
        taskCount: flatTasks.length,
        dependencyCount: links.length,
      },
    });

    return {
      project: fresh ?? created,
      taskCount: flatTasks.length,
      dependencyCount: links.length,
    };
  }, db);
}
