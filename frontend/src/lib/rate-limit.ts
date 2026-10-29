import { Redis } from '@upstash/redis';
import { HttpError } from '@/lib/http';

/**
 * Rate limiting for PUBLIC endpoints (guest menu, ordering, booking), where there is no login to identify
 * the caller. A fixed window per key: at most `limit` calls per `windowSec` seconds.
 *
 * - With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set, counts are shared by every server
 *   instance, so the limit holds on Vercel.
 * - Without them, counts live in this server process's memory. That still stops a single abusive
 *   client on one instance, but each serverless instance counts separately, so the real limit is looser.
 *   If Redis is configured but unreachable, it falls back to memory rather than blocking guests.
 */
type Window = { count: number; resetAt: number };
const memory = new Map<string, Window>();

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

export interface LimitResult { ok: boolean; remaining: number; retryAfterSec: number }

function memoryLimit(key: string, limit: number, windowSec: number, now: number): LimitResult {
  if (memory.size > 5000) for (const [k, w] of memory) if (w.resetAt <= now) memory.delete(k); // keep it bounded
  let w = memory.get(key);
  if (!w || w.resetAt <= now) { w = { count: 0, resetAt: now + windowSec * 1000 }; memory.set(key, w); }
  w.count += 1;
  return { ok: w.count <= limit, remaining: Math.max(0, limit - w.count), retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
}

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<LimitResult> {
  const now = Date.now();
  const client = getRedis();
  if (client) {
    try {
      const bucket = Math.floor(now / (windowSec * 1000));
      const k = `rl:${key}:${bucket}`;
      const count = await client.incr(k);
      if (count === 1) await client.expire(k, windowSec);
      return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec: windowSec - Math.floor((now % (windowSec * 1000)) / 1000) };
    } catch (error) {
      console.error('Rate limiter could not reach Redis; using memory', error);
    }
  }
  return memoryLimit(key, limit, windowSec, now);
}

/** The caller's address as the hosting platform reports it. Vercel sets x-forwarded-for itself. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip')) || 'unknown';
}

/** Throws a 429 (with Retry-After) when the caller is over the limit. */
export async function enforceRateLimit(request: Request, name: string, limit: number, windowSec: number, extraKey = '') {
  const result = await rateLimit(`${name}:${clientIp(request)}${extraKey ? ':' + extraKey : ''}`, limit, windowSec);
  if (!result.ok) {
    throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', { 'Retry-After': String(result.retryAfterSec) });
  }
}

/** For tests only. */
export function resetRateLimits() { memory.clear(); }
