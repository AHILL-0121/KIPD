import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth';
import { db } from '@/db';
import { tenants, properties, outlets } from '@/db/schema';
import { createClerkClient } from '@clerk/backend';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const allTenants = await db.query.tenants.findMany({
      orderBy: (tenants, { desc }) => [desc(tenants.createdAt)],
    });

    return NextResponse.json(allTenants);
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const body = await request.json();
    const { name, slug, ownerEmail, type } = body;

    // Validate input
    if (!name || !slug || !ownerEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const tenantType = ['hotel', 'restaurant', 'both'].includes(type) ? type : 'both';

    // Create tenant in database
    const [tenant] = await db.insert(tenants).values({
      name,
      slug,
      ownerEmail,
      type: tenantType,
      plan: 'standard',
      status: 'active',
    }).returning();

    console.log('✅ Tenant created in database:', tenant.id);

    // Auto-create a default property for the tenant
    const [property] = await db.insert(properties).values({
      tenantId: tenant.id,
      name: name,
      email: ownerEmail,
    }).returning();
    console.log('✅ Default property created:', property.id);

    // Auto-create a default outlet for restaurant/both types
    if (tenantType === 'restaurant' || tenantType === 'both') {
      const [outlet] = await db.insert(outlets).values({
        propertyId: property.id,
        name: `${name} Restaurant`,
        slug: `${slug}-restaurant`,
        type: 'restaurant',
        isActive: true,
      }).returning();
      console.log('✅ Default outlet created:', outlet.id);
    }

    // Create owner user in Clerk with default password
    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (!clerkSecretKey) {
        throw new Error('CLERK_SECRET_KEY not configured');
      }

      const clerk = createClerkClient({ secretKey: clerkSecretKey });

      // Check if user already exists
      const existingUsers = await clerk.users.getUserList({ 
        emailAddress: [ownerEmail] 
      });

      if (existingUsers.data && existingUsers.data.length > 0) {
        // User exists, just update their metadata to assign tenant
        const userId = existingUsers.data[0].id;
        await clerk.users.updateUser(userId, {
          publicMetadata: {
            tenant_id: tenant.id,
          },
        });
        console.log('✅ Updated existing user with tenant ID:', userId);
        
        return NextResponse.json({ 
          success: true, 
          tenant,
          existingUser: true,
          message: `Tenant created and assigned to existing user ${ownerEmail}`
        });
      } else {
        // Create new user with default password
        const defaultPassword = `Kipd${Math.random().toString(36).slice(2, 10)}@2026`;
        
        const newUser = await clerk.users.createUser({
          emailAddress: [ownerEmail],
          password: defaultPassword,
          publicMetadata: {
            tenant_id: tenant.id,
          },
          skipPasswordRequirement: false,
          skipPasswordChecks: false,
        });
        
        console.log('✅ User created:', newUser.id);
        console.log('✅ Email:', ownerEmail);
        console.log('✅ Default password:', defaultPassword);

        return NextResponse.json({ 
          success: true, 
          tenant,
          credentials: {
            email: ownerEmail,
            password: defaultPassword,
          },
          message: `Tenant created! User account created for ${ownerEmail}`
        });
      }

    } catch (clerkError: any) {
      console.error('Clerk error:', clerkError);
      console.error('Error details:', clerkError.errors);
      
      // Tenant was created, but invitation failed
      return NextResponse.json({ 
        success: true, 
        tenant,
        warning: `Tenant created but failed to send invitation: ${clerkError.errors?.[0]?.message || 'Unknown error'}. You can invite the user manually from Clerk Dashboard.`
      });
    }

  } catch (error) {
    console.error('Create tenant error:', error);
    return NextResponse.json(
      { error: 'Failed to create tenant' },
      { status: 500 }
    );
  }
}
