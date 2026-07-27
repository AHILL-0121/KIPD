import { NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePlatformAdmin();

    const { id } = params;
    const body = await request.json();
    const { action } = body;

    if (action === 'suspend') {
      await db.update(tenants)
        .set({ status: 'suspended' })
        .where(eq(tenants.id, id));
    } else if (action === 'activate') {
      await db.update(tenants)
        .set({ status: 'active' })
        .where(eq(tenants.id, id));
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePlatformAdmin();

    const { id } = params;

    await db.delete(tenants).where(eq(tenants.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
