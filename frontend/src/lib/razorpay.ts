import { createHmac, timingSafeEqual } from 'crypto';
import { HttpError } from '@/lib/http';

/**
 * Razorpay, the minimum this app needs: create a Payment Link for a bill, and check that a webhook really came
 * from Razorpay. Plain fetch, no SDK, so there is nothing extra to keep up to date and it is easy to test.
 * Every call takes the keys of the business the payment is for (see lib/razorpay-account.ts). There are no
 * platform-wide keys: the money goes to the business's own Razorpay account, never through Kipd.
 */
const API = 'https://api.razorpay.com/v1';

export interface RazorpayKeys { keyId: string; keySecret: string }

export const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]+$/;

/**
 * Asks Razorpay whether these keys are real, before they are saved. 'ok', 'rejected' (Razorpay said no),
 * or 'unreachable' (could not ask; nothing is known).
 */
export async function checkKeys(keys: RazorpayKeys): Promise<'ok' | 'rejected' | 'unreachable'> {
  try {
    const res = await fetch(`${API}/payments?count=1`, { headers: { Authorization: authHeader(keys.keyId, keys.keySecret) } });
    if (res.ok) return 'ok';
    return res.status === 401 || res.status === 400 ? 'rejected' : 'unreachable';
  } catch (error) {
    console.error('Razorpay unreachable', error);
    return 'unreachable';
  }
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

export async function createPaymentLink(keys: RazorpayKeys, { amountPaise, description, billId, tenantId, customer }: LinkRequest): Promise<PaymentLink> {
  const { keyId, keySecret } = keys;
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

export interface PaymentQr {
  id: string;
  /** A ready-made QR picture, hosted by Razorpay. Any UPI app can scan it. */
  imageUrl: string;
  /** In rupees. */
  amount: number;
  /** When the QR stops accepting payment, as an ISO time. */
  expiresAt: string;
}

/** Returned when Razorpay says UPI is not switched on for the account. The billing screen matches on this text. */
export const QR_UNAVAILABLE_MESSAGE = 'UPI QR codes are not available on this Razorpay account. Use a payment link instead.';

/** How long a QR stays payable. Razorpay needs at least two minutes. */
export const QR_LIFETIME_SECONDS = 15 * 60;

function authHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

/**
 * A one-time UPI QR for an exact amount. It can be paid once, only for that amount, and closes itself
 * when it expires. The bill and property go in the notes so the webhook knows what the money is for.
 */
export async function createPaymentQr(keys: RazorpayKeys, { amountPaise, description, billId, tenantId }: Omit<LinkRequest, 'customer'>): Promise<PaymentQr> {
  const { keyId, keySecret } = keys;
  if (!Number.isInteger(amountPaise) || amountPaise < 100) throw new HttpError(400, 'An online payment must be at least ₹1');

  const closeBy = Math.floor(Date.now() / 1000) + QR_LIFETIME_SECONDS;
  let res: Response;
  try {
    res = await fetch(`${API}/payments/qr_codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(keyId, keySecret) },
      body: JSON.stringify({
        type: 'upi_qr',
        name: `Bill ${billId.slice(0, 8)}`,
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: amountPaise,
        description: description.slice(0, 200),
        close_by: closeBy,
        notes: { billId, tenantId },
      }),
    });
  } catch (error) {
    console.error('Razorpay unreachable', error);
    throw new HttpError(502, 'Could not reach Razorpay. Nothing was changed, please try again.');
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string; image_url?: string; error?: { description?: string } };
  if (!res.ok || !data.id || !data.image_url) {
    console.error('Razorpay refused the QR code', res.status, data.error?.description);
    // The account has no UPI (test mode never has it). Say so plainly: the billing screen then stops offering QR codes.
    if (res.status === 400 && /not enabled/i.test(data.error?.description ?? '')) throw new HttpError(409, QR_UNAVAILABLE_MESSAGE);
    throw new HttpError(502, 'Razorpay could not create the QR code. Nothing was changed.');
  }
  return { id: data.id, imageUrl: data.image_url, amount: amountPaise / 100, expiresAt: new Date(closeBy * 1000).toISOString() };
}

/**
 * Stops a QR from taking payment, for when staff close the dialog without waiting. Only a QR made for this
 * property can be closed here. Returns false when it could not be closed; it will still expire by itself.
 */
export async function closePaymentQr(keys: RazorpayKeys | null, qrId: string, tenantId: string): Promise<boolean> {
  if (!keys || !/^qr_[A-Za-z0-9]+$/.test(qrId)) return false;
  const { keyId, keySecret } = keys;
  try {
    const headers = { Authorization: authHeader(keyId, keySecret) };
    const found = await fetch(`${API}/payments/qr_codes/${qrId}`, { headers });
    const qr = (await found.json().catch(() => ({}))) as { notes?: { tenantId?: string } | null };
    if (!found.ok || qr.notes?.tenantId !== tenantId) return false;
    const closed = await fetch(`${API}/payments/qr_codes/${qrId}/close`, { method: 'POST', headers });
    return closed.ok;
  } catch (error) {
    console.error('Could not close Razorpay QR', error);
    return false;
  }
}

/** True only when `signature` is the HMAC-SHA256 of the exact raw body, keyed with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string | null | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
