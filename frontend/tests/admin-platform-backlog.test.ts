import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminAnalytics from '@/app/api/admin/analytics/route';
import * as adminAudit from '@/app/api/admin/audit/route';
import * as adminHealth from '@/app/api/admin/health/route';
import * as adminRequests from '@/app/api/admin/requests/route';
import * as adminRequestItem from '@/app/api/admin/requests/[id]/route';
import * as adminSettings from '@/app/api/admin/settings/route';
import * as adminStats from '@/app/api/admin/stats/route';
import * as adminSystem from '@/app/api/admin/system/route';
import * as adminTenantDetail from '@/app/api/admin/tenants/[id]/route';
import * as adminTenants from '@/app/api/admin/tenants/route';
import * as adminUserAction from '@/app/api/admin/users/[id]/route';
import * as clerkWebhook from '@/app/api/webhooks/clerk/route';
import * as contactAdmin from '@/app/api/contact-admin/route';
import * as announcementRoute from '@/app/api/platform/announcement/route';
import { formatKotEscPos, formatKotText, formatReceiptEscPos } from '@/lib/escpos';
import { clearPlatformConfigCache } from '@/lib/platform-config';
import { resetRateLimits } from '@/lib/rate-limit';
import { broadcastOrderUpdate, fetchRedisEventsSince, resetRealtimeRedisForTests } from '@/lib/realtime';
import { call, ids, loginAs, personas, q, resetAndSeed } from './helpers/harness';

const A = ids.A;

beforeEach(async () => {
  await resetAndSeed();
  resetRateLimits();
  clearPlatformConfigCache();
  resetRealtimeRedisForTests();
  process.env.CONTACT_ADMIN_EMAIL = 'admin@kipd.test';
});

afterEach(() => {
  delete process.env.CONTACT_ADMIN_EMAIL;
  delete process.env.CLERK_WEBHOOK_SECRET;
});

describe('access requests onboarding queue', () => {
  it('persists public /api/contact-admin leads, supports admin approve -> tenant creation and reject', async () => {
    loginAs(null);
    const submitRes = await contactAdmin.POST(
      new NextRequest('http://localhost/api/contact-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.44' },
        body: JSON.stringify({
          name: 'Ravi',
          email: 'ravi@sunsetresorts.in',
          company: 'Sunset Resorts',
          message: '25 rooms + restaurant',
        }),
      }),
    );
    expect(submitRes.status).toBe(200);

    // Non-admin blocked
    loginAs('ownerA');
    expect((await call(adminRequests.GET, 'GET', '/api/admin/requests')).status).toBe(403);

    // Platform admin views & approves
    loginAs('platformAdmin');
    const list = await call(adminRequests.GET, 'GET', '/api/admin/requests?status=pending');
    expect(list.status).toBe(200);
    expect(list.json.items).toHaveLength(1);
    const reqId = list.json.items[0].id as string;

    const approved = await call(adminRequestItem.POST, 'POST', `/api/admin/requests/${reqId}`, {
      params: { id: reqId },
      body: { slug: 'sunset-resorts', type: 'both', plan: 'pro' },
    });
    expect(approved.status).toBe(200);
    expect(approved.json.tenant.plan).toBe('pro');
    expect(approved.json.request.status).toBe('approved');

    // Duplicate approve refused
    const duplicate = await call(adminRequestItem.POST, 'POST', `/api/admin/requests/${reqId}`, {
      params: { id: reqId },
      body: { slug: 'sunset-resorts-2', type: 'both', plan: 'basic' },
    });
    expect(duplicate.status).toBe(409);

    // Reject path
    loginAs(null);
    await contactAdmin.POST(
      new NextRequest('http://localhost/api/contact-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.45' },
        body: JSON.stringify({ name: 'Spam', email: 'spam@example.com', company: 'Demo Co' }),
      }),
    );
    loginAs('platformAdmin');
    const pending2 = await call(adminRequests.GET, 'GET', '/api/admin/requests?status=pending');
    const reqId2 = pending2.json.items[0].id as string;
    const rej = await call(adminRequestItem.PATCH, 'PATCH', `/api/admin/requests/${reqId2}`, {
      params: { id: reqId2 },
      body: { action: 'reject', notes: 'Duplicate' },
    });
    expect(rej.status).toBe(200);
    expect(rej.json.request.status).toBe('rejected');
  });
});

