import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth';
import { createClerkClient } from '@clerk/backend';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    
    // Fetch all users from Clerk
    const users = await clerk.users.getUserList({ limit: 100 });

    // Transform to include relevant information
    const formattedUsers = users.data.map(user => ({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || '',
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      publicMetadata: user.publicMetadata,
      isPlatformAdmin: user.publicMetadata?.platform_admin === true,
      tenantId: user.publicMetadata?.tenant_id as string | undefined,
    }));

    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error('Fetch users error:', error);
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
