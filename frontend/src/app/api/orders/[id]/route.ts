import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { ORDER_STATUS_INPUT, setOrderStatus } from '@/lib/order-events';

const schema = z.object({ status: z.enum(ORDER_STATUS_INPUT) });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.kitchen);
    const { status } = await parseJson(request, schema);
    await setOrderStatus(tenantId, params.id, status);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to update order');
  }
}
