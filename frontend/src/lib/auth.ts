import { auth } from '@clerk/nextjs/server';
import { createClerkClient } from '@clerk/backend';
import { db } from '@/db';
import { tenants, staff } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  userName: string;
  isPlatformAdmin: boolean;
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
      };
    } else if (tenantId) {
      contextData = {
        tenantId,
        userId,
        role: 'owner',
        userName,
        isPlatformAdmin: false,
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
    throw new Error('Unauthorized: No tenant context');
  }

  return context;
}

export async function requirePlatformAdmin(): Promise<TenantContext> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('Unauthorized: Not authenticated');
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
      throw new Error('Unauthorized: Platform admin access required');
    }

    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Admin';

    return {
      tenantId: '',
      userId,
      role: 'platform_admin',
      userName,
      isPlatformAdmin: true,
    };
  } catch (error) {
    console.error('Error fetching user from Clerk:', error);
    throw new Error('Unauthorized: Platform admin access required');
  }
}
