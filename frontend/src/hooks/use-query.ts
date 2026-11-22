'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';

export interface UseQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useQuery<T>(url: string, deps: unknown[] = []): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch_ = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    apiFetch<T>(url, { signal: ctrl.signal })
      .then(d => { setData(d); setError(null); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message ?? 'Failed to load'); })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetch_(); return () => abortRef.current?.abort(); }, [fetch_, ...deps]);

  return { data, isLoading, error, refetch: fetch_ };
}

export interface UseMutationResult<TData, TInput> {
  mutate: (input: TInput) => Promise<TData>;
  isLoading: boolean;
  error: string | null;
}

export function useMutation<TData, TInput = unknown>(
  urlOrFn: string | ((input: TInput) => string),
  method: string = 'POST',
): UseMutationResult<TData, TInput> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (input: TInput): Promise<TData> => {
    setIsLoading(true);
    setError(null);
    try {
      const url = typeof urlOrFn === 'function' ? urlOrFn(input) : urlOrFn;
      return await apiFetch<TData>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [urlOrFn, method]);

  return { mutate, isLoading, error };
}
