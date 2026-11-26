import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { bills, orders, tables } from '@/db/schema';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { resolveOutlet } from '@/lib/public';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Finds the most recent unsettled bill settled from a table's QR orders so the guest can pay from the QR menu.
 */
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    await enforceRateLimit(request, 'pub-table-bill', 60, 60);
    const { outlet, tenant } = await resolveOutlet(params.slug);
    const tableId = request.nextUrl.searchParams.get('table');
    if (!tableId) return NextResponse.json({ billId: null });
    assertUuid(tableId, 'Table');

    const [table] = await db
      .select({ id: tables.id })
      .from(tables)
      .where(and(eq(tables.id, tableId), eq(tables.outletId, outlet.id), eq(tables.tenantId, tenant.id)))
      .limit(1);
    if (!table) throw notFound('Table');

    const recentBilledOrder = await db
      .select({ billId: orders.billId })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenant.id),
          eq(orders.tableId, table.id),
          isNotNull(orders.billId),
        ),
      )
      .orderBy(desc(orders.updatedAt))
      .limit(5);

    const billIds = recentBilledOrder.map((o) => o.billId).filter((id): id is string => Boolean(id));
    if (billIds.length === 0) return NextResponse.json({ billId: null });

    const [openBill] = await db
      .select({ id: bills.id, totalAmount: bills.totalAmount, paidAmount: bills.paidAmount, status: bills.status })
      .from(bills)
      .where(
        and(
          eq(bills.tenantId, tenant.id),
          inArray(bills.id, billIds),
          inArray(bills.status, ['open', 'partial']),
        ),
      )
      .orderBy(desc(bills.createdAt))
      .limit(1);

    if (!openBill) return NextResponse.json({ billId: null });

    return NextResponse.json({
      billId: openBill.id,
      status: openBill.status,
      remainingAmount: Math.max(0, Number(openBill.totalAmount) - Number(openBill.paidAmount ?? 0)),
    });
  } catch (error) {
    return handleError(error, 'Could not check table bill');
  }
}
