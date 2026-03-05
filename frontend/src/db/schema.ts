import { pgTable, uuid, text, timestamp, boolean, integer, decimal, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============= TENANTS & PLATFORM =============
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull().default('both'), // hotel, restaurant, both
  ownerEmail: text('owner_email').notNull(),
  ownerClerkId: text('owner_clerk_id'),
  plan: text('plan').notNull().default('basic'), // basic, pro, enterprise
  status: text('status').notNull().default('active'), // active, suspended, pending
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const platformAuditLog = pgTable('platform_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminClerkId: text('admin_clerk_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= PROPERTIES =============
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= ROOMS =============
export const roomTypes = pgTable('room_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  name: text('name').notNull(),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
  maxOccupancy: integer('max_occupancy').notNull().default(2),
  amenities: jsonb('amenities').$type<string[]>(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  roomTypeId: uuid('room_type_id').notNull().references(() => roomTypes.id),
  roomNumber: text('room_number').notNull(),
  floor: integer('floor'),
  status: text('status').notNull().default('available'), // available, occupied, cleaning, maintenance, blocked
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= GUESTS =============
export const guests = pgTable('guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  preferences: jsonb('preferences'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= BOOKINGS =============
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  roomId: uuid('room_id').notNull().references(() => rooms.id),
  guestId: uuid('guest_id').notNull().references(() => guests.id),
  checkInDate: timestamp('check_in_date').notNull(),
  checkOutDate: timestamp('check_out_date').notNull(),
  numGuests: integer('num_guests').notNull().default(1),
  status: text('status').notNull().default('pending'), // pending, confirmed, checked_in, checked_out, cancelled
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).default('0'),
  specialRequests: text('special_requests'),
  source: text('source').default('online'), // online, walk_in, staff
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= RESTAURANTS =============
export const outlets = pgTable('outlets', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  type: text('type').notNull().default('restaurant'), // restaurant, bar, cafe, room_service
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const menuCategories = pgTable('menu_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const menuItems = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  categoryId: uuid('category_id').notNull().references(() => menuCategories.id),
  name: text('name').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  imageUrl: text('image_url'),
  tags: jsonb('tags').$type<string[]>(), // veg, vegan, spicy, etc
  isAvailable: boolean('is_available').default(true),
  variants: jsonb('variants'), // [{name: 'Small', price: 5}, {name: 'Large', price: 8}]
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tables = pgTable('tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  tableNumber: text('table_number').notNull(),
  qrCode: text('qr_code'),
  capacity: integer('capacity').default(4),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= ORDERS =============
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  tableId: uuid('table_id').references(() => tables.id),
  roomId: uuid('room_id').references(() => rooms.id),
  guestId: uuid('guest_id').references(() => guests.id),
  type: text('type').notNull().default('dine_in'), // dine_in, room_service
  status: text('status').notNull().default('new'), // new, acknowledged, preparing, ready, served, cancelled
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  specialInstructions: text('special_instructions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  menuItemId: uuid('menu_item_id').notNull().references(() => menuItems.id),
  quantity: integer('quantity').notNull().default(1),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  variant: text('variant'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= BILLING =============
export const bills = pgTable('bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id),
  guestId: uuid('guest_id').notNull().references(() => guests.id),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).default('0'),
  status: text('status').notNull().default('open'), // open, paid, partial
  itemsBreakdown: jsonb('items_breakdown'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  settledAt: timestamp('settled_at'),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  billId: uuid('bill_id').notNull().references(() => bills.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  method: text('method').notNull(), // cash, card, stripe
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= STAFF =============
export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id').references(() => properties.id),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // owner, manager, front_desk, waiter, kitchen
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= WEBHOOKS =============
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  url: text('url').notNull(),
  events: jsonb('events').$type<string[]>(),
  secret: text('secret'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').notNull().references(() => webhooks.id),
  event: text('event').notNull(),
  payload: jsonb('payload'),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============= RELATIONS =============
export const tenantsRelations = relations(tenants, ({ many }) => ({
  properties: many(properties),
  guests: many(guests),
  staff: many(staff),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  tenant: one(tenants, { fields: [properties.tenantId], references: [tenants.id] }),
  rooms: many(rooms),
  roomTypes: many(roomTypes),
  bookings: many(bookings),
  outlets: many(outlets),
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
  property: one(properties, { fields: [roomTypes.propertyId], references: [properties.id] }),
  rooms: many(rooms),
}));

export const roomsRelations = relations(rooms, ({ one }) => ({
  property: one(properties, { fields: [rooms.propertyId], references: [properties.id] }),
  roomType: one(roomTypes, { fields: [rooms.roomTypeId], references: [roomTypes.id] }),
}));

export const guestsRelations = relations(guests, ({ one }) => ({
  tenant: one(tenants, { fields: [guests.tenantId], references: [tenants.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
  room: one(rooms, { fields: [bookings.roomId], references: [rooms.id] }),
  guest: one(guests, { fields: [bookings.guestId], references: [guests.id] }),
}));

export const outletsRelations = relations(outlets, ({ one, many }) => ({
  property: one(properties, { fields: [outlets.propertyId], references: [properties.id] }),
  menuCategories: many(menuCategories),
  menuItems: many(menuItems),
  tables: many(tables),
  orders: many(orders),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  outlet: one(outlets, { fields: [menuCategories.outletId], references: [outlets.id] }),
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  outlet: one(outlets, { fields: [menuItems.outletId], references: [outlets.id] }),
  category: one(menuCategories, { fields: [menuItems.categoryId], references: [menuCategories.id] }),
}));

export const tablesRelations = relations(tables, ({ one }) => ({
  outlet: one(outlets, { fields: [tables.outletId], references: [outlets.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  outlet: one(outlets, { fields: [orders.outletId], references: [outlets.id] }),
  table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
  room: one(rooms, { fields: [orders.roomId], references: [rooms.id] }),
  guest: one(guests, { fields: [orders.guestId], references: [guests.id] }),
  orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  menuItem: one(menuItems, { fields: [orderItems.menuItemId], references: [menuItems.id] }),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  booking: one(bookings, { fields: [bills.bookingId], references: [bookings.id] }),
  guest: one(guests, { fields: [bills.guestId], references: [guests.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  bill: one(bills, { fields: [payments.billId], references: [bills.id] }),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  tenant: one(tenants, { fields: [staff.tenantId], references: [tenants.id] }),
  property: one(properties, { fields: [staff.propertyId], references: [properties.id] }),
}));
