import { Redis } from '@upstash/redis';

/**
 * Real-time pub/sub for live screens (KDS, orders, billing).
 * - Always delivers instantaneously to in-process SSE clients.
 * - When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, publishes
 *   to a bounded per-channel Redis list (`kipd:rt:<channel>`) so other serverless
 *   instances receive updates within ~1s.
 */
type Client = { controller: ReadableStreamDefaultController; channel: string; seen: Set<string> };

export interface RealtimeEnvelope {
  id: string;
  ts: number;
  payload: unknown;
}

const g = globalThis as unknown as {
  __kipdSse?: Map<string, Client>;
  __kipdRealtimeRedis?: Redis | null;
};
const clients: Map<string, Client> = (g.__kipdSse ??= new Map());

const encoder = new TextEncoder();
const REDIS_PREFIX = 'kipd:rt:';
const REDIS_TTL_SEC = 120;
const REDIS_MAX_EVENTS = 50;

export function getRealtimeRedis(): Redis | null {
  if (g.__kipdRealtimeRedis !== undefined) return g.__kipdRealtimeRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  g.__kipdRealtimeRedis = url && token ? new Redis({ url, token }) : null;
  return g.__kipdRealtimeRedis;
}

export function resetRealtimeRedisForTests() {
  delete g.__kipdRealtimeRedis;
}

export function registerClient(channel: string, controller: ReadableStreamDefaultController): string {
  const id = crypto.randomUUID();
  clients.set(id, { controller, channel, seen: new Set() });
  return id;
}

export function unregisterClient(id: string) {
  clients.delete(id);
}

export function send(controller: ReadableStreamDefaultController, payload: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

export function heartbeat(controller: ReadableStreamDefaultController) {
  controller.enqueue(encoder.encode(`: keep-alive\n\n`));
}

function deliverLocal(channel: string, envelope: RealtimeEnvelope) {
  const data = encoder.encode(`data: ${JSON.stringify(envelope.payload)}\n\n`);
  for (const [id, client] of clients) {
    if (client.channel !== channel) continue;
    if (client.seen.has(envelope.id)) continue;
    client.seen.add(envelope.id);
    if (client.seen.size > 200) {
      const first = client.seen.values().next().value;
      if (first) client.seen.delete(first);
    }
    try {
      client.controller.enqueue(data);
    } catch {
      clients.delete(id);
    }
  }
}

/** Deliver to local clients and publish asynchronously to Redis when configured. */
export function broadcastOrderUpdate(channel: string, payload: unknown) {
  const envelope: RealtimeEnvelope = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    payload,
  };
  deliverLocal(channel, envelope);

  const redis = getRealtimeRedis();
  if (!redis) return;

  const key = `${REDIS_PREFIX}${channel}`;
  const serialized = JSON.stringify(envelope);
  void Promise.resolve()
    .then(async () => {
      await redis.lpush(key, serialized);
      await redis.ltrim(key, 0, REDIS_MAX_EVENTS - 1);
      await redis.expire(key, REDIS_TTL_SEC);
    })
    .catch((err) => {
      console.error('Realtime Redis publish failed:', err);
    });
}

/** Reads recent Redis envelopes for `channel` newer than `sinceTs`, oldest-first. */
export async function fetchRedisEventsSince(channel: string, sinceTs: number): Promise<RealtimeEnvelope[]> {
  const redis = getRealtimeRedis();
  if (!redis) return [];
  try {
    const rawList = await redis.lrange<string>(`${REDIS_PREFIX}${channel}`, 0, 25);
    const events: RealtimeEnvelope[] = [];
    for (const entry of rawList) {
      try {
        const parsed = (typeof entry === 'string' ? JSON.parse(entry) : entry) as RealtimeEnvelope;
        if (parsed && typeof parsed.ts === 'number' && parsed.ts > sinceTs && parsed.id) {
          events.push(parsed);
        }
      } catch {
        /* ignore malformed entry */
      }
    }
    events.sort((a, b) => a.ts - b.ts);
    return events;
  } catch {
    return [];
  }
}

export function flushEventsToClient(clientId: string, events: RealtimeEnvelope[]) {
  const client = clients.get(clientId);
  if (!client) return;
  for (const ev of events) {
    if (client.seen.has(ev.id)) continue;
    client.seen.add(ev.id);
    try {
      send(client.controller, ev.payload);
    } catch {
      clients.delete(clientId);
      break;
    }
  }
}
