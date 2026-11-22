import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from '@/lib/api';

describe('data-fetching layer (apiFetch)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves parsed json on 200 ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '123', name: 'Test Dish' }),
    }));

    const result = await apiFetch<{ id: string; name: string }>('/api/menu');
    expect(result).toEqual({ id: '123', name: 'Test Dish' });
  });

  it('throws ApiError with error message from body when not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden access' }),
    }));

    await expect(apiFetch('/api/protected')).rejects.toThrow('Forbidden access');
    try {
      await apiFetch('/api/protected');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(403);
    }
  });

  it('throws ApiError with fallback message when json parsing fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    }));

    await expect(apiFetch('/api/crash')).rejects.toThrow('HTTP 500');
  });

  it('forwards options like headers and signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    await apiFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
      signal: controller.signal,
    }));
  });
});
