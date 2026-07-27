import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { staff } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const context = await requireTenantContext();
        const { tenantId } = context;
        const { id } = params;

        // Ensure they only delete staff from their own tenant!
        await db.delete(staff).where(
            and(
                eq(staff.id, id),
                eq(staff.tenantId, tenantId)
            )
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete staff error:', error);
        return NextResponse.json(
            { error: 'Failed to delete staff member' },
            { status: 500 }
        );
    }
}
