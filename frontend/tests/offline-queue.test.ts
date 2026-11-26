import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearQueue,
  enqueueMutation,
  getQueue,
  removeFromQueue,
  replayQueue,
} from '@/lib/offline-queue';

describe('§12 offline POS queue', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });

  it('enqueues, reads, and removes mutations safely', () => {
    expect(getQueue()).toEqual([]);
    const a = enqueueMutation({ url: '/api/orders', method: 'POST', body: { tableId: 't1' }, label: 'Order 1' });
    const b = enqueueMutation({ url: '/api/orders/1', method: 'PATCH', body: { status: 'ready' }, label: 'Status' });

    expect(getQueue().map((m) => m.id)).toEqual([a.id, b.id]);
    removeFromQueue(a.id);
    expect(getQueue().map((m) => m.id)).toEqual([b.id]);
    clearQueue();
    expect(getQueue()).toEqual([]);
  });

  it('replays queued mutations in FIFO order and retains failed network calls', async () => {
    enqueueMutation({ url: '/api/orders', method: 'POST', body: { n: 1 }, label: 'First' });
    enqueueMutation({ url: '/api/orders', method: 'POST', body: { n: 2 }, label: 'Second' });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await replayQueue();
    expect(res).toEqual({ synced: 1, failed: 1, remaining: 1 });
    expect(getQueue()).toHaveLength(1);
    expect(getQueue()[0].label).toBe('Second');
  });
});
