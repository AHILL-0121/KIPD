import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import {
  bills,
  bookings,
  guests,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  outlets,
  properties,
  rooms,
  roomTypes,
  tables,
  tenants,
} from '../src/db/schema';

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('Refusing to seed when NODE_ENV=production. Pass --force if intentional.');
    process.exit(1);
  }

  const slug = 'demo-stay';
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existing) {
    console.log(`Seed skipped: tenant "${slug}" (${existing.id}) already exists.`);
    process.exit(0);
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: 'Kipd Demo Grand',
      slug,
      type: 'both',
      ownerEmail: 'demo-owner@kipd.local',
      plan: 'pro',
      status: 'active',
      timezone: 'Asia/Kolkata',
    })
    .returning();

  const [property] = await db
    .insert(properties)
    .values({
      tenantId: tenant.id,
      name: 'Kipd Demo Grand',
      email: 'demo-owner@kipd.local',
      address: '42 MG Road, Bengaluru',
    })
    .returning();

  const [mainDining, rooftopBar] = await db
    .insert(outlets)
    .values([
      {
        tenantId: tenant.id,
        propertyId: property.id,
        name: 'Main Dining',
        slug: `${slug}-dining`,
        type: 'restaurant',
        isActive: true,
      },
      {
        tenantId: tenant.id,
        propertyId: property.id,
        name: 'Rooftop Bar',
        slug: `${slug}-rooftop`,
        type: 'bar',
        isActive: true,
      },
    ])
    .returning();

  const [deluxe, suite] = await db
    .insert(roomTypes)
    .values([
      { tenantId: tenant.id, propertyId: property.id, name: 'Deluxe Room', basePrice: '3200.00', maxOccupancy: 2 },
      { tenantId: tenant.id, propertyId: property.id, name: 'Executive Suite', basePrice: '5800.00', maxOccupancy: 4 },
    ])
    .returning();

  const [r101] = await db
    .insert(rooms)
    .values([
      { tenantId: tenant.id, propertyId: property.id, roomTypeId: deluxe.id, roomNumber: '101', floor: 1, status: 'occupied' },
      { tenantId: tenant.id, propertyId: property.id, roomTypeId: deluxe.id, roomNumber: '102', floor: 1, status: 'available' },
      { tenantId: tenant.id, propertyId: property.id, roomTypeId: deluxe.id, roomNumber: '103', floor: 1, status: 'cleaning' },
      { tenantId: tenant.id, propertyId: property.id, roomTypeId: suite.id, roomNumber: '201', floor: 2, status: 'available' },
    ])
    .returning();

  const [t1] = await db
    .insert(tables)
    .values([
      { tenantId: tenant.id, outletId: mainDining.id, tableNumber: 'T1', capacity: 4, section: 'Indoor' },
      { tenantId: tenant.id, outletId: mainDining.id, tableNumber: 'T2', capacity: 2, section: 'Window' },
      { tenantId: tenant.id, outletId: rooftopBar.id, tableNumber: 'R1', capacity: 6, section: 'Terrace' },
    ])
    .returning();

  const [starters, drinks] = await db
    .insert(menuCategories)
    .values([
      { tenantId: tenant.id, outletId: mainDining.id, name: 'Mains', sortOrder: 1 },
      { tenantId: tenant.id, outletId: rooftopBar.id, name: 'Beverages', sortOrder: 1 },
    ])
    .returning();

  const [biryani] = await db
    .insert(menuItems)
    .values([
      { tenantId: tenant.id, outletId: mainDining.id, categoryId: starters.id, name: 'Hyderabadi Biryani', price: '380.00', isAvailable: true },
      { tenantId: tenant.id, outletId: mainDining.id, categoryId: starters.id, name: 'Paneer Tikka', price: '290.00', isAvailable: true },
      { tenantId: tenant.id, outletId: rooftopBar.id, categoryId: drinks.id, name: 'Fresh Lime Soda', price: '120.00', isAvailable: true },
    ])
    .returning();

  const [guest] = await db
    .insert(guests)
    .values({
      tenantId: tenant.id,
      name: 'Aarav Sharma',
      email: 'aarav@example.com',
      phone: '+91 9876543210',
    })
    .returning();

  const checkIn = new Date();
  const checkOut = new Date(Date.now() + 2 * 86_400_000);
  const [booking] = await db
    .insert(bookings)
    .values({
      tenantId: tenant.id,
      propertyId: property.id,
      roomId: r101.id,
      guestId: guest.id,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      numGuests: 2,
      status: 'checked_in',
      source: 'staff',
      totalAmount: '6400.00',
    })
    .returning();

  await db.insert(bills).values({
    tenantId: tenant.id,
    kind: 'stay',
    bookingId: booking.id,
    guestId: guest.id,
    totalAmount: '6400.00',
    paidAmount: '0.00',
    status: 'open',
    itemsBreakdown: {
      items: [{ description: 'Deluxe Room 101, 2 nights', quantity: 2, unitPrice: 3200, amount: 6400 }],
      subtotal: 6400,
      tax: 0,
      taxRate: 0,
      total: 6400,
    },
  });

  const [order] = await db
    .insert(orders)
    .values({
      tenantId: tenant.id,
      outletId: mainDining.id,
      tableId: t1.id,
      type: 'dine_in',
      status: 'preparing',
      source: 'staff',
      totalAmount: '380.00',
    })
    .returning();

  await db.insert(orderItems).values({
    tenantId: tenant.id,
    orderId: order.id,
    menuItemId: biryani.id,
    quantity: 1,
    price: '380.00',
  });

  console.log(`Seeded local demo tenant "${tenant.name}" (slug: ${tenant.slug}, id: ${tenant.id}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
