import { NextResponse } from 'next/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { staff, staffInvites } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';

/**
 * The team list: active staff, plus invitations still waiting to be accepted.
 * Pending invitations are shaped like staff (isActive: false) so the screen can list them together.
 * Tokens are never sent to the browser (they are not even stored: only a hash is).
 */
export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);

    const [members, invites] = await Promise.all([
      db.query.staff.findMany({ where: eq(staff.tenantId, tenantId), orderBy: (s, { desc }) => [desc(s.createdAt)] }),
      db.select().from(staffInvites).where(and(
        eq(staffInvites.tenantId, tenantId), isNull(staffInvites.acceptedAt), gt(staffInvites.expiresAt, new Date()),
      )),
    ]);

    const pending = invites.map((i) => ({
      id: i.id, tenantId: i.tenantId, propertyId: null, clerkId: 'pending',
      email: i.email, name: i.name, role: i.role, isActive: false, createdAt: i.createdAt,
    }));
    return NextResponse.json([...pending, ...members].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
  } catch (error) {
    return handleError(error, 'Failed to fetch staff');
  }
}

export const dynamic = 'force-dynamic';
