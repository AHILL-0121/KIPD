import { and, count, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { outlets, platformSettings, rooms, staff, staffInvites, tables, tenants } from '@/db/schema';
import { HttpError } from '@/lib/http';

export type PlanTier = 'basic' | 'pro' | 'enterprise';
export type QuotaResource = 'rooms' | 'tables' | 'outlets' | 'staff';

export interface PlanQuotas {
  rooms: number | null;
  tables: number | null;
  outlets: number | null;
  staff: number | null;
}

/** Per-plan resource caps. `null` means unlimited. */
export const PLAN_LIMITS: Record<PlanTier, PlanQuotas> = {
  basic: { rooms: 15, tables: 15, outlets: 1, staff: 10 },
  pro: { rooms: 75, tables: 60, outlets: 5, staff: 40 },
  enterprise: { rooms: null, tables: null, outlets: null, staff: null },
};

const RESOURCE_LABELS: Record<QuotaResource, string> = {
  rooms: 'rooms',
  tables: 'tables',
  outlets: 'outlets',
  staff: 'team members (including pending invites)',
};

export function getPlanLimits(plan: string | null | undefined): PlanQuotas {
  if (plan === 'pro' || plan === 'enterprise' || plan === 'basic') {
    return PLAN_LIMITS[plan];
  }
  return PLAN_LIMITS.basic;
}

/** Reads platform-overridden quotas from `platform_settings` (`plans`) if present, falling back to `PLAN_LIMITS`. */
export async function getConfiguredPlanLimits(plan: PlanTier): Promise<PlanQuotas> {
  const def = PLAN_LIMITS[plan];
  try {
    const [row] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, 'plans'))
      .limit(1);
    const plansObj = (row?.value as Record<string, unknown> | undefined)?.plans as Record<string, unknown> | undefined;
    const rawQuotas = (plansObj?.[plan] as Record<string, unknown> | undefined)?.quotas as Record<string, unknown> | undefined;
    if (!rawQuotas) return def;
    const pick = (k: keyof PlanQuotas) => {
      if (rawQuotas[k] === null) return null;
      const n = Number(rawQuotas[k]);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def[k];
    };
    return {
      rooms: pick('rooms'),
      tables: pick('tables'),
      outlets: pick('outlets'),
      staff: pick('staff'),
    };
  } catch {
    return def;
  }
}

async function countResource(
  tenantId: string,
  resource: QuotaResource,
  opts?: { excludeInviteEmail?: string },
): Promise<number> {
  if (resource === 'rooms') {
    const [row] = await db.select({ n: count() }).from(rooms).where(eq(rooms.tenantId, tenantId));
    return Number(row?.n ?? 0);
  }
  if (resource === 'tables') {
    const [row] = await db.select({ n: count() }).from(tables).where(eq(tables.tenantId, tenantId));
    return Number(row?.n ?? 0);
  }
  if (resource === 'outlets') {
    const [row] = await db.select({ n: count() }).from(outlets).where(eq(outlets.tenantId, tenantId));
    return Number(row?.n ?? 0);
  }

  // Staff quota counts existing staff + open, non-expired invites.
  const [staffRow] = await db.select({ n: count() }).from(staff).where(eq(staff.tenantId, tenantId));
  const now = new Date();
  const inviteFilters = [
    eq(staffInvites.tenantId, tenantId),
    isNull(staffInvites.acceptedAt),
    gt(staffInvites.expiresAt, now),
  ];
  if (opts?.excludeInviteEmail) {
    inviteFilters.push(ne(sql`lower(${staffInvites.email})`, opts.excludeInviteEmail.toLowerCase()));
  }
  const [inviteRow] = await db.select({ n: count() }).from(staffInvites).where(and(...inviteFilters));
  return Number(staffRow?.n ?? 0) + Number(inviteRow?.n ?? 0);
}

export async function getTenantPlanUsage(tenantId: string) {
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const plan = (tenant?.plan === 'pro' || tenant?.plan === 'enterprise' ? tenant.plan : 'basic') as PlanTier;
  const limits = await getConfiguredPlanLimits(plan);
  const [roomsCount, tablesCount, outletsCount, staffCount] = await Promise.all([
    countResource(tenantId, 'rooms'),
    countResource(tenantId, 'tables'),
    countResource(tenantId, 'outlets'),
    countResource(tenantId, 'staff'),
  ]);

  return {
    plan,
    limits,
    usage: {
      rooms: roomsCount,
      tables: tablesCount,
      outlets: outletsCount,
      staff: staffCount,
    },
  };
}

/** Throws 403 if creating another item of `resource` would exceed the tenant's plan quota. */
export async function enforcePlanLimit(
  tenantId: string,
  resource: QuotaResource,
  opts?: { excludeInviteEmail?: string },
): Promise<void> {
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const plan = (tenant?.plan === 'pro' || tenant?.plan === 'enterprise' ? tenant.plan : 'basic') as PlanTier;
  const limits = await getConfiguredPlanLimits(plan);
  const limit = limits[resource];
  if (limit === null) return;

  const current = await countResource(tenantId, resource, opts);
  if (current >= limit) {
    throw new HttpError(
      403,
      `Your ${plan} plan allows up to ${limit} ${RESOURCE_LABELS[resource]}. Upgrade your plan to add more.`,
    );
  }
}
