import { pgTable, uuid, text, timestamp, boolean, integer, decimal, jsonb, index, uniqueIndex, unique, check, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Design rules for this schema
 *
 * 1. TENANT ISOLATION IN THE DATABASE.
 *    Every tenant-owned table has `tenant_id NOT NULL`, and every table that others point at has
 *    UNIQUE (tenant_id, id). Foreign keys between tenant-owned tables are COMPOSITE:
 *    (tenant_id, parent_id) -> parent (tenant_id, id). So a row can only ever reference a parent from
 *    its own tenant, even if application code has a bug. Queries filter on `tenant_id` directly.
 *
 * 2. ALLOWED VALUES are enforced by CHECK constraints. To add a status/role/type, change the code AND
 *    the check, then `npm run db:generate`.
 *
 * 3. DELETES. Order lines cascade with their order. Everything else refuses deletion while referenced
 *    (the API reports a clear 409). Composite foreign keys cannot "set null" one column, so code that
 *    deletes a table first clears orders.table_id (see api/tables).
 *
 * 4. TIME is `timestamptz` (an exact instant). "Today" is computed in the tenant's own time zone
 *    (tenants.timezone), never the server's.
 *
 * 5. MONEY is numeric(10,2).
 */

const tstz = (name: string) => timestamp(name, { withTimezone: true });

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
  timezone: text('timezone').notNull().default('Asia/Kolkata'), // IANA name; decides what "today" means
  deletedAt: tstz('deleted_at'), // soft delete: set instead of removing the row
  createdAt: tstz('created_at').defaultNow().notNull(),
  updatedAt: tstz('updated_at').defaultNow().notNull(),
}, (t) => [
  check('tenants_status_check', sql`${t.status} in ('active','suspended','pending')`),
  check('tenants_type_check', sql`${t.type} in ('hotel','restaurant','both')`),
  check('tenants_plan_check', sql`${t.plan} in ('basic','pro','enterprise')`),
]);

export const platformAuditLog = pgTable('platform_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminClerkId: text('admin_clerk_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  metadata: jsonb('metadata'),
  createdAt: tstz('created_at').defaultNow().notNull(),
});

// ============= PROPERTIES =============
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('properties_tenant_id_uq').on(t.tenantId, t.id),
]);

// ============= ROOMS =============
export const roomTypes = pgTable('room_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id').notNull(),
  name: text('name').notNull(),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
  maxOccupancy: integer('max_occupancy').notNull().default(2),
  amenities: jsonb('amenities').$type<string[]>(),
  description: text('description'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('room_types_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_room_types_property', columns: [t.tenantId, t.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  index('idx_room_types_property').on(t.propertyId),
  check('room_types_price_check', sql`${t.basePrice} >= 0`),
  check('room_types_occupancy_check', sql`${t.maxOccupancy} > 0`),
]);

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id').notNull(),
  roomTypeId: uuid('room_type_id').notNull(),
  roomNumber: text('room_number').notNull(),
  floor: integer('floor'),
  status: text('status').notNull().default('available'), // available, occupied, cleaning, maintenance, blocked
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('rooms_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_rooms_property', columns: [t.tenantId, t.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  foreignKey({ name: 'fk_rooms_room_type', columns: [t.tenantId, t.roomTypeId], foreignColumns: [roomTypes.tenantId, roomTypes.id] }),
  uniqueIndex('rooms_property_number_uq').on(t.propertyId, t.roomNumber),
  index('idx_rooms_room_type').on(t.roomTypeId),
  check('rooms_status_check', sql`${t.status} in ('available','occupied','cleaning','maintenance','blocked')`),
]);

// ============= GUESTS =============
export const guests = pgTable('guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  preferences: jsonb('preferences'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('guests_tenant_id_uq').on(t.tenantId, t.id),
  // One guest per email per tenant, ignoring letter case. Also makes find-or-create race-safe.
  uniqueIndex('guests_tenant_email_uq').on(t.tenantId, sql`lower(${t.email})`),
]);

