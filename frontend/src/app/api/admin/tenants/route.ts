import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { outlets, platformAuditLog, properties, staff, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { isValidTimeZone } from '@/lib/tz';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens').min(2).max(60),
  ownerEmail: z.string().trim().toLowerCase().email().max(200),
  type: z.enum(['hotel', 'restaurant', 'both']).optional().default('both'),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional().default('Asia/Kolkata'),
});


export async function GET() {
  try {
    await requirePlatformAdmin();
    // Soft-deleted tenants are hidden from the list (their data is kept).
    const all = await db.query.tenants.findMany({ where: isNull(tenants.deletedAt), orderBy: (t, { desc }) => [desc(t.createdAt)] });
    return NextResponse.json(all);
  } catch (error) {
    return handleError(error, 'Failed to fetch tenants');
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const { name, slug, ownerEmail, type, timezone } = await parseJson(request, schema);

    const [taken] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (taken) throw new HttpError(409, 'That slug is already in use. Choose another.');

    const [tenant] = await db.insert(tenants).values({
      name, slug, ownerEmail, type, timezone, plan: 'basic', status: 'active',
    }).returning();

    const [property] = await db.insert(properties).values({
      tenantId: tenant.id, name, email: ownerEmail,
    }).returning();

    if (type === 'restaurant' || type === 'both') {
      await db.insert(outlets).values({
        tenantId: tenant.id, propertyId: property.id, name: `${name} Restaurant`, slug: `${slug}-restaurant`, type: 'restaurant', isActive: true,
      });
    }

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId, action: 'tenant.create', targetType: 'tenant', targetId: tenant.id, metadata: { slug, type },
    });

    // Link the owner's login to the tenant.
    try {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured');
      const clerk = createClerkClient({ secretKey });

      const existing = await clerk.users.getUserList({ emailAddress: [ownerEmail] });
      if (existing.data.length > 0) {
        await clerk.users.updateUser(existing.data[0].id, { publicMetadata: { tenant_id: tenant.id } });
        return NextResponse.json({
          success: true, tenant, existingUser: true,
          message: `Tenant created and assigned to existing user ${ownerEmail}`,
        });
      }

      // New owner: send a Clerk invitation so they set their own password.
      try {
        await clerk.invitations.createInvitation({
          emailAddress: ownerEmail,
          publicMetadata: { tenant_id: tenant.id },
          redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sa-kipd.vercel.app'}/dashboard`,
          notify: true, // Clerk sends the email
        });
        return NextResponse.json({
          success: true, tenant,
          message: `Tenant created. An invitation email has been sent to ${ownerEmail}. They can sign up and get straight to their dashboard.`,
        });
      } catch (clerkError) {
        const detail = (clerkError as { errors?: { message?: string }[] }).errors?.[0]?.message;
        console.error('Owner invitation failed for tenant', tenant.id);
        return NextResponse.json({
          success: true, tenant,
          warning: `Tenant created, but the owner invitation could not be sent${detail ? `: ${detail}` : ''}. Use the Clerk dashboard to invite the owner manually.`,
        });
      }
    } catch (clerkError) {
      const detail = (clerkError as { errors?: { message?: string }[] }).errors?.[0]?.message;
      console.error('Owner login setup failed for tenant', tenant.id);
      return NextResponse.json({
        success: true, tenant,
        warning: `Tenant created, but the owner login could not be set up${detail ? `: ${detail}` : ''}. Invite the owner from the Clerk dashboard.`,
      });
    }
  } catch (error) {
    return handleError(error, 'Failed to create tenant');
  }
}
