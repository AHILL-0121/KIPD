import { db } from '@/db';
import { tenantAuditLogs } from '@/db/schema';

export interface TenantAuditEntry {
  tenantId: string;
  actorUserId: string;
  actorName?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Records an immutable tenant-scoped audit trail entry for sensitive billing, void,
 * refund, or guest privacy actions. Fails softly with a console error so primary
 * business writes are never lost if secondary logging fails.
 */
export async function writeTenantAudit(entry: TenantAuditEntry): Promise<void> {
  try {
    await db.insert(tenantAuditLogs).values({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      actorName: entry.actorName ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error('[AUDIT ERROR] Failed to write tenant audit log:', err);
  }
}
