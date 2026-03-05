import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { staff } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail, emailTemplates } from '@/lib/email';
import { requireTenantContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    const allStaff = await db.query.staff.findMany({
      where: eq(staff.tenantId, tenantId),
      orderBy: (staff, { desc }) => [desc(staff.createdAt)],
    });

    return NextResponse.json(allStaff);
  } catch (error) {
    console.error('Get staff error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch staff' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    const body = await request.json();
    const { name, email, role } = body;

    // Create temp clerk ID (in production, this would be done after user accepts invite)
    const tempClerkId = `pending_${Math.random().toString(36).substring(7)}`;

    // Create staff member
    const [staffMember] = await db.insert(staff).values({
      tenantId,
      clerkId: tempClerkId,
      name,
      email,
      role,
      isActive: false, // Activated after accepting invite
    }).returning();

    // Send invitation email
    await sendEmail({
      to: email,
      subject: 'Welcome to the Team!',
      html: emailTemplates.staffInvite({
        name,
        hotelName: 'Your Hotel',
        role,
        inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${staffMember.id}`,
      }),
    });

    return NextResponse.json({ success: true, staffMember });
  } catch (error) {
    console.error('Create staff error:', error);
    return NextResponse.json(
      { error: 'Failed to create staff member' },
      { status: 500 }
    );
  }
}
