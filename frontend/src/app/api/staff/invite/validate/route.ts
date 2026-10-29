import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { staffInvites } from '@/db/schema';
import { HttpError, handleError } from '@/lib/http';
import { hashInviteToken, isInviteToken } from '@/lib/invites';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!isInviteToken(token)) throw new HttpError(400, 'Token is missing or invalid');

    const [invite] = await db.select({ role: staffInvites.role, expiresAt: staffInvites.expiresAt, acceptedAt: staffInvites.acceptedAt })
      .from(staffInvites).where(eq(staffInvites.tokenHash, hashInviteToken(token))).limit(1);

    if (!invite) throw new HttpError(404, 'Invitation link has expired or is invalid.');
    if (invite.acceptedAt) throw new HttpError(400, 'This invitation has already been accepted.');
    if (invite.expiresAt.getTime() < Date.now()) throw new HttpError(410, 'This invitation has expired. Ask your manager to send a new one.');

    // Only what the page needs. No email, tenant id or internal ids.
    return NextResponse.json({ success: true, staff: { role: invite.role } });
  } catch (error) {
    return handleError(error, 'Failed to validate invitation.');
  }
}

export const dynamic = 'force-dynamic';
