import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, ne } from 'drizzle-orm';
import { db } from '@/db';
import { bills, payments, refunds } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

type FinanceRange = '7d' | '30d' | '90d' | 'all';

function startDateFor(range: FinanceRange): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  return new Date(Date.now() - days * 86_400_000);
}

/**
 * Unified financial ledger aggregating hotel stays and restaurant bills, payments by method, and refunds.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const param = request.nextUrl.searchParams.get('range') as FinanceRange | null;
    const range: FinanceRange = param && ['7d', '30d', '90d', 'all'].includes(param) ? param : '30d';
    const since = startDateFor(range);

    const billFilter = since
      ? and(eq(bills.tenantId, tenantId), ne(bills.status, 'void'), ne(bills.status, 'posted'), gte(bills.createdAt, since))
      : and(eq(bills.tenantId, tenantId), ne(bills.status, 'void'), ne(bills.status, 'posted'));

    const paymentFilter = since
      ? and(eq(payments.tenantId, tenantId), gte(payments.createdAt, since))
      : eq(payments.tenantId, tenantId);

    const refundFilter = since
      ? and(eq(refunds.tenantId, tenantId), gte(refunds.createdAt, since))
      : eq(refunds.tenantId, tenantId);

    const [billRows, paymentRows, refundRows] = await Promise.all([
      db.select().from(bills).where(billFilter),
      db.query.payments.findMany({
        where: paymentFilter,
        with: { bill: { with: { guest: true } } },
        orderBy: [desc(payments.createdAt)],
        limit: 100,
      }),
      db.query.refunds.findMany({
        where: refundFilter,
        with: { bill: { with: { guest: true } } },
        orderBy: [desc(refunds.createdAt)],
        limit: 50,
      }),
    ]);

    const stayBills = billRows.filter((b) => b.kind === 'stay');
    const restBills = billRows.filter((b) => b.kind === 'restaurant');
    const sumNum = (vals: Array<string | null | undefined>) => vals.reduce((acc, v) => acc + Number(v ?? 0), 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const hotelBilled = round2(sumNum(stayBills.map((b) => b.totalAmount)));
    const hotelCollected = round2(sumNum(stayBills.map((b) => b.paidAmount)));
    const restaurantBilled = round2(sumNum(restBills.map((b) => b.totalAmount)));
    const restaurantCollected = round2(sumNum(restBills.map((b) => b.paidAmount)));
    const totalRefunded = round2(sumNum(refundRows.map((r) => r.amount)));
    const totalCollected = round2(sumNum(paymentRows.map((p) => p.amount)));
    const netCollected = round2(totalCollected - totalRefunded);
    const outstanding = round2(Math.max(0, hotelBilled - hotelCollected + (restaurantBilled - restaurantCollected)));

    const methodMap = new Map<string, { method: string; amount: number; count: number }>();
    for (const p of paymentRows) {
      const curr = methodMap.get(p.method) ?? { method: p.method, amount: 0, count: 0 };
      curr.amount = round2(curr.amount + Number(p.amount));
      curr.count += 1;
      methodMap.set(p.method, curr);
    }

    const ledger = [
      ...paymentRows.map((p) => ({
        id: p.id,
        entryType: 'payment' as const,
        kind: p.bill?.kind ?? 'restaurant',
        guestName: p.bill?.guest?.name ?? 'Walk-in Guest',
        billId: p.billId,
        amount: Number(p.amount),
        method: p.method,
        reference: p.reference,
        receivedBy: p.receivedBy,
        note: p.note,
        createdAt: p.createdAt,
      })),
      ...refundRows.map((r) => ({
        id: r.id,
        entryType: 'refund' as const,
        kind: r.bill?.kind ?? 'stay',
        guestName: r.bill?.guest?.name ?? 'Guest',
        billId: r.billId,
        amount: -Number(r.amount),
        method: r.method,
        reference: r.reference,
        receivedBy: r.processedBy,
        note: r.reason,
        createdAt: r.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    return NextResponse.json({
      range,
      summary: {
        hotelBilled,
        hotelCollected,
        restaurantBilled,
        restaurantCollected,
        totalCollected,
        totalRefunded,
        netCollected,
        outstanding,
      },
      byMethod: Array.from(methodMap.values()).sort((a, b) => b.amount - a.amount),
      ledger,
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch financial ledger');
  }
}
