/**
 * Two full-fidelity sample projects for UI demos.
 *
 * 1. Aurora Website Launch — hierarchy, Gantt, critical path, milestones, light resources
 * 2. Northwind Plant Retrofit — overallocation, costs, baseline/EV, slipping tasks, reports
 *
 * Idempotent: skips when either project name already exists.
 */
import { and, eq, ilike, inArray, sql } from 'drizzle-orm';

import { db } from './client.js';
import {
  assignments,
  calendarExceptions,
  projects,
  resources,
  taskDependencies,
  tasks,
  users,
} from './schema/index.js';
import { env } from '../env.js';
import { createAssignment, updateAssignment } from '../services/assignmentService.js';
import { createBaseline } from '../services/baselineService.js';
import { createProject, deleteProject, updateProject } from '../services/projectService.js';
import { createResource } from '../services/resourceService.js';
import { rescheduleProject, withSerializableRetry } from '../services/scheduleRunner.js';
import { updateTask } from '../services/taskService.js';
import { wbsCodeFromPath } from '../services/wbs.js';

const DAY = 480; // working minutes (8h × 60)

const AURORA = 'Aurora Website Launch';
const NORTHWIND = 'Northwind Plant Retrofit';

/**
 * assignment_timephased is range-partitioned by month (§3.5). The initial
 * migration only created 2026-07/08 — demo schedules span Jun–Oct, so ensure
 * those partitions exist before createAssignment writes timephased rows.
 */
