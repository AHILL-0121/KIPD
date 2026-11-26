import { createHmac, timingSafeEqual } from 'crypto';

export interface IcalEventInput {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  status?: string;
  created?: Date;
}

function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcalDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function formatIcalTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

/** Formats bookings into an RFC 5545 compliant VCALENDAR document. */
export function buildIcalCalendar(calendarName: string, events: IcalEventInput[]): string {
  const nowStamp = formatIcalTimestamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kipd//Hospitality Channel Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcalText(calendarName)}`,
  ];

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${formatIcalTimestamp(ev.created ?? new Date())}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(ev.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcalDate(ev.end)}`);
    lines.push(`SUMMARY:${escapeIcalText(ev.summary)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcalText(ev.description)}`);
    }
    if (ev.status) {
      lines.push(`STATUS:${ev.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`);
    }
    lines.push('TRANSP:OPAQUE');
    lines.push(`LAST-MODIFIED:${nowStamp}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function icalSecret(): string | null {
  return (
    process.env.ICAL_SYNC_SECRET ||
    process.env.PAYMENT_KEYS_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    null
  );
}

/** Signs a stable channel-manager iCal feed token bound to tenantId + propertyId. */
export function signIcalToken(tenantId: string, propertyId: string): string {
  const secret = icalSecret();
  if (!secret) throw new Error('Server secret not configured for iCal signing');
  return createHmac('sha256', secret).update(`ical:${tenantId}:${propertyId}`).digest('base64url');
}

export function verifyIcalToken(tenantId: string, propertyId: string, token: string | null): boolean {
  if (!token) return false;
  const secret = icalSecret();
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(`ical:${tenantId}:${propertyId}`).digest('base64url');
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
