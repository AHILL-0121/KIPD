/**
 * Offline POS queue — stores pending order/kitchen mutations in localStorage when offline
 * and replays them sequentially when connectivity returns.
 */

export interface QueuedMutation {
  id: string;
  url: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  label: string;
  createdAt: string;
}

const QUEUE_KEY = 'kipd:offline-queue';
export const OFFLINE_QUEUE_EVENT = 'kipd:offline-queue-change';

function notifyQueueChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
  }
}

export function getQueue(): QueuedMutation[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

export function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id' | 'createdAt'>,
): QueuedMutation {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const item: QueuedMutation = {
    ...mutation,
    id,
    createdAt: new Date().toISOString(),
  };
  const next = [...getQueue(), item];
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  }
  notifyQueueChange();
  return item;
}

export function removeFromQueue(id: string): void {
  const next = getQueue().filter((m) => m.id !== id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  }
  notifyQueueChange();
}

export function clearQueue(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(QUEUE_KEY);
  }
  notifyQueueChange();
}

/**
 * Replays queued mutations in FIFO order. Stops immediately if network fails again.
 */
export async function replayQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  const queue = getQueue();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // Drop both succeeded and invalid/duplicate 4xx items so poison items don't block the queue forever.
        removeFromQueue(item.id);
        if (res.ok) synced++;
        else failed++;
      } else {
        failed++;
        break;
      }
    } catch {
      failed++;
      break;
    }
  }

  return { synced, failed, remaining: getQueue().length };
}
