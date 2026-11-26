import { createClerkClient } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { outlets, platformAuditLog, properties, tenants } from '@/db/schema';
import { HttpError } from '@/lib/http';
import type { PlanTier } from '@/lib/plan-limits';

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  ownerEmail: string;
  type: 'hotel' | 'restaurant' | 'both';
  timezone: string;
  plan?: PlanTier;
  adminClerkId: string;
}

export interface ProvisionTenantResult {
  tenant: typeof tenants.$inferSelect;
  existingUser?: boolean;
  message?: string;
  warning?: string;
}

export async function provisionTenantAndInviteOwner(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const { name, slug, ownerEmail, type, timezone, adminClerkId } = input;
  const plan = input.plan ?? 'basic';

  const [taken] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (taken) throw new HttpError(409, 'That slug is already in use. Choose another.');

  const [tenant] = await db
    .insert(tenants)
    .values({ name, slug, ownerEmail, type, timezone, plan, status: 'active' })
    .returning();

  const [property] = await db
    .insert(properties)
    .values({ tenantId: tenant.id, name, email: ownerEmail })
    .returning();

  if (type === 'restaurant' || type === 'both') {
    await db.insert(outlets).values({
      tenantId: tenant.id,
      propertyId: property.id,
      name: `${name} Restaurant`,
      slug: `${slug}-restaurant`,
      type: 'restaurant',
      isActive: true,
    });
  }

  await db.insert(platformAuditLog).values({
    adminClerkId,
    action: 'tenant.create',
    targetType: 'tenant',
    targetId: tenant.id,
    metadata: { slug, type, plan, tenantName: name },
  });

  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured');
    const clerk = createClerkClient({ secretKey });

    const existing = await clerk.users.getUserList({ emailAddress: [ownerEmail] });
    if (existing.data.length > 0) {
      await clerk.users.updateUser(existing.data[0].id, { publicMetadata: { tenant_id: tenant.id } });
      return {
        tenant,
        existingUser: true,
        message: `Tenant created and assigned to existing user ${ownerEmail}`,
      };
    }

    try {
      await clerk.invitations.createInvitation({
        emailAddress: ownerEmail,
        publicMetadata: { tenant_id: tenant.id },
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sa-kipd.vercel.app'}/dashboard`,
        notify: true,
      });
      return {
        tenant,
        message: `Tenant created. An invitation email has been sent to ${ownerEmail}. They can sign up and get straight to their dashboard.`,
      };
    } catch (clerkError) {
      const detail = (clerkError as { errors?: { message?: string }[] }).errors?.[0]?.message;
      console.error('Owner invitation failed for tenant', tenant.id);
      return {
        tenant,
        warning: `Tenant created, but the owner invitation could not be sent${detail ? `: ${detail}` : ''}. Use the Clerk dashboard to invite the owner manually.`,
      };
    }
  } catch (clerkError) {
    const detail = (clerkError as { errors?: { message?: string }[] }).errors?.[0]?.message;
    console.error('Owner login setup failed for tenant', tenant.id);
    return {
      tenant,
      warning: `Tenant created, but the owner login could not be set up${detail ? `: ${detail}` : ''}. Invite the owner from the Clerk dashboard.`,
    };
  }
}

export async function inviteTenantOwnerInClerk(tenantId: string, ownerEmail: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured');
  const clerk = createClerkClient({ secretKey });

  const existing = await clerk.users.getUserList({ emailAddress: [ownerEmail] });
  if (existing.data.length > 0) {
    await clerk.users.updateUser(existing.data[0].id, { publicMetadata: { tenant_id: tenantId } });
    return { existingUser: true as const };
  }

  const inv = await clerk.invitations.createInvitation({
    emailAddress: ownerEmail,
    publicMetadata: { tenant_id: tenantId },
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sa-kipd.vercel.app'}/dashboard`,
    notify: true,
  });
  return { existingUser: false as const, invitationId: inv.id };
}
