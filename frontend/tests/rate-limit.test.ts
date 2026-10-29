import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zonedDateTimeToInstant, todayInZone } from '@/lib/tz';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-29T10:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.doUnmock('@upstash/redis'); delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; });

const load = async () => (await import('@/lib/rate-limit'));

describe('rate limiter (in memory)', () => {
  it('allows up to the limit, then blocks with a sensible Retry-After', async () => {
    const { rateLimit } = await load();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit('k', 3, 60));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3].retryAfterSec).toBeGreaterThan(0);
    expect(results[3].retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('starts a fresh window when the time is up', async () => {
    const { rateLimit } = await load();
    for (let i = 0; i < 3; i++) await rateLimit('k', 3, 60);
    expect((await rateLimit('k', 3, 60)).ok).toBe(false);
    vi.setSystemTime(new Date('2026-10-29T10:01:01Z'));
    expect((await rateLimit('k', 3, 60)).ok).toBe(true);
  });

  it('keeps callers and rules independent', async () => {
    const { rateLimit } = await load();
    for (let i = 0; i < 3; i++) await rateLimit('a', 3, 60);
    expect((await rateLimit('a', 3, 60)).ok).toBe(false);
    expect((await rateLimit('b', 3, 60)).ok).toBe(true);
  });

  it('enforceRateLimit throws a 429 carrying Retry-After', async () => {
    const { enforceRateLimit } = await load();
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    await enforceRateLimit(req, 'r', 1, 60);
    await expect(enforceRateLimit(req, 'r', 1, 60)).rejects.toMatchObject({ status: 429, headers: { 'Retry-After': expect.stringMatching(/^\d+$/) } });
  });

  it('reads the caller from x-forwarded-for (first address), then x-real-ip', async () => {
    const { clientIp } = await load();
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } }))).toBe('9.9.9.9');
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '8.8.8.8' } }))).toBe('8.8.8.8');
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});

describe('rate limiter (shared Redis)', () => {
  it('counts in Redis when configured, so the limit holds across server instances', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 't';
    const counts = new Map<string, number>(); const expired: string[] = [];
    vi.doMock('@upstash/redis', () => ({ Redis: class { async incr(k: string) { counts.set(k, (counts.get(k) ?? 0) + 1); return counts.get(k)!; } async expire(k: string) { expired.push(k); } } }));
    const { rateLimit } = await load();
    expect((await rateLimit('shared', 2, 60)).ok).toBe(true);
    expect((await rateLimit('shared', 2, 60)).ok).toBe(true);
    expect((await rateLimit('shared', 2, 60)).ok).toBe(false);
    expect(counts.size).toBe(1);
    expect(expired).toHaveLength(1); // the key is given an expiry once, so it cleans itself up
  });

  it('falls back to memory (and still limits) if Redis is down, instead of blocking guests or failing open', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 't';
    vi.doMock('@upstash/redis', () => ({ Redis: class { async incr() { throw new Error('connection refused'); } async expire() {} } }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rateLimit } = await load();
    expect((await rateLimit('x', 1, 60)).ok).toBe(true);
    expect((await rateLimit('x', 1, 60)).ok).toBe(false);
    spy.mockRestore();
  });
});

describe('hotel-local times', () => {
  it('turns a wall-clock time at the hotel into the right instant', () => {
    expect(zonedDateTimeToInstant('Asia/Kolkata', '2026-10-29', 14).toISOString()).toBe('2026-10-29T08:30:00.000Z');
    expect(zonedDateTimeToInstant('Asia/Kolkata', '2026-10-29', 11).toISOString()).toBe('2026-10-29T05:30:00.000Z');
    expect(zonedDateTimeToInstant('UTC', '2026-10-29', 14).toISOString()).toBe('2026-10-29T14:00:00.000Z');
    // New York is on summer time (UTC-4) before 1 Nov 2026 and winter time (UTC-5) after
    expect(zonedDateTimeToInstant('America/New_York', '2026-10-31', 11).toISOString()).toBe('2026-10-31T15:00:00.000Z');
    expect(zonedDateTimeToInstant('America/New_York', '2026-11-02', 11).toISOString()).toBe('2026-11-02T16:00:00.000Z');
  });

  it('rejects malformed dates and reports today in the hotel\'s zone', () => {
    expect(() => zonedDateTimeToInstant('UTC', '2026/10/29')).toThrow();
    expect(todayInZone('Asia/Kolkata', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-30'); // already tomorrow in India
    expect(todayInZone('UTC', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-29');
  });
});
