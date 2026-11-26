'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  type: 'hotel' | 'restaurant' | 'both';
  plan: string;
  status: string;
  role: string;
  areas: 'hotel' | 'restaurant' | 'both';
  userName: string;
  isPlatformAdmin?: boolean;
  impersonating?: boolean;
  impersonateExpiresAt?: number | null;
  outlets: { id: string; name: string }[];
}

interface TenantContextValue {
  info: TenantInfo | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => { setInfo(data); setError(null); })
      .catch(err => setError(String(err)))
      .finally(() => setIsLoading(false));
  }, [tick]);

  useEffect(() => {
    const onRefresh = () => setTick((t) => t + 1);
    window.addEventListener('kipd:refresh', onRefresh);
    return () => window.removeEventListener('kipd:refresh', onRefresh);
  }, []);

  return (
    <TenantContext.Provider value={{ info, isLoading, error, reload: () => setTick(t => t + 1) }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantInfo(): TenantContextValue {
  const ctx = useContext(TenantContext);
  const [localInfo, setLocalInfo] = useState<TenantInfo | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (ctx) return;
    let active = true;
    setLocalLoading(true);
    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => { if (active) { setLocalInfo(data); setLocalError(null); } })
      .catch(err => { if (active) setLocalError(String(err)); })
      .finally(() => { if (active) setLocalLoading(false); });
    return () => { active = false; };
  }, [ctx]);

  if (ctx) return ctx;

  return {
    info: localInfo,
    isLoading: localLoading,
    error: localError,
    reload: () => {},
  };
}
