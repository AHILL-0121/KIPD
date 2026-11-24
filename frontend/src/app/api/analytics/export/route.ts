import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { db } from '@/db';
import { bills, guests, menuCategories, menuItems, orderItems, orders } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { badRequest, handleError } from '@/lib/http';
import { RANGES, buildPeriod, type Range } from '@/lib/periods';

export const dynamic = 'force-dynamic';

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId, timezone } = await requireTenant(ROLES.manage);
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'sales';
    const asked = searchParams.get('range') as Range;
    const range: Range = RANGES.includes(asked) ? asked : 'month';
    const period = buildPeriod(range, timezone);

    if (type === 'sales') {
      const rows = await db
        .select({
          orderId: orders.id,
          createdAt: orders.createdAt,
          orderType: orders.type,
          itemName: menuItems.name,
          categoryName: menuCategories.name,
          quantity: orderItems.quantity,
          price: orderItems.price,
        })
        .from(orderItems)
        .innerJoin(orders, and(eq(orders.id, orderItems.orderId), eq(orders.tenantId, orderItems.tenantId)))
        .innerJoin(menuItems, and(eq(menuItems.id, orderItems.menuItemId), eq(menuItems.tenantId, orderItems.tenantId)))
        .leftJoin(menuCategories, and(eq(menuCategories.id, menuItems.categoryId), eq(menuCategories.tenantId, menuItems.tenantId)))
        .where(
          and(
            eq(orders.tenantId, tenantId),
            ne(orders.status, 'cancelled'),
            gte(orders.createdAt, period.start),
            lt(orders.createdAt, period.end),
          ),
        )
        .orderBy(desc(orders.createdAt));

      const headers = ['Order ID', 'Date', 'Time', 'Order Type', 'Item Name', 'Category', 'Quantity', 'Price (INR)', 'Total (INR)'];
      const csvLines = [headers.join(',')];

      for (const row of rows) {
        const d = new Date(row.createdAt);
        const dateStr = d.toISOString().split('T')[0];
        const timeStr = d.toISOString().split('T')[1].slice(0, 5);
        const unitPrice = Number(row.price);
        const lineTotal = (unitPrice * row.quantity).toFixed(2);

        csvLines.push(
          [
            escapeCsv(row.orderId.slice(0, 8).toUpperCase()),
            escapeCsv(dateStr),
            escapeCsv(timeStr),
            escapeCsv(row.orderType),
            escapeCsv(row.itemName),
            escapeCsv(row.categoryName || 'Uncategorized'),
            row.quantity,
            escapeCsv(unitPrice.toFixed(2)),
            escapeCsv(lineTotal),
          ].join(','),
        );
      }

      return new NextResponse(csvLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="kipd-sales-report-${range}.csv"`,
        },
      });
    }

    if (type === 'gst' || type === 'tax') {
      const rows = await db
        .select({
          id: bills.id,
          kind: bills.kind,
          invoiceNumber: bills.invoiceNumber,
          createdAt: bills.createdAt,
          totalAmount: bills.totalAmount,
          status: bills.status,
          guestName: guests.name,
          guestPhone: guests.phone,
        })
        .from(bills)
        .leftJoin(guests, and(eq(guests.id, bills.guestId), eq(guests.tenantId, bills.tenantId)))
        .where(
          and(
            eq(bills.tenantId, tenantId),
            ne(bills.status, 'void'),
            gte(bills.createdAt, period.start),
            lt(bills.createdAt, period.end),
          ),
        )
        .orderBy(desc(bills.createdAt));

      const headers = [
        'Bill / Invoice #',
        'Date',
        'Area / Kind',
        'Guest Name',
        'Guest Phone',
        'Total Amount (INR)',
        'Estimated Taxable (INR)',
        'Estimated CGST (INR)',
        'Estimated SGST (INR)',
        'Status',
      ];
      const csvLines = [headers.join(',')];

      for (const row of rows) {
        const d = new Date(row.createdAt);
        const dateStr = d.toISOString().split('T')[0];
        const total = Number(row.totalAmount);
        // Room standard GST is 12% (6% CGST + 6% SGST) or food standard 5% (2.5% CGST + 2.5% SGST)
        const rate = row.kind === 'stay' ? 0.12 : 0.05;
        const taxable = Number((total / (1 + rate)).toFixed(2));
        const totalGst = Number((total - taxable).toFixed(2));
        const cgst = (totalGst / 2).toFixed(2);
        const sgst = (totalGst / 2).toFixed(2);

        csvLines.push(
          [
            escapeCsv(row.invoiceNumber || row.id.slice(0, 8).toUpperCase()),
            escapeCsv(dateStr),
            escapeCsv(row.kind === 'stay' ? 'Hotel Stay' : 'Restaurant Dining'),
            escapeCsv(row.guestName || 'Guest'),
            escapeCsv(row.guestPhone || '-'),
            escapeCsv(total.toFixed(2)),
            escapeCsv(taxable.toFixed(2)),
            escapeCsv(cgst),
            escapeCsv(sgst),
            escapeCsv(row.status),
          ].join(','),
        );
      }

      return new NextResponse(csvLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="kipd-tax-report-${range}.csv"`,
        },
      });
    }

    throw badRequest('Unknown export type. Use ?type=sales or ?type=gst');
  } catch (error) {
    return handleError(error, 'Failed to export report');
  }
}
