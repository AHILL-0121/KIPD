import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

type ClerkUserShape = {
  id: string;
  emailAddresses?: { emailAddress: string }[];
  firstName?: string | null;
  lastName?: string | null;
  createdAt?: number;
  lastSignInAt?: number | null;
  publicMetadata?: Record<string, unknown>;
  banned?: boolean;
};

function formatUser(user: ClerkUserShape) {
  const isPlatformAdmin = user.publicMetadata?.platform_admin === true;
  const tenantId = user.publicMetadata?.tenant_id as string | undefined;
  const role = isPlatformAdmin ? 'platform_admin' : tenantId ? 'tenant_admin' : 'staff';
  return {
    id: user.id,
    email: user.emailAddresses?.[0]?.emailAddress || '',
    firstName: user.firstName,
    lastName: user.lastName,
    role,
    status: user.banned ? 'suspended' : 'active',
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    publicMetadata: user.publicMetadata,
    isPlatformAdmin,
    tenantId,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const sp = new URL(request.url).searchParams;
    const hasPagination = sp.has('page') || sp.has('limit');

    if (!hasPagination) {
      const users = await clerk.users.getUserList({ limit: 100 });
      return NextResponse.json(users.data.map((u) => formatUser(u as ClerkUserShape)));
    }

    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get('limit') || '20', 10) || 20));
    const search = (sp.get('search') || '').trim();
    const roleFilter = (sp.get('role') || 'all').trim();

    if (roleFilter === 'all') {
      const users = await clerk.users.getUserList({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        ...(search ? { query: search } : {}),
      });
      const items = users.data.map((u) => formatUser(u as ClerkUserShape));
      const total = typeof users.totalCount === 'number' ? users.totalCount : items.length;
      return NextResponse.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    }

    // Role lives in Clerk publicMetadata, so filter across the fetched batch before paging.
    const users = await clerk.users.getUserList({
      limit: 100,
      ...(search ? { query: search } : {}),
    });
    const filtered = users.data
      .map((u) => formatUser(u as ClerkUserShape))
      .filter((u) => u.role === roleFilter);
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch users');
  }
}
