import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type Role, requireTenant } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { KEY_ID_PATTERN, checkKeys } from '@/lib/razorpay';
import { getRazorpayStatus, newWebhookSecret, removeRazorpayAccount, saveRazorpayKeys } from '@/lib/razorpay-account';
import { secretBoxReady } from '@/lib/secret-box';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// These keys decide whose bank account the money lands in, so only the owner may set them.
const OWNER: Role[] = ['owner'];

const keysSchema = z.object({
  keyId: z.string().trim().regex(KEY_ID_PATTERN, 'A Razorpay Key ID starts with rzp_test_ or rzp_live_'),
  keySecret: z.string().trim().min(8, 'Enter the Key Secret from Razorpay').max(200),
});

/** Where Razorpay must send its webhook for this business. The public address of this deployment, not localhost. */
function webhookUrl(request: NextRequest, path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return new URL(path, base).toString();
}

async function describe(request: NextRequest, tenantId: string, extra: Record<string, unknown> = {}) {
  const status = await getRazorpayStatus(tenantId);
  return NextResponse.json({ ...status, webhookUrl: webhookUrl(request, status.webhookPath), ...extra });
}

/** The connection as Settings may show it: the Key ID, test or live, and the webhook address. Never a secret. */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(OWNER);
    return await describe(request, tenantId);
  } catch (error) {
    return handleError(error, 'Failed to load the Razorpay connection');
  }
}

/**
 * Connect (or replace) the business's Razorpay keys. Razorpay is asked whether they are real first; keys it rejects are
 * never stored. The first time, a webhook secret is made too and returned once.
 */
export async function PUT(request: NextRequest) {
  try {
    const { tenantId, userName } = await requireTenant(OWNER);
    const keys = await parseJson(request, keysSchema);
    if (!secretBoxReady()) throw new HttpError(503, 'Payment keys cannot be stored yet: the server is missing its encryption secret. Please contact support.');

    const verdict = await checkKeys(keys);
    if (verdict === 'rejected') throw new HttpError(400, 'Razorpay did not accept these keys. Check the Key ID and Key Secret and try again. Nothing was saved.');
    if (verdict === 'unreachable') throw new HttpError(502, 'Could not reach Razorpay to check these keys. Nothing was saved, please try again.');

    await saveRazorpayKeys(tenantId, keys, userName);
    const status = await getRazorpayStatus(tenantId);
    const webhookSecret = status.webhookReady ? undefined : await newWebhookSecret(tenantId, userName);
    return await describe(request, tenantId, webhookSecret ? { webhookSecret } : {});
  } catch (error) {
    return handleError(error, 'Failed to save the Razorpay keys');
  }
}

/** A new webhook secret, shown once. The old one stops working immediately, so Razorpay's dashboard must be updated. */
export async function POST(request: NextRequest) {
  try {
    const { tenantId, userName } = await requireTenant(OWNER);
    const webhookSecret = await newWebhookSecret(tenantId, userName);
    if (!webhookSecret) throw new HttpError(409, 'Connect your Razorpay keys first.');
    return await describe(request, tenantId, { webhookSecret });
  } catch (error) {
    return handleError(error, 'Failed to create a webhook secret');
  }
}

/** Disconnect: the keys and the webhook secret are deleted. Payments already recorded are untouched. */
export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(OWNER);
    await removeRazorpayAccount(tenantId);
    return await describe(request, tenantId);
  } catch (error) {
    return handleError(error, 'Failed to disconnect Razorpay');
  }
}
