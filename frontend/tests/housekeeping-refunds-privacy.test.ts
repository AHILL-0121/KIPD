import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as roomsApi from '@/app/api/rooms/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as refundApi from '@/app/api/billing/[id]/refund/route';
import * as emailBillApi from '@/app/api/billing/[id]/email/route';
import * as tenantAuditApi from '@/app/api/audit-logs/route';
import * as adminAuditApi from '@/app/api/admin/audit/route';
import * as guestPrivacyApi from '@/app/api/guests/[id]/privacy/route';
import { buildInvoicePdf } from '@/lib/pdf';
import { sendEmail } from '@/lib/email';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';
import { testDb } from './helpers/db';
import { bills, platformAuditLog } from '@/db/schema';

const A = ids.A;
const B = ids.B;

beforeEach(resetAndSeed);

describe('housekeeping lifecycle & check-in guard', () => {
  it('supports dirty -> cleaning -> inspected -> available transitions and blocks check-in when dirty', async () => {
    loginAs('frontA');
    for (const status of ['dirty', 'cleaning', 'inspected', 'available']) {
      const res = await call(roomsApi.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, status } });
      expect(res.status).toBe(200);
    }

    // Marking room dirty blocks check-in with 409
    await call(roomsApi.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, status: 'dirty' } });
    const blockedCheckIn = await call(bookingById.PATCH, 'PATCH', `/api/bookings/${A.booking}`, {
      params: { id: A.booking },
      body: { action: 'check-in' },
    });
    expect(blockedCheckIn.status).toBe(409);
    expect(blockedCheckIn.json.error).toMatch(/dirty/i);

    // Marking room inspected then available permits check-in
    await call(roomsApi.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, status: 'available' } });
    const okCheckIn = await call(bookingById.PATCH, 'PATCH', `/api/bookings/${A.booking}`, {
      params: { id: A.booking },
      body: { action: 'check-in' },
    });
    expect(okCheckIn.status).toBe(200);
  });
});

describe('deposit refund records & tenant/admin audit logs', () => {
  it('records refunds up to paid amount, rejects overpayment, logs voids/refunds, and isolates by tenant', async () => {
    const stayBillId = '00000000-0000-4000-8000-000000000888';
    await testDb.insert(bills).values({
      id: stayBillId,
      tenantId: A.tenant,
      bookingId: A.booking,
      guestId: A.guest,
      kind: 'stay',
      totalAmount: '10000.00',
      paidAmount: '3000.00',
      status: 'partial',
    });

    // Cancel booking -> voids stay bill and logs bill.void
    loginAs('frontA');
    const cancelRes = await call(bookingById.PATCH, 'PATCH', `/api/bookings/${A.booking}`, {
      params: { id: A.booking },
      body: { action: 'cancel' },
    });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.json.refundDue).toBe(3000);

    // Tenant B cannot refund Tenant A's bill
    loginAs('ownerB');
    const crossRefund = await call(refundApi.POST, 'POST', `/api/billing/${stayBillId}/refund`, {
      params: { id: stayBillId },
      body: { amount: 1000, method: 'cash', reason: 'cross tenant probe' },
    });
    expect(crossRefund.status).toBe(404);

    // Front desk A records partial refund of 2000
    loginAs('frontA');
    const r1 = await call(refundApi.POST, 'POST', `/api/billing/${stayBillId}/refund`, {
      params: { id: stayBillId },
      body: { amount: 2000, method: 'upi', reference: 'UTR123', reason: 'Cancelled deposit partial refund' },
    });
    expect(r1.status).toBe(201);
    expect(r1.json.refund.amount).toBe(2000);

    // Over-refund (> remaining 1000) is refused atomically
    const r2 = await call(refundApi.POST, 'POST', `/api/billing/${stayBillId}/refund`, {
      params: { id: stayBillId },
      body: { amount: 1500, method: 'cash', reason: 'Over refund attempt' },
    });
    expect(r2.status).toBe(409);

    // Remaining 1000 succeeds
    const r3 = await call(refundApi.POST, 'POST', `/api/billing/${stayBillId}/refund`, {
      params: { id: stayBillId },
      body: { amount: 1000, method: 'cash', reason: 'Final deposit balance refund' },
    });
    expect(r3.status).toBe(201);

    // Waiter cannot read audit logs; manager/owner can see bill.void and bill.refund
    loginAs('waiterA');
    expect((await call(tenantAuditApi.GET, 'GET', '/api/audit-logs')).status).toBe(403);

    loginAs('ownerA');
    const logs = await call(tenantAuditApi.GET, 'GET', '/api/audit-logs');
    expect(logs.status).toBe(200);
    const actions = (logs.json as { action: string }[]).map((l) => l.action);
    expect(actions).toContain('bill.void');
    expect(actions).toContain('bill.refund');
  });

  it('restricts platform audit log endpoint to platform admins', async () => {
    await testDb.insert(platformAuditLog).values({
      adminClerkId: 'user_platform',
      action: 'tenant.create',
      targetType: 'tenant',
      targetId: A.tenant,
    });

    loginAs('ownerA');
    expect((await call(adminAuditApi.GET, 'GET', '/api/admin/audit')).status).toBe(403);

    loginAs('platformAdmin');
    const res = await call(adminAuditApi.GET, 'GET', '/api/admin/audit');
    expect(res.status).toBe(200);
    expect(res.json.length).toBeGreaterThanOrEqual(1);
  });
});

