import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { staff } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
        return NextResponse.json({ error: 'Token is missing' }, { status: 400 });
    }

    try {
        const [pendingStaff] = await db.query.staff.findMany({
            where: eq(staff.clerkId, `pending_${token}`),
        });

        if (!pendingStaff) {
            return NextResponse.json({ error: 'Invitation link has expired or is invalid.' }, { status: 404 });
        }

        if (pendingStaff.isActive) {
            return NextResponse.json({ error: 'This invitation has already been accepted.' }, { status: 400 });
        }

        return NextResponse.json({ success: true, staff: pendingStaff });
    } catch (error) {
        console.error('Invite Validation Error:', error);
        return NextResponse.json({ error: 'Failed to validate invitation.' }, { status: 500 });
    }
}
