import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { staff } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
    try {
        const { userId } = auth();
        if (!userId) {
            return NextResponse.json({ error: 'You must be logged in to accept an invitation.' }, { status: 401 });
        }

        const body = await request.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json({ error: 'Missing invite token.' }, { status: 400 });
        }

        // Find the pending staff record
        const [pendingStaff] = await db.query.staff.findMany({
            where: and(
                eq(staff.clerkId, `pending_${token}`),
                eq(staff.isActive, false)
            ),
        });

        if (!pendingStaff) {
            return NextResponse.json({ error: 'Invitation not found or already accepted.' }, { status: 404 });
        }

        // Verify if this real ClerkUser is already a staff member globally? 
        // Usually, you should ensure they don't accept multiple invites for the same tenant.

        // 1. Swap the pending_token with their REAL authenticated Clerk ID!
        // 2. Mark the account active to officially grant Dashboard Access!
        await db.update(staff)
            .set({
                clerkId: userId,
                isActive: true,
                updatedAt: new Date()
            })
            .where(eq(staff.id, pendingStaff.id));

        return NextResponse.json({ success: true, role: pendingStaff.role });
    } catch (error) {
        console.error('Invite Acceptance Error:', error);
        return NextResponse.json({ error: 'Failed to accept invitation.' }, { status: 500 });
    }
}
