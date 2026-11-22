import { auth } from '@clerk/nextjs/server';
import { createClerkClient } from '@clerk/backend';
import { db } from '@/db';
import { tenants, staff } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { HttpError, forbidden, unauthorized } from '@/lib/http';

export type Role = 'owner' | 'manager' | 'front_desk' | 'waiter' | 'kitchen';

/** Who may do what. Mirrors the sidebar in dashboard/layout.tsx, but enforced on the server. */
export const ROLES = {
  manage: ['owner', 'manager'] as Role[],
  frontDesk: ['owner', 'manager', 'front_desk'] as Role[],
  orders: ['owner', 'manager', 'waiter'] as Role[],
  kitchen: ['owner', 'manager', 'waiter', 'kitchen'] as Role[],
  // Taking money and seeing payment settings. Waiters are not included (decided 2026-11-14).
  billing: ['owner', 'manager', 'front_desk'] as Role[],
  // Closing a table's tab hands its bill to the front desk. That is part of serving the table, so waiters may.
  settleTab: ['owner', 'manager', 'front_desk', 'waiter'] as Role[],
};

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  userName: string;
  isPlatformAdmin: boolean;
  /** State of the tenant this user belongs to. Anything but 'active' blocks tenant routes. */
  tenantStatus: 'active' | 'suspended' | 'deleted' | 'missing';
  /** IANA time zone of the tenant. Decides what "today" means. */
  timezone: string;
  /** Which areas the user has access to. Owners and managers always have both. */
  areas: 'hotel' | 'restaurant' | 'both';
}

/**
 * Throws 403 if the user's areas don't include the requested area.
 * Only applies to front_desk, waiter and kitchen roles — owners and managers always pass.
 */
export function requireArea(ctx: TenantContext, area: 'hotel' | 'restaurant'): void {
  const restricted: Role[] = ['front_desk', 'waiter', 'kitchen'];
  if (!restricted.includes(ctx.role as Role)) return; // owner/manager: always allowed
  if (ctx.areas === 'both') return;
  if (ctx.areas === area) return;
  throw new HttpError(403, `You do not have access to the ${area} area`);
}

/** Looks up the tenant row. A stale Clerk profile can point at a tenant that no longer exists. */
const DEFAULT_TZ = 'Asia/Kolkata';
async function tenantStateOf(tenantId: string): Promise<Pick<TenantContext, 'tenantStatus' | 'timezone'>> {
  try {
    const [t] = await db.select({ status: tenants.status, deletedAt: tenants.deletedAt, timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!t) return { tenantStatus: 'missing', timezone: DEFAULT_TZ };
    if (t.deletedAt) return { tenantStatus: 'deleted', timezone: t.timezone };
    return { tenantStatus: t.status === 'active' ? 'active' : 'suspended', timezone: t.timezone };
  } catch {
    return { tenantStatus: 'missing', timezone: DEFAULT_TZ }; // e.g. a malformed id in old Clerk metadata
  }
}

const globalAny: any = global;
if (!globalAny.authCache) {
  globalAny.authCache = new Map<string, { data: TenantContext, expiresAt: number }>();
}

export async function getTenantContext(): Promise<TenantContext | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // 1. Check local TTL Cache
  const cached = globalAny.authCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Fetch user data directly from Clerk to get publicMetadata
  try {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const user = await clerk.users.getUser(userId);

    const isPlatformAdmin = user.publicMetadata?.platform_admin === true;
    const tenantId = user.publicMetadata?.tenant_id as string | undefined;

    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses?.[0]?.emailAddress || 'User';

    let contextData: TenantContext | null = null;

    if (isPlatformAdmin) {
      contextData = {
        tenantId: '',
        userId,
        role: 'platform_admin',
        userName,
        isPlatformAdmin: true,
        tenantStatus: 'active',
        timezone: DEFAULT_TZ,
        areas: 'both',
      };
    } else if (tenantId) {
      // Owner path: tenantId from Clerk metadata. Always do staff lookup to get real role + areas.
      const staffRecord = await db.query.staff.findFirst({
        where: eq(staff.clerkId, userId),
      });
      const role = staffRecord?.role ?? 'owner';
      const areas = (staffRecord?.areas as 'hotel' | 'restaurant' | 'both' | undefined) ?? 'both';
      contextData = {
        tenantId,
        userId,
        role,
        userName: staffRecord?.name || userName,
        isPlatformAdmin: false,
        areas,
        ...(await tenantStateOf(tenantId)),
      };
    }

    if (contextData) {
      globalAny.authCache.set(userId, { data: contextData, expiresAt: Date.now() + 60000 });
      return contextData;
    }

    // Get staff record to find tenant and role (non-owner staff)
    const staffRecord = await db.query.staff.findFirst({
      where: eq(staff.clerkId, userId),
    });

    if (!staffRecord) {
      return null;
    }

    const newContext: TenantContext = {
      tenantId: staffRecord.tenantId,
      userId,
      role: staffRecord.role,
      userName: staffRecord.name || userName,
      isPlatformAdmin: false,
      areas: (staffRecord.areas as 'hotel' | 'restaurant' | 'both' | undefined) ?? 'both',
      ...(await tenantStateOf(staffRecord.tenantId)),
    };

    globalAny.authCache.set(userId, { data: newContext, expiresAt: Date.now() + 60000 });
    return newContext;
  } catch (error) {
    console.error('Error fetching user context from Clerk:', error);
    return null;
  }
}

