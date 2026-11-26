import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { accessRequests, platformAuditLog } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { provisionTenantAndInviteOwner } from '@/lib/admin-tenants';
import { HttpError, assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { isValidTimeZone } from '@/lib/tz';

const rejectSchema = z.object({
  action: z.enum(['reject']),
  notes: z.string().trim().max(500).optional(),
});

const approveSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
    .min(2)
    .max(60),
  type: z.enum(['hotel', 'restaurant', 'both']).optional().default('both'),
  plan: z.enum(['basic', 'pro', 'enterprise']).optional().default('basic'),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional().default('Asia/Kolkata'),
  notes: z.string().trim().max(500).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Access request');
    const { notes } = await parseJson(request, rejectSchema);

    const [updated] = await db
      .update(accessRequests)
      .set({
        status: 'rejected',
        notes: notes ?? null,
        reviewedBy: admin.userId,
        reviewedAt: new Date(),
      })
      .where(eq(accessRequests.id, id))
      .returning();

    if (!updated) throw notFound('Access request');

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: 'access_request.reject',
      targetType: 'access_request',
      targetId: id,
      metadata: { company: updated.company, email: updated.email },
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    return handleError(error, 'Failed to update access request');
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Access request');
    const body = await parseJson(request, approveSchema);

    const [reqRow] = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
    if (!reqRow) throw notFound('Access request');
    if (reqRow.status === 'approved') {
      throw new HttpError(409, 'This access request has already been approved');
    }

    const provision = await provisionTenantAndInviteOwner({
      name: body.name || reqRow.company,
      slug: body.slug,
      ownerEmail: reqRow.email.toLowerCase(),
      type: body.type,
      timezone: body.timezone,
      plan: body.plan,
      adminClerkId: admin.userId,
    });

    const [updated] = await db
      .update(accessRequests)
      .set({
        status: 'approved',
        notes: body.notes ?? null,
        reviewedBy: admin.userId,
        reviewedAt: new Date(),
        tenantId: provision.tenant.id,
      })
      .where(eq(accessRequests.id, id))
      .returning();

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: 'access_request.approve',
      targetType: 'access_request',
      targetId: id,
      metadata: { tenantId: provision.tenant.id, tenantName: provision.tenant.name },
    });

    return NextResponse.json({ success: true, request: updated, ...provision });
  } catch (error) {
    return handleError(error, 'Failed to approve access request');
  }
}
