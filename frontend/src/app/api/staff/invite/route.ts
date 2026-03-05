import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, emailTemplates } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get('x-tenant-id');
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, email, role } = body;

    // In production, generate secure invite token
    const inviteToken = Math.random().toString(36).substring(2);
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite/${inviteToken}`;

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
