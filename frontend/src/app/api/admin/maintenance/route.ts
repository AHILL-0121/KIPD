import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { platformAuditLog } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { getMaintenanceState, setMaintenanceState } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const updateSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(500).optional(),
  estimatedEnd: z.string().trim().max(120).nullable().optional(),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    const state = await getMaintenanceState();
    return NextResponse.json(state);
  } catch (error) {
    return handleError(error, 'Failed to load maintenance settings');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await parseJson(request, updateSchema);

    const state = await setMaintenanceState(body, admin.userId);

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: state.enabled ? 'platform.maintenance_enable' : 'platform.maintenance_disable',
      targetType: 'platform',
      targetId: 'maintenance',
      metadata: { message: state.message, estimatedEnd: state.estimatedEnd },
    });

    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    return handleError(error, 'Failed to update maintenance settings');
  }
}
