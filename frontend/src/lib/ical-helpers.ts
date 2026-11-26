import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { properties } from '@/db/schema';
import { assertUuid, notFound } from '@/lib/http';

export async function firstProperty(tenantId: string) {
  const [prop] = await db
    .select()
    .from(properties)
    .where(eq(properties.tenantId, tenantId))
    .orderBy(properties.createdAt)
    .limit(1);
  return prop ?? null;
}

export async function ownedPropertyOrDefault(tenantId: string, id: string) {
  assertUuid(id, 'Property');
  const [prop] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.tenantId, tenantId)))
    .limit(1);
  if (!prop) throw notFound('Property');
  return prop;
}
