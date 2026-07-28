import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { staff } from '@/db/schema';
import { clerkClient } from '@clerk/nextjs';
import { requireTenantContext } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const context = await requireTenantContext();
        const { tenantId } = context;

        const body = await request.json();
        const { name, email, role, password } = body;

        // 1. Ask Clerk to natively spawn the Account and bypass Email verification
        const newUser = await clerkClient.users.createUser({
            firstName: name.split(' ')[0],
            lastName: name.split(' ').slice(1).join(' '),
            emailAddress: [email],
            password: password,
            skipPasswordChecks: true,
        });

        // 2. Mark the account organically active without sending an email!
        const [staffMember] = await db.insert(staff).values({
            tenantId,
            clerkId: newUser.id,
            name,
            email,
            role,
            isActive: true, // Instantly Active!
        }).returning();

        return NextResponse.json({ success: true, staffMember });
    } catch (error: any) {
        console.error('Direct Staff Creation Error:', error);

        // Clerk usually throws error.errors for validation
        let errMessage = 'Failed to create staff member directly.';
        if (error.errors && error.errors.length > 0) {
            errMessage = error.errors[0].longMessage || error.errors[0].message;
        }

        return NextResponse.json(
            { error: errMessage },
            { status: 500 }
        );
    }
}
