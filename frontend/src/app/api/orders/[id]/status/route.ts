import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { ORDER_STATUS_INPUT, setOrderStatus } from '@/lib/order-events';

export const dynamic = 'force-dynamic';

const schema = z.object({ status: z.enum(ORDER_STATUS_INPUT) });

// Kept for the kitchen display, which calls this path. Same behaviour as PATCH /api/orders/[id].
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.kitchen);
    const { status } = await parseJson(request, schema);
    await setOrderStatus(tenantId, params.id, status);
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return handleError(error, 'Failed to update order status');
  }
}
