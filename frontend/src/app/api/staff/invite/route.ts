import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, emailTemplates } from '@/lib/email';
import { requireTenantContext } from '@/lib/auth';
import { db } from '@/db';
import { staff } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    // Authenticate natively using Clerk instead of manual insecure headers
    const context = await requireTenantContext();
    const { tenantId } = context;

    const body = await request.json();
    const { name, email, role } = body;

    // Ensure URL is absolutely parsed for deep-linking
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sa-kipd.vercel.app';
    const inviteToken = Math.random().toString(36).substring(2);
    const inviteLink = `${baseUrl}/accept-invite/${inviteToken}`;

    // Natively inject the pending staff member to the dashboard grid
    const [staffMember] = await db.insert(staff).values({
      tenantId,
      clerkId: `pending_${inviteToken}`, // temporary dummy clerkId
      name,
      email,
      role,
      isActive: false, // Remains false until they click accept!
    }).returning();

    await sendEmail({
      to: email,
      subject: 'You\'ve been invited to join the team!',
      html: emailTemplates.staffInvite({
        name,
        hotelName: 'Your Hotel',
        role,
        inviteUrl: inviteLink,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Staff invite error:', error);
    return NextResponse.json(
      { error: 'Failed to send invitation' },
      { status: 500 }
    );
  }
}
