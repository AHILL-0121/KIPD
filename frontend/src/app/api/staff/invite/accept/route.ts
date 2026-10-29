import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { staff, staffInvites } from '@/db/schema';
import { HttpError, handleError, parseJson, unauthorized } from '@/lib/http';
import { hashInviteToken, isInviteToken } from '@/lib/invites';

const schema = z.object({ token: z.string().refine(isInviteToken, 'Invalid invite token') });

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) throw unauthorized();

    const { token } = await parseJson(request, schema);

    const [invite] = await db.select().from(staffInvites)
      .where(and(eq(staffInvites.tokenHash, hashInviteToken(token)), isNull(staffInvites.acceptedAt))).limit(1);
    if (!invite) throw new HttpError(404, 'Invitation not found or already accepted.');
    if (invite.expiresAt.getTime() < Date.now()) throw new HttpError(410, 'This invitation has expired. Ask your manager to send a new one.');

    // The invitation is for one email address. The person accepting must be signed in with that address,
    // and Clerk must have verified it. Otherwise anyone who got hold of the link could take the seat.
    const user = await clerkClient.users.getUser(userId);
    const verified = (user.emailAddresses ?? [])
      .filter((e) => e.verification?.status === 'verified')
      .map((e) => e.emailAddress.toLowerCase());
    if (!verified.includes(invite.email.toLowerCase())) {
      throw new HttpError(403, 'This invitation was sent to a different email address. Sign in with the address that received it.');
    }

    // One login can belong to one workplace.
    const [existing] = await db.select({ id: staff.id }).from(staff).where(eq(staff.clerkId, userId)).limit(1);
    if (existing) throw new HttpError(409, 'This account already belongs to a team.');

    await db.batch([
      db.insert(staff).values({
        tenantId: invite.tenantId, clerkId: userId, email: invite.email, name: invite.name, role: invite.role, isActive: true,
      }),
      db.update(staffInvites).set({ acceptedAt: new Date() }).where(eq(staffInvites.id, invite.id)),
    ]);
    return NextResponse.json({ success: true, role: invite.role });
  } catch (error) {
    return handleError(error, 'Failed to accept invitation.');
  }
}