describe('guest PII export & anonymization (DPDP/GDPR)', () => {
  it('exports guest data within tenant and anonymizes PII while keeping financial records', async () => {
    loginAs('ownerA');
    const exp = await call(guestPrivacyApi.GET, 'GET', `/api/guests/${A.guest}/privacy`, { params: { id: A.guest } });
    expect(exp.status).toBe(200);
    expect(exp.json.guest.email).toBe('guest@a.test');
    expect(exp.json.bills.length).toBeGreaterThanOrEqual(1);

    // Cross-tenant export blocked
    const cross = await call(guestPrivacyApi.GET, 'GET', `/api/guests/${B.guest}/privacy`, { params: { id: B.guest } });
    expect(cross.status).toBe(404);

    // Anonymize wipes PII but leaves bill row intact
    const del = await call(guestPrivacyApi.DELETE, 'DELETE', `/api/guests/${A.guest}/privacy`, { params: { id: A.guest } });
    expect(del.status).toBe(200);
    const [guestRow] = await q<{ name: string; email: string }>(`select name, email from guests where id = '${A.guest}'`);
    expect(guestRow.name).toBe('Deleted Guest');
    expect(guestRow.email).toMatch(/@anonymized\.kipd\.local$/);
    const billRows = await q(`select id from bills where guest_id = '${A.guest}'`);
    expect(billRows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('invoice PDF generation & email attachment', () => {
  it('builds a valid PDF 1.4 buffer and attaches it when emailing an invoice', async () => {
    const buf = buildInvoicePdf({
      title: 'Invoice',
      documentNumber: 'INV/26-27/0001',
      issuedDate: '5 Nov 2026',
      seller: { name: 'SA STAY INN', email: 'hotel@test.com' },
      buyer: { name: 'Test Guest', placeOfSupply: 'Tamil Nadu' },
      stay: { roomNumber: '103', checkIn: '5 Nov 2026', checkOut: '6 Nov 2026', nights: 1 },
      lines: [{ description: 'Room 103 (Budget Single), 1 night', qty: 1, rate: 900, amount: 900 }],
      taxableAmount: 900,
      total: 900,
      paidTotal: 200,
      balanceDue: 700,
    });
    const text = buf.toString('latin1');
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
    expect(text).toContain('INV/26-27/0001');
    expect(text).toContain('SA STAY INN');

    vi.mocked(sendEmail).mockClear();
    loginAs('frontA');
    const res = await call(emailBillApi.POST, 'POST', `/api/billing/${A.bill}/email`, {
      params: { id: A.bill },
      body: { email: 'guest@example.com' },
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(sendEmail).mock.calls[0][0];
    expect(callArg.to).toBe('guest@example.com');
    expect(callArg.attachments).toHaveLength(1);
    expect(callArg.attachments![0].contentType).toBe('application/pdf');
    expect(callArg.attachments![0].filename).toMatch(/\.pdf$/);
    expect(Buffer.isBuffer(callArg.attachments![0].content)).toBe(true);
  });
});
