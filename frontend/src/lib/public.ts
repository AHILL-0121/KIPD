import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { outlets, properties, tenants } from '@/db/schema';
import { notFound } from '@/lib/http';

/**
 * Lookups for the PUBLIC guest pages (QR menu, hotel booking). These have no login, so:
 * - the tenant is found from a slug in the link, never from anything the caller sends;
 * - a suspended, deleted or switched-off business simply "does not exist" to guests;
 * - failures are one generic 404, so nobody can probe which slugs exist or why they are unavailable.
 */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function resolveOutlet(slug: string) {
  if (!SLUG.test(slug) || slug.length > 100) throw notFound('Menu');
  const [row] = await db
    .select({ outlet: outlets, tenant: tenants })
    .from(outlets)
    .innerJoin(tenants, eq(tenants.id, outlets.tenantId))
    .where(and(eq(outlets.slug, slug), eq(tenants.status, 'active'), isNull(tenants.deletedAt)))
    .limit(1);
  if (!row || row.outlet.isActive === false) throw notFound('Menu');
  return row;
}

export async function resolveHotel(slug: string) {
  if (!SLUG.test(slug) || slug.length > 100) throw notFound('Hotel');
  const [row] = await db
    .select({ tenant: tenants })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.status, 'active'), isNull(tenants.deletedAt)))
    .limit(1);
  if (!row || row.tenant.type === 'restaurant') throw notFound('Hotel');
  const [property] = await db.select().from(properties).where(eq(properties.tenantId, row.tenant.id)).orderBy(properties.createdAt).limit(1);
  if (!property) throw notFound('Hotel');
  return { tenant: row.tenant, property };
}
