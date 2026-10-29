import { startOfDayInZone, startOfNextDayInZone, todayInZone, zonedDateTimeToInstant } from '@/lib/tz';

/**
 * Reporting periods, in the TENANT'S calendar (not the server's).
 * A period knows its own buckets, so a quiet day still shows as a zero instead of a gap in the chart.
 */
export type Range = 'day' | 'week' | 'month' | 'year';
export const RANGES: Range[] = ['day', 'week', 'month', 'year'];

export interface Bucket { key: string; label: string }
export interface Period {
  range: Range;
  /** What Postgres groups by, and how it prints the bucket so it matches `key` exactly. */
  sqlUnit: 'hour' | 'day' | 'month';
  sqlFormat: string;
  start: Date;
  end: Date;
  /** The equally long period immediately before, for "vs previous" comparisons. */
  prevStart: Date;
  prevEnd: Date;
  buckets: Bucket[];
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const label = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const midnight = (tz: string, date: string) => zonedDateTimeToInstant(tz, date, 0);

export function buildPeriod(range: Range, tz: string, now: Date = new Date()): Period {
  const today = todayInZone(tz, now);
  const end = startOfNextDayInZone(tz, now);

  if (range === 'day') {
    return {
      range, sqlUnit: 'hour', sqlFormat: 'YYYY-MM-DD HH24:00',
      start: startOfDayInZone(tz, now), end,
      prevStart: midnight(tz, addDays(today, -1)), prevEnd: startOfDayInZone(tz, now),
      buckets: Array.from({ length: 24 }, (_, h) => ({ key: `${today} ${String(h).padStart(2, '0')}:00`, label: `${String(h).padStart(2, '0')}:00` })),
    };
  }
  if (range === 'year') {
    const thisMonth = today.slice(0, 7);
    const first = addMonths(thisMonth, -11);
    return {
      range, sqlUnit: 'month', sqlFormat: 'YYYY-MM',
      start: midnight(tz, `${first}-01`), end,
      prevStart: midnight(tz, `${addMonths(thisMonth, -23)}-01`), prevEnd: midnight(tz, `${first}-01`),
      buckets: Array.from({ length: 12 }, (_, i) => { const ym = addMonths(first, i); return { key: ym, label: label(`${ym}-01`, { month: 'short' }) }; }),
    };
  }
  const days = range === 'week' ? 7 : 30;
  const first = addDays(today, -(days - 1));
  const labelOpts: Intl.DateTimeFormatOptions = range === 'week' ? { weekday: 'short' } : { day: 'numeric', month: 'short' };
  return {
    range, sqlUnit: 'day', sqlFormat: 'YYYY-MM-DD',
    start: midnight(tz, first), end,
    prevStart: midnight(tz, addDays(first, -days)), prevEnd: midnight(tz, first),
    buckets: Array.from({ length: days }, (_, i) => { const d = addDays(first, i); return { key: d, label: label(d, labelOpts) }; }),
  };
}

/** "+12.4% vs previous period", or null when there is nothing to compare with. */
export function changeText(current: number, previous: number): string | null {
  if (!(previous > 0)) return null;
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% vs previous period`;
}
