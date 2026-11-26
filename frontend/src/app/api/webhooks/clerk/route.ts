import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { platformAuditLog, staff } from '@/db/schema';

export const dynamic = 'force-dynamic';

const MAX_TIMESTAMP_DRIFT_SEC = 300; // 5 minutes per Svix specification

function verifySvixSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string,
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;

  const tsNum = Number(svixTimestamp);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_TIMESTAMP_DRIFT_SEC) return false;

  const base64Secret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(base64Secret, 'base64');
  if (secretBytes.length === 0) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  const candidates = svixSignature
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of candidates) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const sigBuf = Buffer.from(sig, 'utf8');
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

interface ClerkWebhookPayload {
  type?: string;
  data?: {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: Array<{ id?: string; email_address?: string }>;
    primary_email_address_id?: string | null;
    banned?: boolean;
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Clerk webhook secret not configured' }, { status: 400 });
  }

  const rawBody = await request.text();
  const ok = verifySvixSignature(
    rawBody,
    request.headers.get('svix-id'),
    request.headers.get('svix-timestamp'),
    request.headers.get('svix-signature'),
    secret,
  );
  if (!ok) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: ClerkWebhookPayload;
  try {
    event = JSON.parse(rawBody) as ClerkWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const userId = event.data?.id;
  if (!userId) {
    return NextResponse.json({ received: true });
  }

  const globalAny = globalThis as { authCache?: Map<string, unknown>; platformAdminCache?: Map<string, unknown> };
  globalAny.authCache?.delete(userId);
  globalAny.platformAdminCache?.delete(userId);

  if (event.type === 'user.updated') {
    const emails = event.data?.email_addresses ?? [];
    const primary =
      emails.find((e) => e.id === event.data?.primary_email_address_id)?.email_address ??
      emails[0]?.email_address;
    const name = [event.data?.first_name, event.data?.last_name].filter(Boolean).join(' ').trim();

    const updates: Partial<typeof staff.$inferInsert> = { updatedAt: new Date() };
    if (primary) updates.email = primary.toLowerCase();
    if (name) updates.name = name;
    if (typeof event.data?.banned === 'boolean') updates.isActive = !event.data.banned;

    await db.update(staff).set(updates).where(eq(staff.clerkId, userId));
  } else if (event.type === 'user.deleted') {
    await db
      .update(staff)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(staff.clerkId, userId));

    await db.insert(platformAuditLog).values({
      adminClerkId: 'clerk_webhook',
      action: 'user.clerk_deleted',
      targetType: 'user',
      targetId: userId,
    });
  }

  return NextResponse.json({ received: true, type: event.type ?? 'unknown' });
}
