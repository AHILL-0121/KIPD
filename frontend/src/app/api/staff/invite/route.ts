import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { staff, staffInvites, tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { emailTemplates, sendEmail } from '@/lib/email';
import { INVITE_TTL_MS, hashInviteToken, newInviteToken } from '@/lib/invites';

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(['manager', 'front_desk', 'waiter', 'kitchen']),
});

export async function POST(request: NextRequest) {
  try {
    const { tenantId, userId } = await requireTenant(ROLES.manage);
    const { name, email, role } = await parseJson(request, schema);

    const [already] = await db.select({ id: staff.id }).from(staff)
      .where(and(eq(staff.tenantId, tenantId), sql`lower(${staff.email}) = ${email}`)).limit(1);
    if (already) throw new HttpError(409, 'That person is already on your team.');

    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });

    // Only the hash is stored; the raw token exists only in the email.
    const token = newInviteToken();
    const inviteId = crypto.randomUUID();

    // Re-inviting replaces any invitation still open for this email.
    await db.batch([
      db.delete(staffInvites).where(and(
        eq(staffInvites.tenantId, tenantId), sql`lower(${staffInvites.email}) = ${email}`, isNull(staffInvites.acceptedAt),
      )),
      db.insert(staffInvites).values({
        id: inviteId, tenantId, email, name, role,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedBy: userId,
      }),
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sa-kipd.vercel.app';
    const sent = await sendEmail({
      to: email,
      subject: "You've been invited to join the team",
      html: emailTemplates.staffInvite({
        name,
        hotelName: tenant?.name || 'your team',
        role,
        inviteUrl: `${baseUrl}/accept-invite/${token}`,
      }),
    });

    if (!sent.success) {
      // Don't leave an open invitation nobody received.
      await db.delete(staffInvites).where(eq(staffInvites.id, inviteId));
      throw new HttpError(502, 'The invitation email could not be sent. Check the email settings and try again.');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to send invitation');
  }
}