describe('tenant details, editing, and soft-delete restore', () => {
  it('returns quota usage & metrics, allows editing metadata, and restores soft-deleted tenants', async () => {
    loginAs('platformAdmin');

    const detail = await call(adminTenantDetail.GET, 'GET', `/api/admin/tenants/${A.tenant}`, {
      params: { id: A.tenant },
    });
    expect(detail.status).toBe(200);
    expect(detail.json.usage.rooms).toBe(1);
    expect(detail.json.limits.rooms).toBe(15);
    expect(detail.json.metrics.bookingsCount).toBe(1);

    const edited = await call(adminTenantDetail.PATCH, 'PATCH', `/api/admin/tenants/${A.tenant}`, {
      params: { id: A.tenant },
      body: { name: 'Tenant A Updated', type: 'hotel' },
    });
    expect(edited.status).toBe(200);
    expect(edited.json.tenant.name).toBe('Tenant A Updated');

    // Soft-delete -> appears under status=deleted -> activate restores deleted_at = null
    expect((await call(adminTenantDetail.DELETE, 'DELETE', `/api/admin/tenants/${A.tenant}`, { params: { id: A.tenant } })).status).toBe(200);

    const archived = await call(adminTenants.GET, 'GET', '/api/admin/tenants?page=1&limit=10&status=deleted');
    expect(archived.status).toBe(200);
    expect(archived.json.items.map((t: { id: string }) => t.id)).toEqual([A.tenant]);

    const restored = await call(adminTenantDetail.PATCH, 'PATCH', `/api/admin/tenants/${A.tenant}`, {
      params: { id: A.tenant },
      body: { action: 'activate' },
    });
    expect(restored.status).toBe(200);
    expect(restored.json.tenant.deletedAt).toBeNull();
    expect(restored.json.tenant.status).toBe('active');
  });
});

describe('admin overview stats, health, analytics, audit, system, and settings', () => {
  it('supports detailed KPI stats, live health, GMV analytics, audit CSV export, and announcements/plans', async () => {
    loginAs('platformAdmin');

    const [statsRes, healthRes, analyticsRes, sysRes] = await Promise.all([
      call(adminStats.GET, 'GET', '/api/admin/stats?detailed=1'),
      call(adminHealth.GET, 'GET', '/api/admin/health'),
      call(adminAnalytics.GET, 'GET', '/api/admin/analytics'),
      call(adminSystem.GET, 'GET', '/api/admin/system'),
    ]);

    expect(statsRes.status).toBe(200);
    expect(statsRes.json.totalTenants).toBe(2);
    expect(statsRes.json.planCounts).toMatchObject({ basic: 2, pro: 0, enterprise: 0 });
    expect(healthRes.status).toBe(200);
    expect(healthRes.json.database.ok).toBe(true);
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.json.activity30d.bookingsCreated).toBe(2);
    expect(sysRes.status).toBe(200);
    expect(Array.isArray(sysRes.json.paymentEvents)).toBe(true);

    // Save announcement & custom INR plans
    const savedSettings = await call(adminSettings.PATCH, 'PATCH', '/api/admin/settings', {
      body: {
        announcement: {
          enabled: true,
          message: 'Scheduled backup tonight',
          tone: 'warning',
          linkUrl: null,
          linkLabel: null,
        },
        plans: {
          currency: 'INR',
          plans: {
            basic: { monthlyPrice: 1999, quotas: { rooms: 20, tables: 20, outlets: 2, staff: 15 } },
            pro: { monthlyPrice: 4999, quotas: { rooms: 80, tables: 60, outlets: 5, staff: 40 } },
            enterprise: { monthlyPrice: 9999, quotas: { rooms: null, tables: null, outlets: null, staff: null } },
          },
        },
      },
    });
    expect(savedSettings.status).toBe(200);

    const pubAnnouncement = await announcementRoute.GET();
    expect((await pubAnnouncement.json()).message).toBe('Scheduled backup tonight');

    const richAudit = await call(adminAudit.GET, 'GET', '/api/admin/audit?page=1&limit=10&action=platform.plans_update');
    expect(richAudit.status).toBe(200);
    expect(richAudit.json.items).toHaveLength(1);

    const csvRes = await call(adminAudit.GET, 'GET', '/api/admin/audit?format=csv');
    expect(csvRes.status).toBe(200);
    expect(csvRes.res.headers.get('content-type')).toContain('text/csv');

    // Prevent platform admin from banning themselves
    const selfBan = await call(adminUserAction.PATCH, 'PATCH', `/api/admin/users/${personas.platformAdmin}`, {
      params: { id: personas.platformAdmin },
      body: { action: 'ban' },
    });
    expect(selfBan.status).toBe(400);
  });
});