// ============= BOOKINGS =============
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id').notNull(),
  roomId: uuid('room_id').notNull(),
  guestId: uuid('guest_id').notNull(),
  checkInDate: tstz('check_in_date').notNull(),
  checkOutDate: tstz('check_out_date').notNull(),
  numGuests: integer('num_guests').notNull().default(1),
  status: text('status').notNull().default('pending'), // pending, confirmed, checked_in, checked_out, cancelled
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).default('0'),
  specialRequests: text('special_requests'),
  source: text('source').default('online'), // online, walk_in, staff
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('bookings_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_bookings_property', columns: [t.tenantId, t.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  foreignKey({ name: 'fk_bookings_room', columns: [t.tenantId, t.roomId], foreignColumns: [rooms.tenantId, rooms.id] }),
  foreignKey({ name: 'fk_bookings_guest', columns: [t.tenantId, t.guestId], foreignColumns: [guests.tenantId, guests.id] }),
  index('idx_bookings_tenant_checkin').on(t.tenantId, t.checkInDate),
  index('idx_bookings_room_dates').on(t.roomId, t.checkInDate, t.checkOutDate),
  index('idx_bookings_guest').on(t.guestId),
  check('bookings_status_check', sql`${t.status} in ('pending','confirmed','checked_in','checked_out','cancelled')`),
  check('bookings_source_check', sql`${t.source} in ('online','walk_in','staff')`),
  check('bookings_dates_check', sql`${t.checkOutDate} > ${t.checkInDate}`),
  check('bookings_guests_check', sql`${t.numGuests} > 0`),
  check('bookings_total_check', sql`${t.totalAmount} >= 0`),
]);

// ============= RESTAURANTS =============
export const outlets = pgTable('outlets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  type: text('type').notNull().default('restaurant'), // restaurant, bar, cafe, room_service
  isActive: boolean('is_active').default(true),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('outlets_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_outlets_property', columns: [t.tenantId, t.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  // The guest QR link is /menu/<outlet slug>/<table>, so a slug must identify exactly one outlet.
  uniqueIndex('outlets_slug_uq').on(t.slug),
  index('idx_outlets_property').on(t.propertyId),
  check('outlets_type_check', sql`${t.type} in ('restaurant','bar','cafe','room_service')`),
]);

export const menuCategories = pgTable('menu_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  outletId: uuid('outlet_id').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('menu_categories_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_menu_categories_outlet', columns: [t.tenantId, t.outletId], foreignColumns: [outlets.tenantId, outlets.id] }),
  index('idx_menu_categories_outlet').on(t.outletId),
]);

export const menuItems = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  outletId: uuid('outlet_id').notNull(),
  categoryId: uuid('category_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  imageUrl: text('image_url'),
  tags: jsonb('tags').$type<string[]>(), // veg, vegan, spicy, etc
  isAvailable: boolean('is_available').default(true),
  variants: jsonb('variants'), // [{name: 'Small', price: 5}, {name: 'Large', price: 8}]
  sortOrder: integer('sort_order').default(0),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('menu_items_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_menu_items_outlet', columns: [t.tenantId, t.outletId], foreignColumns: [outlets.tenantId, outlets.id] }),
  foreignKey({ name: 'fk_menu_items_category', columns: [t.tenantId, t.categoryId], foreignColumns: [menuCategories.tenantId, menuCategories.id] }),
  index('idx_menu_items_outlet').on(t.outletId),
  index('idx_menu_items_category').on(t.categoryId),
  check('menu_items_price_check', sql`${t.price} >= 0`),
]);

export const tables = pgTable('tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  outletId: uuid('outlet_id').notNull(),
  tableNumber: text('table_number').notNull(),
  qrCode: text('qr_code'),
  capacity: integer('capacity').default(4),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('tables_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_tables_outlet', columns: [t.tenantId, t.outletId], foreignColumns: [outlets.tenantId, outlets.id] }),
  uniqueIndex('tables_outlet_number_uq').on(t.outletId, t.tableNumber),
]);

