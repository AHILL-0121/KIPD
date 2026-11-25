import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { platformSettings } from '@/db/schema';

export const MAINTENANCE_KEY = 'maintenance';
export const DEFAULT_MAINTENANCE_MESSAGE =
  'Kipd is currently undergoing scheduled maintenance. Normal operations will resume shortly.';

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  estimatedEnd: string | null;
  updatedAt?: string;
}

const g = globalThis as unknown as {
  __kipdMaintenanceCache?: { state: MaintenanceState; expiresAt: number };
};

const CACHE_TTL_MS = 5_000;

export function clearMaintenanceCache() {
  delete g.__kipdMaintenanceCache;
}

function parseState(raw: unknown): MaintenanceState {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: Boolean(obj.enabled),
    message:
      typeof obj.message === 'string' && obj.message.trim()
        ? obj.message.trim()
        : DEFAULT_MAINTENANCE_MESSAGE,
    estimatedEnd: typeof obj.estimatedEnd === 'string' && obj.estimatedEnd.trim() ? obj.estimatedEnd.trim() : null,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
  };
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return {
      enabled: true,
      message: process.env.MAINTENANCE_MESSAGE?.trim() || DEFAULT_MAINTENANCE_MESSAGE,
      estimatedEnd: null,
    };
  }

  const useCache = !process.env.VITEST;
  if (useCache && g.__kipdMaintenanceCache && g.__kipdMaintenanceCache.expiresAt > Date.now()) {
    return g.__kipdMaintenanceCache.state;
  }

  if (!process.env.DATABASE_URL && !process.env.VITEST) {
    return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE, estimatedEnd: null };
  }

  try {
    const [row] = await db
      .select({ value: platformSettings.value, updatedAt: platformSettings.updatedAt })
      .from(platformSettings)
      .where(eq(platformSettings.key, MAINTENANCE_KEY))
      .limit(1);

    const parsed = parseState(row?.value);
    if (row?.updatedAt && !parsed.updatedAt) {
      parsed.updatedAt = row.updatedAt.toISOString();
    }
    if (useCache) {
      g.__kipdMaintenanceCache = { state: parsed, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return parsed;
  } catch {
    return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE, estimatedEnd: null };
  }
}

export async function setMaintenanceState(
  input: { enabled: boolean; message?: string; estimatedEnd?: string | null },
  adminClerkId: string,
): Promise<MaintenanceState> {
  const existing = await getMaintenanceState();
  const next: MaintenanceState = {
    enabled: input.enabled,
    message:
      input.message !== undefined
        ? input.message.trim() || DEFAULT_MAINTENANCE_MESSAGE
        : existing.message,
    estimatedEnd: input.estimatedEnd !== undefined ? input.estimatedEnd : existing.estimatedEnd,
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(platformSettings)
    .values({
      key: MAINTENANCE_KEY,
      value: next as unknown as Record<string, unknown>,
      updatedBy: adminClerkId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value: next as unknown as Record<string, unknown>,
        updatedBy: adminClerkId,
        updatedAt: new Date(),
      },
    });

  clearMaintenanceCache();
  return next;
}
