import { createHmac, timingSafeEqual } from 'crypto';
import { HttpError } from '@/lib/http';

/**
 * Razorpay, the minimum this app needs: create a Payment Link for a bill, and check that a webhook really came
 * from Razorpay. Plain fetch, no SDK, so there is nothing extra to keep up to date and it is easy to test.
 * Keys are platform-wide environment variables; each property only switches online payments on or off.
 */
const API = 'https://api.razorpay.com/v1';

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export interface PaymentLink {
  id: string;
  url: string;
  /** In rupees, as asked for. */
  amount: number;
}

interface LinkRequest {
  /** Whole paise. */
  amountPaise: number;
  description: string;
  billId: string;
  tenantId: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
}

export async function createPaymentLink({ amountPaise, description, billId, tenantId, customer }: LinkRequest): Promise<PaymentLink> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new HttpError(503, 'Online payments are not set up yet');
  if (!Number.isInteger(amountPaise) || amountPaise < 100) throw new HttpError(400, 'An online payment must be at least ₹1');

  let res: Response;
  try {
    res = await fetch(`${API}/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: description.slice(0, 2000),
        customer: {
          ...(customer?.name ? { name: customer.name } : {}),
          ...(customer?.email ? { email: customer.email } : {}),
          ...(customer?.phone ? { contact: customer.phone } : {}),
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
        // The webhook reads these to know which bill the money is for.
        notes: { billId, tenantId },
      }),
    });
  } catch (error) {
    console.error('Razorpay unreachable', error);
    throw new HttpError(502, 'Could not reach Razorpay. Nothing was changed, please try again.');
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string; short_url?: string; error?: { description?: string } };
  if (!res.ok || !data.id || !data.short_url) {
    console.error('Razorpay refused the payment link', res.status, data.error?.description);
    throw new HttpError(502, 'Razorpay could not create the payment link. Nothing was changed.');
  }
  return { id: data.id, url: data.short_url, amount: amountPaise / 100 };
}

/** True only when `signature` is the HMAC-SHA256 of the exact raw body, keyed with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
