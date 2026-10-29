import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';
import { db } from '@/db';
import { staff } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';

// 'owner' is deliberately not creatable here.
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(['manager', 'front_desk', 'waiter', 'kitchen']),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
});

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const { name, email, role, password } = await parseJson(request, schema);

    // 1. Create the login in Clerk. Password strength checks stay ON.
    let clerkUserId: string;
    try {
      const user = await clerkClient.users.createUser({
        firstName: name.split(' ')[0],
        lastName: name.split(' ').slice(1).join(' ') || undefined,
        emailAddress: [email],
        password,
      });
      clerkUserId = user.id;
    } catch (error) {
      const first = (error as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0];
      throw new HttpError(422, first?.longMessage || first?.message || 'Could not create the account');
    }

    // 2. Record them against this tenant. If that fails, don't leave an orphan login behind.
    try {
      const [member] = await db.insert(staff).values({
        tenantId, clerkId: clerkUserId, name, email, role, isActive: true,
      }).returning();
      return NextResponse.json({ success: true, staffMember: { ...member, clerkId: undefined } });
    } catch (error) {
      await clerkClient.users.deleteUser(clerkUserId).catch(() => {});
      throw error;
    }
  } catch (error) {
    return handleError(error, 'Failed to create staff member');
  }
}
