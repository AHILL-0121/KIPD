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

export async function getTenantContext(): Promise<TenantContext | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
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

    if (isPlatformAdmin) {
      return {
        tenantId: '', // Platform admins don't have a specific tenant
        userId,
        role: 'platform_admin',
        userName,
        isPlatformAdmin: true,
      };
    }

    // Check if user has tenant_id in metadata (tenant owner)
    if (tenantId) {
      return {
        tenantId,
        userId,
        role: 'owner',
        userName,
        isPlatformAdmin: false,
      };
    }

    // Get staff record to find tenant and role
    const staffRecord = await db.query.staff.findFirst({
      where: eq(staff.clerkId, userId),
    });

    if (!staffRecord) {
      return null;
    }

    return {
      tenantId: staffRecord.tenantId,
      userId,
      role: staffRecord.role,
      userName: staffRecord.name || userName,
      isPlatformAdmin: false,
    };
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
