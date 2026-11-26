import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import * as billing from '@/app/api/billing/route';
import * as splitBill from '@/app/api/billing/[id]/split/route';
import * as mergeOrders from '@/app/api/orders/merge/route';
import * as inventory from '@/app/api/inventory/route';
import * as inventoryById from '@/app/api/inventory/[id]/route';
import * as inventoryAlerts from '@/app/api/inventory/alerts/route';
import * as inventoryRecipes from '@/app/api/inventory/recipes/route';
import * as guestById from '@/app/api/guests/[id]/route';
import * as bookingsIcal from '@/app/api/bookings/export.ics/route';
import * as publicIcal from '@/app/api/public/ical/[propertyId]/route';
import * as publicPay from '@/app/api/public/pay/[billId]/route';
import * as impersonate from '@/app/api/admin/impersonate/[tenantId]/route';
import * as finance from '@/app/api/finance/route';
import { bills, orders, orderItems, platformAuditLog, staff, tables, tenants } from '@/db/schema';
import { signImpersonateToken, verifyImpersonateToken } from '@/lib/impersonate';
import { testDb } from './helpers/db';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A;
const B = ids.B;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(resetAndSeed);

describe('§2 optional cashier role', () => {
  it('accepts cashier in DB check constraint and restricts cashier to restaurant billing', async () => {
    const cashierClerk = 'user_cashierA';
    await testDb.insert(staff).values({
      id: uuid(301),
      tenantId: A.tenant,
      clerkId: cashierClerk,
      email: 'cashier@a.test',
      name: 'Cashier A',
      role: 'cashier',
      areas: 'both',
      isActive: true,
    });

    (globalThis as unknown as { __user?: string; authCache?: Map<string, unknown> }).__user = cashierClerk;
    (globalThis as unknown as { authCache?: Map<string, unknown> }).authCache?.clear();

    expect((await call(billing.GET, 'GET', '/api/billing?kind=restaurant')).status).toBe(200);
    expect((await call(billing.GET, 'GET', '/api/billing?kind=stay')).status).toBe(403);
    expect((await call(billing.GET, 'GET', '/api/billing')).status).toBe(403);
    expect((await call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: A.bill, paymentMethod: 'cash' } })).status).toBe(200);
  });
});