// ============= ORDERS =============
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  outletId: uuid('outlet_id').notNull(),
  tableId: uuid('table_id'),
  roomId: uuid('room_id'),
  guestId: uuid('guest_id'),
  billId: uuid('bill_id'), // set when the table is settled
  type: text('type').notNull().default('dine_in'), // dine_in, room_service
  // new -> acknowledged -> preparing -> ready -> served -> closed (billed). cancelled at any point.
  status: text('status').notNull().default('new'),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  specialInstructions: text('special_instructions'),
  createdAt: tstz('created_at').defaultNow().notNull(),
  updatedAt: tstz('updated_at').defaultNow().notNull(),
}, (t) => [
  unique('orders_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_orders_outlet', columns: [t.tenantId, t.outletId], foreignColumns: [outlets.tenantId, outlets.id] }),
  // Nullable links: a composite foreign key is not checked while any of its columns is NULL.
  foreignKey({ name: 'fk_orders_table', columns: [t.tenantId, t.tableId], foreignColumns: [tables.tenantId, tables.id] }),
  foreignKey({ name: 'fk_orders_room', columns: [t.tenantId, t.roomId], foreignColumns: [rooms.tenantId, rooms.id] }),
  foreignKey({ name: 'fk_orders_guest', columns: [t.tenantId, t.guestId], foreignColumns: [guests.tenantId, guests.id] }),
  foreignKey({ name: 'fk_orders_bill', columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id] }),
  index('idx_orders_outlet_status_created').on(t.tenantId, t.outletId, t.status, t.createdAt),
  index('idx_orders_table').on(t.tableId),
  index('idx_orders_bill').on(t.billId),
  check('orders_status_check', sql`${t.status} in ('new','acknowledged','preparing','ready','served','cancelled','closed')`),
  check('orders_type_check', sql`${t.type} in ('dine_in','room_service')`),
  check('orders_total_check', sql`${t.totalAmount} >= 0`),
]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  orderId: uuid('order_id').notNull(),
  menuItemId: uuid('menu_item_id').notNull(),
  quantity: integer('quantity').notNull().default(1),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  variant: text('variant'),
  notes: text('notes'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'fk_order_items_order', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  foreignKey({ name: 'fk_order_items_menu_item', columns: [t.tenantId, t.menuItemId], foreignColumns: [menuItems.tenantId, menuItems.id] }),
  index('idx_order_items_order').on(t.orderId),
  check('order_items_quantity_check', sql`${t.quantity} > 0`),
]);

// ============= BILLING =============
export const bills = pgTable('bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  bookingId: uuid('booking_id'),
  guestId: uuid('guest_id').notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).default('0'),
  status: text('status').notNull().default('open'), // open, paid, partial
  itemsBreakdown: jsonb('items_breakdown'),
  createdAt: tstz('created_at').defaultNow().notNull(),
  settledAt: tstz('settled_at'),
}, (t) => [
  unique('bills_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_bills_guest', columns: [t.tenantId, t.guestId], foreignColumns: [guests.tenantId, guests.id] }),
  foreignKey({ name: 'fk_bills_booking', columns: [t.tenantId, t.bookingId], foreignColumns: [bookings.tenantId, bookings.id] }),
  index('idx_bills_tenant_status').on(t.tenantId, t.status),
  index('idx_bills_guest').on(t.guestId),
  check('bills_status_check', sql`${t.status} in ('open','paid','partial')`),
  check('bills_total_check', sql`${t.totalAmount} >= 0`),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  billId: uuid('bill_id').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  method: text('method').notNull(), // cash, upi, card, stripe
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'fk_payments_bill', columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id] }),
  index('idx_payments_bill').on(t.billId),
  // A Stripe payment intent can back at most one payment row (webhook retries must not double-count).
  uniqueIndex('payments_stripe_intent_uq').on(t.stripePaymentIntentId).where(sql`${t.stripePaymentIntentId} is not null`),
  check('payments_method_check', sql`${t.method} in ('cash','upi','card','stripe')`),
  check('payments_amount_check', sql`${t.amount} > 0`),
]);