export async function requireTenantContext(): Promise<TenantContext> {
  const context = await getTenantContext();

  if (!context) {
    throw unauthorized();
  }

  return context;
}

/**
 * The guard for every tenant-scoped route.
 * - 401 if not signed in / no tenant membership
 * - 403 if the user is a platform admin with no tenant, the tenant is suspended or deleted,
 *   or their role isn't in `allowed` (a status change takes effect within about a minute: roles are cached)
 * The returned `tenantId` is always a non-empty, trusted value from the session.
 */
export async function requireTenant(allowed?: Role[], area?: 'hotel' | 'restaurant'): Promise<TenantContext> {
  const context = await requireTenantContext();
  if (!context.tenantId) throw new HttpError(403, 'No tenant is selected for this account');
  if (context.tenantStatus === 'suspended') throw new HttpError(403, 'This account is suspended. Please contact support.');
  if (context.tenantStatus !== 'active') throw new HttpError(403, 'This account no longer exists. Please contact support.');
  if (allowed && !allowed.includes(context.role as Role)) throw forbidden();
  if (area) requireArea(context, area);
  return context;
}

// Same 60 s lifetime as the tenant context above. Only a confirmed admin is remembered, so a
// refusal is always re-checked; removing someone's admin flag takes effect within a minute.
if (!globalAny.platformAdminCache) {
  globalAny.platformAdminCache = new Map<string, { data: TenantContext, expiresAt: number }>();
}

export async function requirePlatformAdmin(): Promise<TenantContext> {
  const { userId } = await auth();

  if (!userId) {
    throw unauthorized();
  }

  const cached = globalAny.platformAdminCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Fetch user data directly from Clerk to get publicMetadata
  try {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const user = await clerk.users.getUser(userId);
    const isPlatformAdmin = user.publicMetadata?.platform_admin === true;

    if (!isPlatformAdmin) {
      throw forbidden();
    }

    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Admin';

    const data: TenantContext = {
      tenantId: '',
      userId,
      role: 'platform_admin',
      userName,
      isPlatformAdmin: true,
      tenantStatus: 'active',
      timezone: DEFAULT_TZ,
      areas: 'both',
    };
    globalAny.platformAdminCache.set(userId, { data, expiresAt: Date.now() + 60000 });
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('Error fetching user from Clerk:', error);
    throw forbidden();
  }
}