describe('§4 guest profile preferences & iCal sync', () => {
  it('fetches guest stay history and updates preferences/notes with tenant isolation', async () => {
    loginAs('frontA');
    const getRes = await call(guestById.GET, 'GET', `/api/guests/${A.guest}`, { params: { id: A.guest } });
    expect(getRes.status).toBe(200);
    expect(getRes.json.guest.name).toBe('Guest A');
    expect(getRes.json.bookings).toHaveLength(1);

    const patchRes = await call(guestById.PATCH, 'PATCH', `/api/guests/${A.guest}`, {
      params: { id: A.guest },
      body: { preferences: { Pillow: 'Feather', Floor: 'High' }, notes: 'Prefers quiet corner room' },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.guest.preferences).toEqual({ Pillow: 'Feather', Floor: 'High' });
    expect(patchRes.json.guest.notes).toBe('Prefers quiet corner room');

    // Cross-tenant isolation: Tenant A cannot read Tenant B guest
    const crossRes = await call(guestById.GET, 'GET', `/api/guests/${B.guest}`, { params: { id: B.guest } });
    expect(crossRes.status).toBe(404);
  });

  it('exports valid RFC 5545 iCal feed and protects public channel sync URL with HMAC token', async () => {
    loginAs('frontA');
    const feedRes = await call(bookingsIcal.GET, 'GET', '/api/bookings/export.ics?mode=feed-url');
    expect(feedRes.status).toBe(200);
    expect(feedRes.json.feedUrl).toContain(`/api/public/ical/${A.property}?token=`);

    const dlRes = await bookingsIcal.GET(new NextRequest('http://localhost/api/bookings/export.ics'));
    expect(dlRes.status).toBe(200);
    const icsText = await dlRes.text();
    expect(icsText).toContain('BEGIN:VCALENDAR');
    expect(icsText).toContain('BEGIN:VEVENT');
    expect(icsText).toContain('Guest A');

    // Public signed endpoint rejects bad token and serves anonymous room block with valid token
    loginAs(null);
    const badPub = await call(publicIcal.GET, 'GET', `/api/public/ical/${A.property}?token=badtoken`, {
      params: { propertyId: A.property },
    });
    expect(badPub.status).toBe(403);

    const token = new URL(feedRes.json.feedUrl).searchParams.get('token')!;
    const okPub = await publicIcal.GET(
      new NextRequest(`http://localhost/api/public/ical/${A.property}?token=${encodeURIComponent(token)}`),
      { params: { propertyId: A.property } },
    );
    expect(okPub.status).toBe(200);
    const pubText = await okPub.text();
    expect(pubText).toContain('Reserved');
    expect(pubText).not.toContain('Guest A');
  });
});

describe('§5 inventory, recipe costing, split bills & merge tables', () => {
  it('manages ingredients, low-stock alerts, and dish recipe unit costing', async () => {
    loginAs('ownerA');
    const createRes = await call(inventory.POST, 'POST', '/api/inventory', {
      body: { outletId: A.outlet, name: 'Basmati Rice', unit: 'kg', stockQty: 2, lowStockThreshold: 5, costPerUnit: 120 },
    });
    expect(createRes.status).toBe(201);
    const ingId = createRes.json.ingredient.id as string;
    expect(createRes.json.ingredient.lowStock).toBe(true);

    const alerts = await call(inventoryAlerts.GET, 'GET', '/api/inventory/alerts');
    expect(alerts.status).toBe(200);
    expect(alerts.json.some((i: { id: string }) => i.id === ingId)).toBe(true);

    const recipeRes = await call(inventoryRecipes.POST, 'POST', '/api/inventory/recipes', {
      body: { menuItemId: A.item, items: [{ ingredientId: ingId, quantityPerUnit: 0.25 }] },
    });
    expect(recipeRes.status).toBe(200);
    expect(recipeRes.json.unitCost).toBe(30); // 0.25 kg * ₹120

    // Restock above threshold clears alert
    const patchRes = await call(inventoryById.PATCH, 'PATCH', `/api/inventory/${ingId}`, {
      params: { id: ingId },
      body: { deltaQty: 10 },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.ingredient.stockQty).toBe(12);
    expect(patchRes.json.ingredient.lowStock).toBe(false);

    const delRes = await call(inventoryById.DELETE, 'DELETE', `/api/inventory/${ingId}`, {
      params: { id: ingId },
    });
    expect(delRes.status).toBe(200);
  });

  it('splits an open restaurant bill evenly without losing a paisa', async () => {
    loginAs('frontA');
    await testDb.update(bills).set({
      totalAmount: '100.01',
      itemsBreakdown: { subtotal: 95.25, cgst: 2.38, sgst: 2.38, total: 100.01, items: [{ name: 'Thali', qty: 1, rate: 95.25, amt: 95.25 }] },
    }).where(eq(bills.id, A.bill));

    const res = await call(splitBill.POST, 'POST', `/api/billing/${A.bill}/split`, {
      params: { id: A.bill },
      body: { mode: 'equal', parts: 2 },
    });
    expect(res.status).toBe(200);
    expect(res.json.bills).toHaveLength(2);
    const sum = res.json.bills.reduce((s: number, b: { totalAmount: number }) => s + b.totalAmount, 0);
    expect(Math.round(sum * 100)).toBe(10001);

    const orig = await q<{ status: string }>(`select status from bills where id = '${A.bill}'`);
    expect(orig[0].status).toBe('void');
  });

  it('merges open orders from a source table onto a target table and merges two orders directly', async () => {
    loginAs('waiterA');
    const t2 = uuid(401);
    const o2 = uuid(402);
    await testDb.insert(tables).values({ id: t2, tenantId: A.tenant, outletId: A.outlet, tableNumber: 'T-MERGE' });
    await testDb.insert(orders).values({ id: o2, tenantId: A.tenant, outletId: A.outlet, tableId: t2, status: 'new', totalAmount: '100.00' });
    await testDb.insert(orderItems).values({ tenantId: A.tenant, orderId: o2, menuItemId: A.item, quantity: 1, price: '100.00' });

    const mergeTableRes = await call(mergeOrders.POST, 'POST', '/api/orders/merge', {
      body: { sourceTableId: A.table, targetTableId: t2 },
    });
    expect(mergeTableRes.status).toBe(200);
    expect(mergeTableRes.json.movedOrders).toBe(1);

    const moved = await q<{ table_id: string }>(`select table_id from orders where id = '${A.order}'`);
    expect(moved[0].table_id).toBe(t2);

    // Direct order-into-order merge
    const mergeOrderRes = await call(mergeOrders.POST, 'POST', '/api/orders/merge', {
      body: { sourceOrderId: A.order, targetOrderId: o2 },
    });
    expect(mergeOrderRes.status).toBe(200);
    expect(mergeOrderRes.json.totalAmount).toBe(300); // 100 + 200
  });
});

describe('§6 public Pay at Table', () => {
  it('reads public bill without PII and creates direct UPI payment intent', async () => {
    await testDb.update(tenants).set({
      paymentSettings: { manualMethods: ['cash', 'upi'], onlinePayments: false, depositPercent: 0, directUpiQr: true, upiId: 'kipd@upi', upiName: 'Orchid' },
    }).where(eq(tenants.id, A.tenant));

    loginAs(null);
    const getRes = await call(publicPay.GET, 'GET', `/api/public/pay/${A.bill}`, { params: { billId: A.bill } });
    expect(getRes.status).toBe(200);
    expect(getRes.json.methods.directUpi).toBe(true);
    expect(getRes.json.directUpiUrl).toContain('upi://pay?');
    expect(JSON.stringify(getRes.json)).not.toContain('guest@a.test');

    const postRes = await call(publicPay.POST, 'POST', `/api/public/pay/${A.bill}`, {
      params: { billId: A.bill },
      body: { mode: 'upi_intent' },
    });
    expect(postRes.status).toBe(200);
    expect(postRes.json.mode).toBe('upi_intent');
    expect(decodeURIComponent(postRes.json.upiUrl)).toContain('kipd@upi');
  });
});

describe('§10 tenant impersonation & audit trail & §11 unified finance', () => {
  it('signs and verifies impersonation tokens and records platform audit trail', async () => {
    const token = await signImpersonateToken(A.tenant, 'user_platform');
    expect(await verifyImpersonateToken(token, 'user_platform')).toBe(A.tenant);
    expect(await verifyImpersonateToken(token, 'someone_else')).toBeNull();
    expect(await verifyImpersonateToken(`${token}tamper`, 'user_platform')).toBeNull();

    // Owner cannot call admin impersonate
    loginAs('ownerA');
    expect((await call(impersonate.POST, 'POST', `/api/admin/impersonate/${A.tenant}`, { params: { tenantId: A.tenant } })).status).toBe(403);

    // Platform admin can impersonate and writes audit log
    loginAs('platformAdmin');
    const res = await call(impersonate.POST, 'POST', `/api/admin/impersonate/${A.tenant}`, { params: { tenantId: A.tenant } });
    expect(res.status).toBe(200);
    expect(res.json.redirectUrl).toBe('/dashboard');
    const logs = await testDb.select().from(platformAuditLog).where(eq(platformAuditLog.targetId, A.tenant));
    expect(logs.some((l) => l.action === 'tenant.impersonate_start')).toBe(true);
  });

  it('returns unified finance ledger for owner/manager and blocks front desk', async () => {
    loginAs('frontA');
    expect((await call(finance.GET, 'GET', '/api/finance')).status).toBe(403);

    loginAs('ownerA');
    const res = await call(finance.GET, 'GET', '/api/finance?range=30d');
    expect(res.status).toBe(200);
    expect(res.json.summary).toHaveProperty('hotelCollected');
    expect(res.json.summary).toHaveProperty('restaurantCollected');
    expect(res.json.summary.outstanding).toBeGreaterThan(0);
  });
});
