import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { platformSettings } from '@/db/schema';
import { PLAN_LIMITS, type PlanQuotas, type PlanTier } from '@/lib/plan-limits';

export const ANNOUNCEMENT_KEY = 'announcement';
export const PLANS_KEY = 'plans';

export interface PlatformAnnouncement {
  enabled: boolean;
  message: string;
  tone: 'info' | 'warning';
  linkUrl: string | null;
  linkLabel: string | null;
  updatedAt?: string;
}

export interface PlanPricingConfig {
  currency: 'INR' | 'USD';
  plans: Record<PlanTier, {
    monthlyPrice: number;
    quotas: PlanQuotas;
  }>;
  updatedAt?: string;
}

export const DEFAULT_ANNOUNCEMENT: PlatformAnnouncement = {
  enabled: false,
  message: '',
  tone: 'info',
  linkUrl: null,
  linkLabel: null,
};

export const DEFAULT_PLAN_CONFIG: PlanPricingConfig = {
  currency: 'USD',
  plans: {
    basic: { monthlyPrice: 49, quotas: { ...PLAN_LIMITS.basic } },
    pro: { monthlyPrice: 149, quotas: { ...PLAN_LIMITS.pro } },
    enterprise: { monthlyPrice: 399, quotas: { ...PLAN_LIMITS.enterprise } },
  },
};

const g = globalThis as unknown as {
  __kipdAnnouncementCache?: { value: PlatformAnnouncement; expiresAt: number };
  __kipdPlansCache?: { value: PlanPricingConfig; expiresAt: number };
};

const CACHE_TTL_MS = 5_000;

export function clearPlatformConfigCache() {
  delete g.__kipdAnnouncementCache;
  delete g.__kipdPlansCache;
}

function parseAnnouncement(raw: unknown): PlatformAnnouncement {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const tone = obj.tone === 'warning' ? 'warning' : 'info';
  return {
    enabled: Boolean(obj.enabled),
    message: typeof obj.message === 'string' ? obj.message.trim() : '',
    tone,
    linkUrl: typeof obj.linkUrl === 'string' && obj.linkUrl.trim() ? obj.linkUrl.trim() : null,
    linkLabel: typeof obj.linkLabel === 'string' && obj.linkLabel.trim() ? obj.linkLabel.trim() : null,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
  };
}

function parseQuotas(raw: unknown, fallback: PlanQuotas): PlanQuotas {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const numOrNull = (val: unknown, def: number | null) => {
    if (val === null) return null;
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
  };
  return {
    rooms: numOrNull(obj.rooms, fallback.rooms),
    tables: numOrNull(obj.tables, fallback.tables),
    outlets: numOrNull(obj.outlets, fallback.outlets),
    staff: numOrNull(obj.staff, fallback.staff),
  };
}

function parsePlanConfig(raw: unknown): PlanPricingConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const currency = obj.currency === 'USD' ? 'USD' : 'INR';
  const rawPlans = obj.plans && typeof obj.plans === 'object' ? (obj.plans as Record<string, unknown>) : {};

  const parseTier = (tier: PlanTier) => {
    const def = DEFAULT_PLAN_CONFIG.plans[tier];
    const tObj = rawPlans[tier] && typeof rawPlans[tier] === 'object' ? (rawPlans[tier] as Record<string, unknown>) : {};
    const price = Number(tObj.monthlyPrice);
    return {
      monthlyPrice: Number.isFinite(price) && price >= 0 ? Math.round(price) : def.monthlyPrice,
      quotas: parseQuotas(tObj.quotas, def.quotas),
    };
  };

  return {
    currency,
    plans: {
      basic: parseTier('basic'),
      pro: parseTier('pro'),
      enterprise: parseTier('enterprise'),
    },
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
  };
}

export async function getPlatformAnnouncement(): Promise<PlatformAnnouncement> {
  const useCache = !process.env.VITEST;
  if (useCache && g.__kipdAnnouncementCache && g.__kipdAnnouncementCache.expiresAt > Date.now()) {
    return g.__kipdAnnouncementCache.value;
  }
  if (!process.env.DATABASE_URL && !process.env.VITEST) {
    return { ...DEFAULT_ANNOUNCEMENT };
  }
  try {
    const [row] = await db
      .select({ value: platformSettings.value, updatedAt: platformSettings.updatedAt })
      .from(platformSettings)
      .where(eq(platformSettings.key, ANNOUNCEMENT_KEY))
      .limit(1);
    const parsed = parseAnnouncement(row?.value);
    if (row?.updatedAt && !parsed.updatedAt) parsed.updatedAt = row.updatedAt.toISOString();
    if (useCache) g.__kipdAnnouncementCache = { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS };
    return parsed;
  } catch {
    return { ...DEFAULT_ANNOUNCEMENT };
  }
}

export async function setPlatformAnnouncement(
  input: Partial<PlatformAnnouncement>,
  adminClerkId: string,
): Promise<PlatformAnnouncement> {
  const existing = await getPlatformAnnouncement();
  const next: PlatformAnnouncement = {
    enabled: input.enabled ?? existing.enabled,
    message: input.message !== undefined ? input.message.trim() : existing.message,
    tone: input.tone === 'warning' ? 'warning' : input.tone === 'info' ? 'info' : existing.tone,
    linkUrl: input.linkUrl !== undefined ? (input.linkUrl?.trim() || null) : existing.linkUrl,
    linkLabel: input.linkLabel !== undefined ? (input.linkLabel?.trim() || null) : existing.linkLabel,
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(platformSettings)
    .values({
      key: ANNOUNCEMENT_KEY,
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
  clearPlatformConfigCache();
  return next;
}

export async function getPlanConfig(): Promise<PlanPricingConfig> {
  const useCache = !process.env.VITEST;
  if (useCache && g.__kipdPlansCache && g.__kipdPlansCache.expiresAt > Date.now()) {
    return g.__kipdPlansCache.value;
  }
  if (!process.env.DATABASE_URL && !process.env.VITEST) {
    return structuredClone(DEFAULT_PLAN_CONFIG);
  }
  try {
    const [row] = await db
      .select({ value: platformSettings.value, updatedAt: platformSettings.updatedAt })
      .from(platformSettings)
      .where(eq(platformSettings.key, PLANS_KEY))
      .limit(1);
    const parsed = parsePlanConfig(row?.value);
    if (row?.updatedAt && !parsed.updatedAt) parsed.updatedAt = row.updatedAt.toISOString();
    if (useCache) g.__kipdPlansCache = { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS };
    return parsed;
  } catch {
    return structuredClone(DEFAULT_PLAN_CONFIG);
  }
}

export async function setPlanConfig(
  input: { currency?: 'INR' | 'USD'; plans?: PlanPricingConfig['plans'] },
  adminClerkId: string,
): Promise<PlanPricingConfig> {
  const current = await getPlanConfig();
  const next: PlanPricingConfig = parsePlanConfig({
    currency: input.currency ?? current.currency,
    plans: input.plans ?? current.plans,
    updatedAt: new Date().toISOString(),
  });

  await db
    .insert(platformSettings)
    .values({
      key: PLANS_KEY,
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
  clearPlatformConfigCache();
  return next;
}
