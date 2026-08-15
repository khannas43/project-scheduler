import { and, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { db } from '../db/client.js';
import { auditLog, projects, users } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';

export interface AuditLogListQuery {
  readonly action?: string;
  readonly entityType?: string;
  readonly userId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AuditLogListItem {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly userFullName: string;
  readonly createdAt: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface AuditLogListResult {
  readonly items: readonly AuditLogListItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function assertProjectExists(projectId: string): Promise<void> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) throw new NotFoundError('Project not found');
}

/**
 * List append-only audit events for a project (newest first).
 * Rows with project_id nulled after project delete are not included.
 */
export async function listProjectAuditLog(
  projectId: string,
  query: AuditLogListQuery = {},
): Promise<AuditLogListResult> {
  await assertProjectExists(projectId);

  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(query.offset ?? 0, 0);
  if (query.from && query.to && query.from.getTime() > query.to.getTime()) {
    throw new BadRequestError('from must be before or equal to to');
  }

  const filters: SQL[] = [eq(auditLog.projectId, projectId)];
  if (query.action) {
    // Prefix match so `task` matches `task.create` / `task.update`
    filters.push(sql`${auditLog.action} LIKE ${`${query.action}%`}`);
  }
  if (query.entityType) {
    filters.push(eq(auditLog.entityType, query.entityType));
  }
  if (query.userId) {
    filters.push(eq(auditLog.userId, query.userId));
  }
  if (query.from) {
    filters.push(gte(auditLog.createdAt, query.from));
  }
  if (query.to) {
    filters.push(lte(auditLog.createdAt, query.to));
  }

  const where = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(auditLog).where(where);
  const total = Number(totalRow?.value ?? 0);

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      userId: auditLog.userId,
      userEmail: users.email,
      userFullName: users.fullName,
      createdAt: auditLog.createdAt,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      userId: r.userId,
      userEmail: r.userEmail,
      userFullName: r.userFullName,
      createdAt: r.createdAt.toISOString(),
      before: r.before,
      after: r.after,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Coverage notes for operators (also documented in docs/AUDIT_LOG.md).
 * Domain mutations under routes/ generally call writeAuditLog via services.
 * Known intentional gaps: auth login/refresh (no project scope), report preview,
 * and read-only GETs except when export audits are added at the route layer.
 */
export const AUDIT_COVERAGE_NOTES = {
  appendOnly: true,
  indexedBy: 'audit_log_project_id_created_at_idx',
  retentionDefault: 'Indefinite — prune with ops policy; do not UPDATE rows',
  projectDelete: 'project_id set null before delete; project.delete logged with projectId null',
} as const;