describe('Clerk webhook sync (/api/webhooks/clerk)', () => {
  const secretRaw = Buffer.from('test-clerk-webhook-secret-32bytes!').toString('base64');
  const webhookSecret = `whsec_${secretRaw}`;

  function signClerkEvent(body: string, tsSec: number, id = 'msg_123') {
    const sig = createHmac('sha256', Buffer.from(secretRaw, 'base64'))
      .update(`${id}.${tsSec}.${body}`)
      .digest('base64');
    return { 'svix-id': id, 'svix-timestamp': String(tsSec), 'svix-signature': `v1,${sig}` };
  }

  it('rejects invalid signatures and syncs staff updates & deletions on valid events', async () => {
    process.env.CLERK_WEBHOOK_SECRET = webhookSecret;

    const bad = await clerkWebhook.POST(
      new NextRequest('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        headers: { 'svix-id': 'msg_1', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,bad' },
        body: JSON.stringify({ type: 'user.updated', data: { id: personas.waiterA } }),
      }),
    );
    expect(bad.status).toBe(400);

    const updatePayload = JSON.stringify({
      type: 'user.updated',
      data: {
        id: personas.waiterA,
        first_name: 'Waiter',
        last_name: 'Renamed',
        primary_email_address_id: 'e1',
        email_addresses: [{ id: 'e1', email_address: 'waiter.new@a.test' }],
      },
    });
    const ts = Math.floor(Date.now() / 1000);
    const updRes = await clerkWebhook.POST(
      new NextRequest('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signClerkEvent(updatePayload, ts, 'msg_upd') },
        body: updatePayload,
      }),
    );
    expect(updRes.status).toBe(200);
    const [updatedStaff] = await q<{ name: string; email: string }>(
      `select name, email from staff where clerk_id = '${personas.waiterA}'`,
    );
    expect(updatedStaff).toEqual({ name: 'Waiter Renamed', email: 'waiter.new@a.test' });

    const deletePayload = JSON.stringify({ type: 'user.deleted', data: { id: personas.waiterA } });
    const delRes = await clerkWebhook.POST(
      new NextRequest('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signClerkEvent(deletePayload, ts, 'msg_del') },
        body: deletePayload,
      }),
    );
    expect(delRes.status).toBe(200);
    const [deactivated] = await q<{ is_active: boolean }>(
      `select is_active from staff where clerk_id = '${personas.waiterA}'`,
    );
    expect(deactivated.is_active).toBe(false);
  });
});

describe('realtime Upstash bridge and ESC/POS thermal formatting', () => {
  it('formats KOT text & ESC/POS bytes with control codes and cuts cleanly', () => {
    const kot = {
      propertyName: 'SA STAY INN',
      outletName: 'Main Kitchen',
      orderId: '12345678-abcd-ef01-2345-67890abcdef0',
      tableNumber: 'A1',
      source: 'guest',
      createdAt: new Date('2026-11-26T14:00:00Z'),
      specialInstructions: 'Less spicy',
      items: [{ name: 'Butter Chicken', quantity: 2, notes: 'Boneless' }],
    };
    const text = formatKotText(kot);
    expect(text).toContain('KOT: TABLE A1');
    expect(text).toContain('2x Butter Chicken');
    expect(text).toContain('GUEST QR ORDER');

    const bytes = formatKotEscPos(kot);
    expect(bytes[0]).toBe(0x1b); // ESC @ init
    expect(bytes[bytes.length - 4]).toBe(0x1d); // GS V cut

    const receiptBytes = formatReceiptEscPos({
      header: 'SA STAY INN',
      billId: 'bill-0001',
      date: new Date('2026-11-26T14:00:00Z'),
      lines: [{ label: 'Butter Chicken', qty: 1, total: '280.00' }],
      total: '280.00',
    });
    expect(receiptBytes[0]).toBe(0x1b);
  });

  it('gracefully handles broadcastOrderUpdate and fetchRedisEventsSince when Redis is unconfigured', async () => {
    broadcastOrderUpdate('outlet-1', { type: 'order.created' });
    const events = await fetchRedisEventsSince('outlet-1', 0);
    expect(events).toEqual([]);
  });
});
