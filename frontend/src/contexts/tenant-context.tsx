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
  outlets: { id: string; name: string }[];
}

interface TenantContextValue {
  info: TenantInfo | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

const TenantContext = createContext<TenantContextValue>({
  info: null, isLoading: true, error: null, reload: () => {},
});

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

  return (
    <TenantContext.Provider value={{ info, isLoading, error, reload: () => setTick(t => t + 1) }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenantInfo = () => useContext(TenantContext);
