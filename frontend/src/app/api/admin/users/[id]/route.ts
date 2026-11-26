import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { z } from 'zod';
import { db } from '@/db';
import { platformAuditLog } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';

const actionSchema = z.object({
  action: z.enum(['ban', 'unban', 'revoke_sessions', 'grant_admin', 'revoke_admin']),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const targetUserId = params.id?.trim();
    if (!targetUserId) throw new HttpError(400, 'User ID is required');

    const { action } = await parseJson(request, actionSchema);

    if ((action === 'ban' || action === 'revoke_admin' || action === 'revoke_sessions') && targetUserId === admin.userId) {
      throw new HttpError(400, 'You cannot run that action on your own active admin account');
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured');
    const clerk = createClerkClient({ secretKey });

    const target = await clerk.users.getUser(targetUserId);
    const existingMeta = (target.publicMetadata ?? {}) as Record<string, unknown>;

    if (action === 'ban') {
      await clerk.users.banUser(targetUserId);
    } else if (action === 'unban') {
      await clerk.users.unbanUser(targetUserId);
    } else if (action === 'revoke_sessions') {
      const sessions = await clerk.sessions.getSessionList({ userId: targetUserId, status: 'active' });
      await Promise.all(sessions.data.map((s) => clerk.sessions.revokeSession(s.id)));
    } else if (action === 'grant_admin') {
      await clerk.users.updateUser(targetUserId, {
        publicMetadata: { ...existingMeta, platform_admin: true },
      });
    } else if (action === 'revoke_admin') {
      const nextMeta = { ...existingMeta };
      delete nextMeta.platform_admin;
      await clerk.users.updateUser(targetUserId, { publicMetadata: nextMeta });
    }

    const globalAny = globalThis as { authCache?: Map<string, unknown>; platformAdminCache?: Map<string, unknown> };
    globalAny.authCache?.delete(targetUserId);
    globalAny.platformAdminCache?.delete(targetUserId);

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: `user.${action}`,
      targetType: 'user',
      targetId: targetUserId,
      metadata: {
        email: target.emailAddresses?.[0]?.emailAddress ?? null,
      },
    });

    return NextResponse.json({ success: true, action });
  } catch (error) {
    return handleError(error, 'Failed to update user');
  }
}
