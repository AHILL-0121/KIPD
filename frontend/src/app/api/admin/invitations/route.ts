import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { db } from '@/db';
import { platformAuditLog, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { HttpError, handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformAdmin();
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured');
    const clerk = createClerkClient({ secretKey });

    const [invList, tenantRows] = await Promise.all([
      clerk.invitations?.getInvitationList
        ? clerk.invitations.getInvitationList({ status: 'pending', limit: 100 })
        : Promise.resolve({ data: [] }),
      db.select({ id: tenants.id, name: tenants.name }).from(tenants),
    ]);
    const tenantMap = new Map(tenantRows.map((t) => [t.id, t.name]));

    const items = (invList.data ?? []).map((inv) => {
      const tenantId = (inv.publicMetadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined;
      return {
        id: inv.id,
        emailAddress: inv.emailAddress,
        status: inv.status,
        tenantId: tenantId ?? null,
        tenantName: tenantId ? tenantMap.get(tenantId) ?? null : null,
        createdAt: inv.createdAt,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    return handleError(error, 'Failed to fetch pending invitations');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) throw new HttpError(400, 'Invitation id is required');

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured');
    const clerk = createClerkClient({ secretKey });

    await clerk.invitations.revokeInvitation(id);

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: 'invitation.revoke',
      targetType: 'invitation',
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to revoke invitation');
  }
}