async function ensureTimephasedPartitions(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
): Promise<void> {
  let y = fromYear;
  let m = fromMonth;
  while (y < toYear || (y === toYear && m <= toMonth)) {
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    const part = `assignment_timephased_${y}_${String(m).padStart(2, '0')}`;
    await db.execute(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS "${part}" PARTITION OF "assignment_timephased" FOR VALUES FROM ('${start}') TO ('${end}')`,
      ),
    );
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

async function wipeDemoProjects(ownerId: string): Promise<void> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.ownerId, ownerId), inArray(projects.name, [AURORA, NORTHWIND])),
    );
  if (rows.length === 0) return;
  for (const row of rows) {
    await deleteProject(row.id, ownerId);
  }
  console.log(`Removed ${rows.length} existing demo project(s) for a clean reseed.`);
}

type TaskSeed = {
  key: string;
  name: string;
  parentKey?: string;
  wbsPath: string;
  sortOrder: number;
  isSummary?: boolean;
  isMilestone?: boolean;
  durationMinutes?: number | null;
  constraintType?: string | null;
  constraintDate?: Date | null;
  deadline?: Date | null;
};

async function ensureResource(
  actorUserId: string,
  projectId: string,
  input: {
    name: string;
    resourceType: 'work' | 'material' | 'cost';
    maxUnits?: number;
    standardRate?: number;
    costPerUse?: number;
    email?: string;
  },
): Promise<string> {
  const [existing] = await db
    .select({ id: resources.id })
    .from(resources)
    .where(ilike(resources.name, input.name))
    .limit(1);
  if (existing) return existing.id;

  const created = await createResource(
    {
      name: input.name,
      resourceType: input.resourceType,
      maxUnits: input.maxUnits,
      standardRate: input.standardRate,
      costPerUse: input.costPerUse,
      email: input.email,
      accrualType: 'prorated',
    },
    actorUserId,
    projectId,
  );
  return created.id;
}

async function insertTaskTree(
  projectId: string,
  defs: readonly TaskSeed[],
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();

  // Parents before children (defs are ordered that way).
  for (const def of defs) {
    const parentId = def.parentKey ? (idByKey.get(def.parentKey) ?? null) : null;
    if (def.parentKey && !parentId) {
      throw new Error(`Missing parent key ${def.parentKey} for task ${def.key}`);
    }

    const [row] = await db
      .insert(tasks)
      .values({
        projectId,
        parentId,
        name: def.name,
        wbsPath: def.wbsPath,
        wbsCode: wbsCodeFromPath(def.wbsPath),
        sortOrder: def.sortOrder,
        isSummary: def.isSummary ?? false,
        isMilestone: def.isMilestone ?? false,
        durationMinutes: def.isSummary ? null : (def.durationMinutes ?? 0),
        taskType: def.isSummary || def.isMilestone ? null : 'fixed_duration',
        constraintType: def.constraintType ?? (def.isSummary ? null : 'asap'),
        constraintDate: def.constraintDate ?? null,
        deadline: def.deadline ?? null,
        isEffortDriven: true,
        isManuallyScheduled: false,
        schedulingMode: 'cpm',
      })
      .returning({ id: tasks.id });

    if (!row) throw new Error(`Failed to insert task ${def.key}`);
    idByKey.set(def.key, row.id);
  }

  return idByKey;
}

async function insertDeps(
  edges: ReadonlyArray<{ pred: string; succ: string; linkType?: string; lagMinutes?: number }>,
  idByKey: Map<string, string>,
): Promise<void> {
  if (edges.length === 0) return;
  await db.insert(taskDependencies).values(
    edges.map((e) => {
      const predecessorId = idByKey.get(e.pred);
      const successorId = idByKey.get(e.succ);
      if (!predecessorId || !successorId) {
        throw new Error(`Unknown dependency endpoints ${e.pred} → ${e.succ}`);
      }
      return {
        predecessorId,
        successorId,
        linkType: e.linkType ?? 'FS',
        lagMinutes: e.lagMinutes ?? 0,
        lagPercent: null,
      };
    }),
  );
}

async function runReschedule(projectId: string): Promise<void> {
  await withSerializableRetry(async (tx) => {
    await rescheduleProject(tx, projectId);
  }, db);

  // Summary duration isn't persisted by the engine writeback (only % complete
  // is). Stamp a calendar-minute span so report overallPercentComplete — which
  // weights root tasks by durationMinutes — has something to weight by.
  await db.execute(sql`
    UPDATE tasks
    SET duration_minutes = GREATEST(
      1,
      (EXTRACT(EPOCH FROM (early_finish - early_start)) / 60)::int
    )
    WHERE project_id = ${projectId}
      AND is_summary = true
      AND early_start IS NOT NULL
      AND early_finish IS NOT NULL
  `);
}

async function patchTask(
  taskId: string,
  actorUserId: string,
  patch: {
    percentComplete?: number;
    durationMinutes?: number;
    deadline?: string | null;
    actualStart?: string | null;
    actualFinish?: string | null;
    actualDurationMinutes?: number | null;
  },
): Promise<void> {
  const [row] = await db
    .select({ version: tasks.version })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) throw new Error(`Task ${taskId} missing for patch`);
  await updateTask(taskId, { version: row.version, ...patch }, actorUserId);
}

/** Mark a leaf complete with actuals (100% + start/finish). */
async function markCompleted(
  taskId: string,
  actorUserId: string,
  actualStart: string,
  actualFinish: string,
  actualDurationMinutes: number,
): Promise<void> {
  await patchTask(taskId, actorUserId, {
    percentComplete: 100,
    actualStart,
    actualFinish,
    actualDurationMinutes,
  });
}

async function seedAurora(actorUserId: string): Promise<string> {
  const project = await createProject(
    {
      name: AURORA,
      description:
        'Full-year marketing website redesign (1 Jul 2026 → ~30 Jun 2027): discovery through hypercare, with early phases completed.',
      status: 'active',
      startDate: '2026-07-01T09:00:00.000Z',
    },
    actorUserId,
  );

  await db.insert(calendarExceptions).values([
    {
      calendarId: project.calendarId,
      exceptionDate: '2026-09-07',
      isWorking: false,
      name: 'Labor Day',
    },
    {
      calendarId: project.calendarId,
      exceptionDate: '2026-11-26',
      isWorking: false,
      name: 'Thanksgiving',
    },
    {
      calendarId: project.calendarId,
      exceptionDate: '2026-12-25',
      isWorking: false,
      name: 'Christmas Day',
    },
    {
      calendarId: project.calendarId,
      exceptionDate: '2027-01-01',
      isWorking: false,
      name: 'New Year’s Day',
    },
    {
      calendarId: project.calendarId,
      exceptionDate: '2027-05-31',
      isWorking: false,
      name: 'Memorial Day',
    },
  ]);

  // ~1-year critical path (working days). Phases: Discovery → Design → Build →
  // Content (parallel) → QA/Launch → Hypercare.
  const idByKey = await insertTaskTree(project.id, [
    { key: 'disc', name: '1 Discovery', wbsPath: '1', sortOrder: 0, isSummary: true },
    {
      key: 'kickoff',
      name: 'Project kickoff',
      parentKey: 'disc',
      wbsPath: '1.1',
      sortOrder: 0,
      isMilestone: true,
      durationMinutes: 0,
    },
    {
      key: 'interviews',
      name: 'Stakeholder interviews',
      parentKey: 'disc',
      wbsPath: '1.2',
      sortOrder: 1,
      durationMinutes: 10 * DAY,
    },
    {
      key: 'research',
      name: 'Competitive & analytics research',
      parentKey: 'disc',
      wbsPath: '1.3',
      sortOrder: 2,
      durationMinutes: 8 * DAY,
    },
    {
      key: 'personas',
      name: 'Personas & journey maps',
      parentKey: 'disc',
      wbsPath: '1.4',
      sortOrder: 3,
      durationMinutes: 8 * DAY,
    },
    {
      key: 'reqs',
      name: 'Requirements & success metrics',
      parentKey: 'disc',
      wbsPath: '1.5',
      sortOrder: 4,
      durationMinutes: 10 * DAY,
    },
    {
      key: 'reqs_signoff',
      name: 'Requirements sign-off',
      parentKey: 'disc',
      wbsPath: '1.6',
      sortOrder: 5,
      isMilestone: true,
      durationMinutes: 0,
    },

    { key: 'design', name: '2 Design', wbsPath: '2', sortOrder: 1, isSummary: true },
    {
      key: 'ia',
      name: 'Information architecture',
      parentKey: 'design',
      wbsPath: '2.1',
      sortOrder: 0,
      durationMinutes: 10 * DAY,
    },
    {
      key: 'wireframes',
      name: 'Wireframes (desktop + mobile)',
      parentKey: 'design',
      wbsPath: '2.2',
      sortOrder: 1,
      durationMinutes: 12 * DAY,
    },
    {
      key: 'design_system',
      name: 'Visual design system',
      parentKey: 'design',
      wbsPath: '2.3',
      sortOrder: 2,
      durationMinutes: 15 * DAY,
      constraintType: 'snet',
      constraintDate: new Date('2026-08-17T09:00:00.000Z'),
    },
    {
      key: 'hifi',
      name: 'High-fidelity page comps',
      parentKey: 'design',
      wbsPath: '2.4',
      sortOrder: 3,
      durationMinutes: 20 * DAY,
    },
    {
      key: 'motion',
      name: 'Motion & interaction prototypes',
      parentKey: 'design',
      wbsPath: '2.5',
      sortOrder: 4,
      durationMinutes: 12 * DAY,
    },
    {
      key: 'design_approval',
      name: 'Design approval',
      parentKey: 'design',
      wbsPath: '2.6',
      sortOrder: 5,
      isMilestone: true,
      durationMinutes: 0,
    },

    { key: 'build', name: '3 Build', wbsPath: '3', sortOrder: 2, isSummary: true },
    {
      key: 'fe_foundation',
      name: 'Frontend foundation (Next.js / design tokens)',
      parentKey: 'build',
      wbsPath: '3.1',
      sortOrder: 0,
      durationMinutes: 18 * DAY,
    },
    {
      key: 'fe_pages',
      name: 'Marketing page templates',
      parentKey: 'build',
      wbsPath: '3.2',
      sortOrder: 1,
      durationMinutes: 28 * DAY,
    },
    {
      key: 'cms',
      name: 'CMS / content model',
      parentKey: 'build',
      wbsPath: '3.3',
      sortOrder: 2,
      durationMinutes: 22 * DAY,
    },
    {
      key: 'be_api',
      name: 'Backend APIs & forms',
      parentKey: 'build',
      wbsPath: '3.4',
      sortOrder: 3,
      durationMinutes: 22 * DAY,
    },
    {
      key: 'integrations',
      name: 'Integrations (CRM, analytics, CDP)',
      parentKey: 'build',
      wbsPath: '3.5',
      sortOrder: 4,
      durationMinutes: 15 * DAY,
    },
    {
      key: 'a11y',
      name: 'Accessibility remediation',
      parentKey: 'build',
      wbsPath: '3.6',
      sortOrder: 5,
      durationMinutes: 12 * DAY,
    },
    {
      key: 'i18n',
      name: 'Localization (EN + ES)',
      parentKey: 'build',
      wbsPath: '3.7',
      sortOrder: 6,
      durationMinutes: 15 * DAY,
    },

    { key: 'content', name: '4 Content & SEO', wbsPath: '4', sortOrder: 3, isSummary: true },
    {
      key: 'inventory',
      name: 'Content inventory & gap analysis',
      parentKey: 'content',
      wbsPath: '4.1',
      sortOrder: 0,
      durationMinutes: 8 * DAY,
    },
    {
      key: 'copy',
      name: 'Copywriting & messaging',
      parentKey: 'content',
      wbsPath: '4.2',
      sortOrder: 1,
      durationMinutes: 25 * DAY,
    },
    {
      key: 'seo',
      name: 'SEO, redirects & schema markup',
      parentKey: 'content',
      wbsPath: '4.3',
      sortOrder: 2,
      durationMinutes: 15 * DAY,
    },
    {
      key: 'media',
      name: 'Photo / video production',
      parentKey: 'content',
      wbsPath: '4.4',
      sortOrder: 3,
      durationMinutes: 18 * DAY,
    },

    { key: 'launch', name: '5 QA & Launch', wbsPath: '5', sortOrder: 4, isSummary: true },
    {
      key: 'qa',
      name: 'Internal QA & regression',
      parentKey: 'launch',
      wbsPath: '5.1',
      sortOrder: 0,
      durationMinutes: 15 * DAY,
    },
    {
      key: 'perf',
      name: 'Performance & security review',
      parentKey: 'launch',
      wbsPath: '5.2',
      sortOrder: 1,
      durationMinutes: 10 * DAY,
    },
    {
      key: 'uat',
      name: 'UAT with stakeholders',
      parentKey: 'launch',
      wbsPath: '5.3',
      sortOrder: 2,
      durationMinutes: 15 * DAY,
    },
    {
      key: 'training',
      name: 'CMS training for marketing',
      parentKey: 'launch',
      wbsPath: '5.4',
      sortOrder: 3,
      durationMinutes: 5 * DAY,
    },
    {
      key: 'cutover',
      name: 'Cutover rehearsal & DNS/SSL',
      parentKey: 'launch',
      wbsPath: '5.5',
      sortOrder: 4,
      durationMinutes: 12 * DAY,
    },
    {
      key: 'soft_launch',
      name: 'Soft launch (staging → prod canary)',
      parentKey: 'launch',
      wbsPath: '5.6',
      sortOrder: 5,
      isMilestone: true,
      durationMinutes: 0,
    },
    {
      key: 'golive',
      name: 'Public go-live',
      parentKey: 'launch',
      wbsPath: '5.7',
      sortOrder: 6,
      isMilestone: true,
      durationMinutes: 0,
      deadline: new Date('2027-06-30T17:00:00.000Z'),
    },
    {
      key: 'hypercare',
      name: 'Hypercare & optimization',
      parentKey: 'launch',
      wbsPath: '5.8',
      sortOrder: 7,
      durationMinutes: 25 * DAY,
    },
  ]);

  await insertDeps(
    [
      // Discovery chain
      { pred: 'kickoff', succ: 'interviews' },
      { pred: 'kickoff', succ: 'research' },
      { pred: 'interviews', succ: 'personas' },
      { pred: 'research', succ: 'personas' },
      { pred: 'personas', succ: 'reqs' },
      { pred: 'reqs', succ: 'reqs_signoff' },
      // Design
      { pred: 'reqs_signoff', succ: 'ia' },
      { pred: 'ia', succ: 'wireframes' },
      { pred: 'wireframes', succ: 'design_system' },
      { pred: 'design_system', succ: 'hifi' },
      { pred: 'hifi', succ: 'motion' },
      { pred: 'motion', succ: 'design_approval' },
      // Build (FE after design; CMS/BE start with SS lag from design_system)
      { pred: 'design_approval', succ: 'fe_foundation' },
      { pred: 'fe_foundation', succ: 'fe_pages' },
      { pred: 'design_system', succ: 'cms', linkType: 'SS', lagMinutes: 5 * DAY },
      { pred: 'design_system', succ: 'be_api', linkType: 'SS', lagMinutes: 5 * DAY },
      { pred: 'fe_pages', succ: 'integrations' },
      { pred: 'cms', succ: 'integrations' },
      { pred: 'be_api', succ: 'integrations' },
      { pred: 'integrations', succ: 'a11y' },
      { pred: 'fe_pages', succ: 'i18n' },
      { pred: 'cms', succ: 'i18n' },
      // Content parallel after requirements
      { pred: 'reqs_signoff', succ: 'inventory' },
      { pred: 'inventory', succ: 'copy' },
      { pred: 'ia', succ: 'seo' },
      { pred: 'copy', succ: 'media' },
      // QA waits for build + content
      { pred: 'a11y', succ: 'qa' },
      { pred: 'i18n', succ: 'qa' },
      { pred: 'media', succ: 'qa' },
      { pred: 'seo', succ: 'qa' },
      { pred: 'qa', succ: 'perf' },
      { pred: 'perf', succ: 'uat' },
      { pred: 'cms', succ: 'training' },
      { pred: 'uat', succ: 'cutover' },
      { pred: 'training', succ: 'cutover' },
      { pred: 'cutover', succ: 'soft_launch' },
      { pred: 'soft_launch', succ: 'golive' },
      { pred: 'golive', succ: 'hypercare' },
    ],
    idByKey,
  );

  await runReschedule(project.id);

  const jordan = await ensureResource(actorUserId, project.id, {
    name: 'Jordan Lee',
    resourceType: 'work',
    maxUnits: 1,
    standardRate: 95,
    email: 'jordan.lee@example.com',
  });
  const priya = await ensureResource(actorUserId, project.id, {
    name: 'Priya Nair',
    resourceType: 'work',
    maxUnits: 1,
    standardRate: 110,
    email: 'priya.nair@example.com',
  });
  const morgan = await ensureResource(actorUserId, project.id, {
    name: 'Morgan Blake',
    resourceType: 'work',
    maxUnits: 1,
    standardRate: 85,
    email: 'morgan.blake@example.com',
  });
  const cloud = await ensureResource(actorUserId, project.id, {
    name: 'Cloud hosting (setup)',
    resourceType: 'cost',
    costPerUse: 2500,
  });

  // Staffing across the year
  await createAssignment({ taskId: idByKey.get('interviews')!, resourceId: jordan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('research')!, resourceId: morgan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('personas')!, resourceId: priya, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('reqs')!, resourceId: jordan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('ia')!, resourceId: priya, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('wireframes')!, resourceId: priya, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('design_system')!, resourceId: priya, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('hifi')!, resourceId: priya, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('motion')!, resourceId: priya, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('fe_foundation')!, resourceId: jordan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('fe_pages')!, resourceId: jordan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('cms')!, resourceId: morgan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('be_api')!, resourceId: morgan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('integrations')!, resourceId: jordan, units: 0.75 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('a11y')!, resourceId: priya, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('i18n')!, resourceId: morgan, units: 0.75 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('inventory')!, resourceId: morgan, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('copy')!, resourceId: morgan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('seo')!, resourceId: jordan, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('media')!, resourceId: priya, units: 0.25 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('qa')!, resourceId: jordan, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('perf')!, resourceId: morgan, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('uat')!, resourceId: priya, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('training')!, resourceId: morgan, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('cutover')!, resourceId: jordan, units: 0.75 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('golive')!, resourceId: cloud }, actorUserId);
  await createAssignment({ taskId: idByKey.get('hypercare')!, resourceId: jordan, units: 0.5 }, actorUserId);

  // Early discovery + design work completed; build starting.
  await patchTask(idByKey.get('kickoff')!, actorUserId, {
    percentComplete: 100,
    actualStart: '2026-07-01T09:00:00.000Z',
    actualFinish: '2026-07-01T09:00:00.000Z',
    actualDurationMinutes: 0,
  });
  await markCompleted(idByKey.get('interviews')!, actorUserId, '2026-07-01T09:00:00.000Z', '2026-07-14T17:00:00.000Z', 10 * DAY);
  await markCompleted(idByKey.get('research')!, actorUserId, '2026-07-01T09:00:00.000Z', '2026-07-10T17:00:00.000Z', 8 * DAY);
  await markCompleted(idByKey.get('personas')!, actorUserId, '2026-07-15T09:00:00.000Z', '2026-07-24T17:00:00.000Z', 8 * DAY);
  await markCompleted(idByKey.get('reqs')!, actorUserId, '2026-07-27T09:00:00.000Z', '2026-08-07T17:00:00.000Z', 10 * DAY);
  await patchTask(idByKey.get('reqs_signoff')!, actorUserId, {
    percentComplete: 100,
    actualStart: '2026-08-07T17:00:00.000Z',
    actualFinish: '2026-08-07T17:00:00.000Z',
    actualDurationMinutes: 0,
  });
  await markCompleted(idByKey.get('ia')!, actorUserId, '2026-08-10T09:00:00.000Z', '2026-08-21T17:00:00.000Z', 10 * DAY);
  await markCompleted(idByKey.get('wireframes')!, actorUserId, '2026-08-24T09:00:00.000Z', '2026-09-09T17:00:00.000Z', 12 * DAY);
  await markCompleted(idByKey.get('design_system')!, actorUserId, '2026-09-10T09:00:00.000Z', '2026-09-30T17:00:00.000Z', 15 * DAY);
  await markCompleted(idByKey.get('inventory')!, actorUserId, '2026-08-10T09:00:00.000Z', '2026-08-19T17:00:00.000Z', 8 * DAY);

  // In progress
  await patchTask(idByKey.get('hifi')!, actorUserId, { percentComplete: 70 });
  await patchTask(idByKey.get('motion')!, actorUserId, { percentComplete: 25 });
  await patchTask(idByKey.get('copy')!, actorUserId, { percentComplete: 40 });
  await patchTask(idByKey.get('fe_foundation')!, actorUserId, { percentComplete: 15 });

  await createBaseline(project.id, 'Kickoff plan', actorUserId);

  const [fresh] = await db
    .select({ version: projects.version })
    .from(projects)
    .where(eq(projects.id, project.id))
    .limit(1);
  await updateProject(
    project.id,
    {
      version: fresh!.version,
      statusDate: '2026-10-15T17:00:00.000Z',
    },
    actorUserId,
  );

  return project.id;
}

async function seedNorthwind(actorUserId: string): Promise<string> {
  const project = await createProject(
    {
      name: NORTHWIND,
      description:
        'Factory upgrade — overallocation, costs, baseline variance, earned value, and slipping work.',
      status: 'active',
      startDate: '2026-06-01T09:00:00.000Z',
    },
    actorUserId,
  );

  const idByKey = await insertTaskTree(project.id, [
    { key: 'prep', name: '1 Prep', wbsPath: '1', sortOrder: 0, isSummary: true },
    {
      key: 'survey',
      name: 'Site survey',
      parentKey: 'prep',
      wbsPath: '1.1',
      sortOrder: 0,
      durationMinutes: 5 * DAY,
    },
    {
      key: 'permits',
      name: 'Permits & engineering',
      parentKey: 'prep',
      wbsPath: '1.2',
      sortOrder: 1,
      durationMinutes: 8 * DAY,
    },
    { key: 'const', name: '2 Construction', wbsPath: '2', sortOrder: 1, isSummary: true },
    {
      key: 'elec',
      name: 'Electrical retrofit',
      parentKey: 'const',
      wbsPath: '2.1',
      sortOrder: 0,
      durationMinutes: 12 * DAY,
    },
    {
      key: 'mech',
      name: 'Mechanical retrofit',
      parentKey: 'const',
      wbsPath: '2.2',
      sortOrder: 1,
      durationMinutes: 12 * DAY,
    },
    {
      key: 'civil',
      name: 'Civil / pads',
      parentKey: 'const',
      wbsPath: '2.3',
      sortOrder: 2,
      durationMinutes: 6 * DAY,
    },
    {
      key: 'comm',
      name: 'Commissioning',
      parentKey: 'const',
      wbsPath: '2.4',
      sortOrder: 3,
      durationMinutes: 5 * DAY,
    },
    { key: 'close', name: '3 Closeout', wbsPath: '3', sortOrder: 2, isSummary: true },
    {
      key: 'train',
      name: 'Operator training',
      parentKey: 'close',
      wbsPath: '3.1',
      sortOrder: 0,
      durationMinutes: 3 * DAY,
    },
    {
      key: 'handover',
      name: 'Handover',
      parentKey: 'close',
      wbsPath: '3.2',
      sortOrder: 1,
      isMilestone: true,
      durationMinutes: 0,
      // Tight deadline — after we stretch electrical, handover finishes late.
      deadline: new Date('2026-07-10T17:00:00.000Z'),
    },
  ]);

  await insertDeps(
    [
      { pred: 'survey', succ: 'permits' },
      { pred: 'permits', succ: 'elec' },
      { pred: 'permits', succ: 'mech' },
      { pred: 'permits', succ: 'civil' },
      { pred: 'elec', succ: 'comm' },
      { pred: 'mech', succ: 'comm' },
      { pred: 'civil', succ: 'comm' },
      { pred: 'comm', succ: 'train' },
      { pred: 'train', succ: 'handover' },
    ],
    idByKey,
  );

  await runReschedule(project.id);

  const alex = await ensureResource(actorUserId, project.id, {
    name: 'Alex Rivera',
    resourceType: 'work',
    maxUnits: 1,
    standardRate: 120,
    email: 'alex.rivera@example.com',
  });
  const sam = await ensureResource(actorUserId, project.id, {
    name: 'Sam Chen',
    resourceType: 'work',
    maxUnits: 1,
    standardRate: 100,
    email: 'sam.chen@example.com',
  });
  const crane = await ensureResource(actorUserId, project.id, {
    name: 'Mobile crane rental',
    resourceType: 'cost',
    costPerUse: 4500,
  });

  // Sam at 100% on two overlapping long tasks → overallocation days.
  await createAssignment({ taskId: idByKey.get('elec')!, resourceId: sam, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('mech')!, resourceId: sam, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('civil')!, resourceId: alex, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('survey')!, resourceId: alex, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('permits')!, resourceId: alex, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('comm')!, resourceId: alex, units: 1 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('train')!, resourceId: sam, units: 0.5 }, actorUserId);
  await createAssignment({ taskId: idByKey.get('civil')!, resourceId: crane }, actorUserId);

  // Progress + actuals for EV / cost reports.
  await patchTask(idByKey.get('survey')!, actorUserId, { percentComplete: 100 });
  await patchTask(idByKey.get('permits')!, actorUserId, { percentComplete: 100 });
  await patchTask(idByKey.get('elec')!, actorUserId, { percentComplete: 55 });
  await patchTask(idByKey.get('mech')!, actorUserId, { percentComplete: 40 });
  await patchTask(idByKey.get('civil')!, actorUserId, { percentComplete: 70 });

  // Stamp actual costs on a few assignments (leaf AC for EV).
  async function setActual(
    taskKey: string,
    resourceId: string,
    actualCost: number,
    actualWorkMinutes?: number,
  ): Promise<void> {
    const [row] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.taskId, idByKey.get(taskKey)!), eq(assignments.resourceId, resourceId)))
      .limit(1);
    if (!row) return;
    await updateAssignment(
      row.id,
      {
        actualCost,
        ...(actualWorkMinutes !== undefined ? { actualWorkMinutes } : {}),
      },
      actorUserId,
    );
  }

  await setActual('elec', sam, 18000, 40 * DAY);
  await setActual('mech', sam, 14000, 30 * DAY);
  await setActual('survey', alex, 4800);

  let [fresh] = await db
    .select({ version: projects.version })
    .from(projects)
    .where(eq(projects.id, project.id))
    .limit(1);
  await updateProject(
    project.id,
    { version: fresh!.version, statusDate: '2026-07-15T17:00:00.000Z' },
    actorUserId,
  );

  // Baseline the current (pre-slip) plan for EV + variance.
  await createBaseline(project.id, 'Award baseline', actorUserId);

  // Slip: stretch electrical so finish moves past handover deadline / baseline.
  await patchTask(idByKey.get('elec')!, actorUserId, { durationMinutes: 18 * DAY });

  [fresh] = await db
    .select({ version: projects.version })
    .from(projects)
    .where(eq(projects.id, project.id))
    .limit(1);
  await updateProject(
    project.id,
    { version: fresh!.version, statusDate: '2026-07-20T17:00:00.000Z' },
    actorUserId,
  );

  return project.id;
}

export async function seedDemoProjects(): Promise<void> {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, env.SEED_ADMIN_EMAIL))
    .limit(1);

  if (!admin) {
    throw new Error(
      `Admin user ${env.SEED_ADMIN_EMAIL} not found — seed permissions/roles/admin first`,
    );
  }

  // Aurora runs Jul 2026 → Jun 2027; Northwind needs mid-2026 months too.
  await ensureTimephasedPartitions(2026, 6, 2027, 7);
  await wipeDemoProjects(admin.id);

  console.log(`Seeding demo project: ${AURORA}`);
  await seedAurora(admin.id);
  console.log(`Seeding demo project: ${NORTHWIND}`);
  await seedNorthwind(admin.id);
  console.log('Demo projects ready.');
}