// ============= STAFF =============
export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id'),
  clerkId: text('clerk_id').notNull().unique(), // always a real Clerk user id (invitations live in staff_invites)
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // owner, manager, front_desk, waiter, kitchen
  isActive: boolean('is_active').default(true),
  createdAt: tstz('created_at').defaultNow().notNull(),
  updatedAt: tstz('updated_at').defaultNow().notNull(),
}, (t) => [
  unique('staff_tenant_id_uq').on(t.tenantId, t.id),
  foreignKey({ name: 'fk_staff_property', columns: [t.tenantId, t.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  check('staff_role_check', sql`${t.role} in ('owner','manager','front_desk','waiter','kitchen')`),
]);

/**
 * Pending invitations. The emailed link carries a random token; only its SHA-256 hash is stored,
 * so a database leak does not leak working invite links. Invites expire and are bound to an email.
 */
export const staffInvites = pgTable('staff_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // an invitation can never grant 'owner'
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: tstz('expires_at').notNull(),
  acceptedAt: tstz('accepted_at'),
  invitedBy: text('invited_by'), // Clerk id of the inviter
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('staff_invites_tenant_id_uq').on(t.tenantId, t.id),
  // At most one open invitation per email per tenant; re-inviting replaces it.
  uniqueIndex('staff_invites_open_email_uq').on(t.tenantId, sql`lower(${t.email})`).where(sql`${t.acceptedAt} is null`),
  check('staff_invites_role_check', sql`${t.role} in ('manager','front_desk','waiter','kitchen')`),
]);

// ============= WEBHOOKS =============
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  url: text('url').notNull(),
  events: jsonb('events').$type<string[]>(),
  secret: text('secret'),
  isActive: boolean('is_active').default(true),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  unique('webhooks_tenant_id_uq').on(t.tenantId, t.id),
]);

export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  webhookId: uuid('webhook_id').notNull(),
  event: text('event').notNull(),
  payload: jsonb('payload'),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'fk_webhook_logs_webhook', columns: [t.tenantId, t.webhookId], foreignColumns: [webhooks.tenantId, webhooks.id] }).onDelete('cascade'),
]);

// ============= UPI & NOTIFICATIONS =============
export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id'),
  source: text('source').notNull(), // webhook, notification
  sourceApp: text('source_app'),
  rawPayload: text('raw_payload').notNull(), // json format string
  parsedAmount: decimal('parsed_amount', { precision: 10, scale: 2 }),
  parsedReference: text('parsed_reference'),
  matchedBillId: uuid('matched_bill_id'),
  matchConfidence: text('match_confidence'), // exact, probable, unmatched
  deviceId: text('device_id'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'fk_payment_events_property', columns: [t.tenantId, t.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  foreignKey({ name: 'fk_payment_events_bill', columns: [t.tenantId, t.matchedBillId], foreignColumns: [bills.tenantId, bills.id] }),
  // The same UPI reference can only be recorded once per tenant. Race-proof de-duplication.
  uniqueIndex('payment_events_tenant_ref_uq').on(t.tenantId, t.parsedReference).where(sql`${t.parsedReference} is not null`),
  index('idx_payment_events_bill').on(t.matchedBillId),
  check('payment_events_source_check', sql`${t.source} in ('webhook','notification')`),
  check('payment_events_match_check', sql`${t.matchConfidence} in ('exact','probable','unmatched')`),
]);

export const upiPaymentIntents = pgTable('upi_payment_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  billId: uuid('bill_id'),
  pspProvider: text('psp_provider').notNull(), // razorpay, cashfree, phonepe_business
  pspIntentId: text('psp_intent_id').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').default('created').notNull(), // created, paid, expired, failed
  qrCodeUrl: text('qr_code_url'),
  createdAt: tstz('created_at').defaultNow().notNull(),
  expiresAt: tstz('expires_at'),
}, (t) => [
  foreignKey({ name: 'fk_upi_intents_bill', columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id] }),
]);

export const notificationListenerConfig = pgTable('notification_listener_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  staffId: uuid('staff_id'),
  deviceId: text('device_id').notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  whitelistedPackages: jsonb('whitelisted_packages').$type<string[]>(),
  lastActiveAt: tstz('last_active_at'),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'fk_listener_staff', columns: [t.tenantId, t.staffId], foreignColumns: [staff.tenantId, staff.id] }).onDelete('cascade'),
]);

// ============= RELATIONS (for db.query.* helpers) =============
// Relations are application-level hints for joins; the real constraints are the foreign keys above.
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

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
  room: one(rooms, { fields: [bookings.roomId], references: [rooms.id] }),
  guest: one(guests, { fields: [bookings.guestId], references: [guests.id] }),
  bills: many(bills),
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
  bill: one(bills, { fields: [orders.billId], references: [bills.id] }),
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
  orders: many(orders),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  bill: one(bills, { fields: [payments.billId], references: [bills.id] }),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  tenant: one(tenants, { fields: [staff.tenantId], references: [tenants.id] }),
  property: one(properties, { fields: [staff.propertyId], references: [properties.id] }),
}));
