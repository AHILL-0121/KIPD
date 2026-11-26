import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { platformAuditLog } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import {
  getPlanConfig,
  getPlatformAnnouncement,
  setPlanConfig,
  setPlatformAnnouncement,
} from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

const quotasSchema = z.object({
  rooms: z.number().int().min(0).nullable(),
  tables: z.number().int().min(0).nullable(),
  outlets: z.number().int().min(0).nullable(),
  staff: z.number().int().min(0).nullable(),
});

const tierSchema = z.object({
  monthlyPrice: z.number().min(0),
  quotas: quotasSchema,
});

const patchSchema = z.object({
  announcement: z
    .object({
      enabled: z.boolean(),
      message: z.string().max(400),
      tone: z.enum(['info', 'warning']).optional().default('info'),
      linkUrl: z.string().max(300).nullable().optional(),
      linkLabel: z.string().max(80).nullable().optional(),
    })
    .optional(),
  plans: z
    .object({
      currency: z.enum(['INR', 'USD']),
      plans: z.object({
        basic: tierSchema,
        pro: tierSchema,
        enterprise: tierSchema,
      }),
    })
    .optional(),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    const [announcement, plans] = await Promise.all([
      getPlatformAnnouncement(),
      getPlanConfig(),
    ]);
    return NextResponse.json({ announcement, plans });
  } catch (error) {
    return handleError(error, 'Failed to load platform configuration');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await parseJson(request, patchSchema);

    let announcement = await getPlatformAnnouncement();
    let plans = await getPlanConfig();

    if (body.announcement) {
      announcement = await setPlatformAnnouncement(body.announcement, admin.userId);
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId,
        action: body.announcement.enabled ? 'platform.announcement_update' : 'platform.announcement_disable',
        targetType: 'platform_settings',
        targetId: 'announcement',
        metadata: { tone: announcement.tone, enabled: announcement.enabled },
      });
    }

    if (body.plans) {
      plans = await setPlanConfig(body.plans, admin.userId);
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId,
        action: 'platform.plans_update',
        targetType: 'platform_settings',
        targetId: 'plans',
        metadata: { currency: plans.currency },
      });
    }

    return NextResponse.json({ success: true, announcement, plans });
  } catch (error) {
    return handleError(error, 'Failed to save platform configuration');
  }
}
