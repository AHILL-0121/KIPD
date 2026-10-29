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
  billing: ['owner', 'manager', 'front_desk', 'waiter'] as Role[],
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
      };
    } else if (tenantId) {
      contextData = {
        tenantId,
        userId,
        role: 'owner',
        userName,
        isPlatformAdmin: false,
        ...(await tenantStateOf(tenantId)),
      };
    }

    if (contextData) {
      globalAny.authCache.set(userId, { data: contextData, expiresAt: Date.now() + 60000 });
      return contextData;
    }

    // Get staff record to find tenant and role
    const staffRecord = await db.query.staff.findFirst({
      where: eq(staff.clerkId, userId),
    });

    if (!staffRecord) {
      return null;
    }

    const newContext = {
      tenantId: staffRecord.tenantId,
      userId,
      role: staffRecord.role,
      userName: staffRecord.name || userName,
      isPlatformAdmin: false,
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
export async function requireTenant(allowed?: Role[]): Promise<TenantContext> {
  const context = await requireTenantContext();
  if (!context.tenantId) throw new HttpError(403, 'No tenant is selected for this account');
  if (context.tenantStatus === 'suspended') throw new HttpError(403, 'This account is suspended. Please contact support.');
  if (context.tenantStatus !== 'active') throw new HttpError(403, 'This account no longer exists. Please contact support.');
  if (allowed && !allowed.includes(context.role as Role)) throw forbidden();
  return context;
}

export async function requirePlatformAdmin(): Promise<TenantContext> {
  const { userId } = await auth();

  if (!userId) {
    throw unauthorized();
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

    return {
      tenantId: '',
      userId,
      role: 'platform_admin',
      userName,
      isPlatformAdmin: true,
      tenantStatus: 'active',
      timezone: DEFAULT_TZ,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('Error fetching user from Clerk:', error);
    throw forbidden();
  }
}
