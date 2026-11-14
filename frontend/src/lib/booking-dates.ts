import { z } from 'zod';
import { zonedDateTimeToInstant } from '@/lib/tz';

/** A staff booking made for a calendar date starts and ends at the hotel's own check-in / check-out time. */
export const CHECK_IN_HOUR = 14, CHECK_OUT_HOUR = 11;

// zod still runs refinements on a string that failed the pattern, so this must not throw on anything.
const isRealDate = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

/** A calendar date (what the booking form sends) or a full instant. A date means the hotel's own check-in / check-out time. */
export const dateInput = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, 'Not a real date'),
  // A full date-time. A date-only string must not fall through to this branch: JavaScript reads 2032-02-30 as 1 March.
  z.string().regex(/^\d{4}-\d{2}-\d{2}T/).pipe(z.coerce.date()),
]);

export const toCheckIn = (v: string | Date, timeZone: string) => (typeof v === 'string' ? zonedDateTimeToInstant(timeZone, v, CHECK_IN_HOUR) : v);
export const toCheckOut = (v: string | Date, timeZone: string) => (typeof v === 'string' ? zonedDateTimeToInstant(timeZone, v, CHECK_OUT_HOUR) : v);
