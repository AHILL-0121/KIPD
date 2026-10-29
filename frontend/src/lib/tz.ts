/**
 * Time-zone helpers. "Today" must mean today for the HOTEL, not for the server.
 * Servers (Vercel) run in UTC, so `date.setHours(0,0,0,0)` made an Indian hotel's day
 * roll over at 05:30 instead of midnight.
 */

/** How far `timeZone` is ahead of UTC at this instant, in milliseconds (handles daylight saving). */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant that is 00:00 on the calendar day that `at` falls on in `timeZone`. */
export function startOfDayInZone(timeZone: string, at: Date = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(at).split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d);
  // Two passes settle the offset even when midnight is next to a daylight-saving change.
  let guess = localMidnightAsUtc - zoneOffsetMs(timeZone, new Date(localMidnightAsUtc));
  guess = localMidnightAsUtc - zoneOffsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

/** Midnight at the start of the NEXT calendar day in `timeZone`. */
export function startOfNextDayInZone(timeZone: string, at: Date = new Date()): Date {
  // 30 hours later is always on the next calendar day, even across a 23 or 25 hour day.
  return startOfDayInZone(timeZone, new Date(startOfDayInZone(timeZone, at).getTime() + 30 * 3_600_000));
}

/** A zone name that the runtime does not know would throw later; check once, at the edge. */
export function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true; } catch { return false; }
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` (YYYY-MM-DD) at `hour:minute`.
 * Used for check-in (14:00) and check-out (11:00), which are hotel-local times.
 */
export function zonedDateTimeToInstant(timeZone: string, date: string, hour = 0, minute = 0): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const wallAsUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], hour, minute);
  let guess = wallAsUtc - zoneOffsetMs(timeZone, new Date(wallAsUtc));
  guess = wallAsUtc - zoneOffsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

/** Today's date in `timeZone` as YYYY-MM-DD. */
export function todayInZone(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
