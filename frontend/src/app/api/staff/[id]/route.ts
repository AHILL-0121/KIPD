import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { staff, staffInvites } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, assertUuid, handleError, notFound } from '@/lib/http';

/** Removes a team member, or cancels a pending invitation (the team list shows both). */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requireTenant(ROLES.manage);
    const id = assertUuid(params.id, 'Staff member');

    const [target] = await db.select().from(staff)
      .where(and(eq(staff.id, id), eq(staff.tenantId, context.tenantId))).limit(1);

    if (target) {
      if (target.role === 'owner') throw new HttpError(403, 'The owner account cannot be removed');
      if (target.clerkId === context.userId) throw new HttpError(403, 'You cannot remove your own account');
      await db.delete(staff).where(and(eq(staff.id, id), eq(staff.tenantId, context.tenantId)));
      return NextResponse.json({ success: true });
    }

    const cancelled = await db.delete(staffInvites)
      .where(and(eq(staffInvites.id, id), eq(staffInvites.tenantId, context.tenantId)))
      .returning({ id: staffInvites.id });
    if (!cancelled[0]) throw notFound('Staff member');
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete staff member');
  }
}
