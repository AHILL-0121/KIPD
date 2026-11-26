import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, orders } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, badRequest, forbidden, handleError, parseJson } from '@/lib/http';
import { ownedBill } from '@/lib/tenant-scope';
import { writeTenantAudit } from '@/lib/audit';

const equalSplitSchema = z.object({
  mode: z.literal('equal'),
  parts: z.number().int().min(2).max(10),
});

const itemSplitSchema = z.object({
  mode: z.literal('items'),
  splits: z.array(z.object({
    label: z.string().trim().max(60).optional(),
    itemIndices: z.array(z.number().int().min(0)).min(1),
  })).min(2).max(10),
});

const splitSchema = z.union([equalSplitSchema, itemSplitSchema]);

interface BreakdownLine {
  name: string;
  qty: number;
  rate: number;
  amt: number;
}

interface BillBreakdown {
  subtotal?: number;
  cgst?: number;
  sgst?: number;
  total?: number;
  items?: BreakdownLine[];
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireTenant(ROLES.billing, 'restaurant');
    const bill = await ownedBill(ctx.tenantId, params.id);
    if (ctx.role === 'cashier' && bill.kind !== 'restaurant') throw forbidden();
    if (bill.kind !== 'restaurant') throw badRequest('Only restaurant bills can be split.');
    if (bill.status !== 'open') throw new HttpError(409, 'Only open bills can be split.');
    if (Number(bill.paidAmount ?? 0) > 0) throw new HttpError(409, 'Bills with recorded payments cannot be split.');

    const body = await parseJson(request, splitSchema);
    const totalPaise = Math.round(Number(bill.totalAmount) * 100);
    if (totalPaise < 200) throw new HttpError(409, 'Bill total is too small to split.');

    const breakdown = (bill.itemsBreakdown as BillBreakdown | null) ?? {};
    const items = Array.isArray(breakdown.items) ? breakdown.items : [];

    type SplitPayload = { totalPaise: number; breakdown: Record<string, unknown> };
    const splitPayloads: SplitPayload[] = [];

    if (body.mode === 'equal') {
      const basePaise = Math.floor(totalPaise / body.parts);
      const remainder = totalPaise - basePaise * body.parts;
      const origSubtotal = Number(breakdown.subtotal ?? bill.totalAmount);
      const origCgst = Number(breakdown.cgst ?? 0);
      const origSgst = Number(breakdown.sgst ?? 0);

      for (let i = 0; i < body.parts; i++) {
        const sharePaise = basePaise + (i < remainder ? 1 : 0);
        const ratio = sharePaise / totalPaise;
        splitPayloads.push({
          totalPaise: sharePaise,
          breakdown: {
            splitFromBillId: bill.id,
            splitLabel: `Split ${i + 1} of ${body.parts}`,
            subtotal: Math.round(origSubtotal * ratio * 100) / 100,
            cgst: Math.round(origCgst * ratio * 100) / 100,
            sgst: Math.round(origSgst * ratio * 100) / 100,
            total: sharePaise / 100,
            items: i === 0 ? items : [{ name: `Shared table portion (${i + 1}/${body.parts})`, qty: 1, rate: sharePaise / 100, amt: sharePaise / 100 }],
          },
        });
      }
    } else {
      if (items.length === 0) throw badRequest('This bill has no itemized lines to split by item.');

      const seen = new Set<number>();
      for (const group of body.splits) {
        for (const idx of group.itemIndices) {
          if (idx >= items.length) throw badRequest(`Invalid item index ${idx}`);
          if (seen.has(idx)) throw badRequest('Each item can only belong to one split bill.');
          seen.add(idx);
        }
      }
      if (seen.size !== items.length) {
        throw badRequest('Assign every line item to one of the split bills.');
      }

      const taxRate = Number(breakdown.subtotal) > 0
        ? (Number(breakdown.cgst ?? 0) + Number(breakdown.sgst ?? 0)) / Number(breakdown.subtotal)
        : 0.05;

      let allocatedPaise = 0;
      body.splits.forEach((group, idx) => {
        const groupItems = group.itemIndices.map((i) => items[i]);
        const sub = groupItems.reduce((s, l) => s + Number(l.amt), 0);
        const cgst = Math.round(sub * (taxRate / 2) * 100) / 100;
        const sgst = Math.round(sub * (taxRate / 2) * 100) / 100;

        let sharePaise: number;
        if (idx === body.splits.length - 1) {
          sharePaise = totalPaise - allocatedPaise;
        } else {
          sharePaise = Math.round((sub + cgst + sgst) * 100);
          allocatedPaise += sharePaise;
        }
        if (sharePaise <= 0) throw badRequest('Each split bill must have a positive amount.');

        splitPayloads.push({
          totalPaise: sharePaise,
          breakdown: {
            splitFromBillId: bill.id,
            splitLabel: group.label || `Split ${idx + 1}`,
            subtotal: Math.round(sub * 100) / 100,
            cgst,
            sgst,
            total: sharePaise / 100,
            items: groupItems,
          },
        });
      });
    }

    const newIds = splitPayloads.map(() => crypto.randomUUID());

    await db.batch([
      db.insert(bills).values(
        splitPayloads.map((sp, i) => ({
          id: newIds[i],
          tenantId: ctx.tenantId,
          guestId: bill.guestId,
          kind: 'restaurant',
          totalAmount: (sp.totalPaise / 100).toFixed(2),
          paidAmount: '0',
          status: 'open',
          itemsBreakdown: sp.breakdown,
        })),
      ),
      db
        .update(bills)
        .set({
          status: 'void',
          itemsBreakdown: {
            ...(typeof bill.itemsBreakdown === 'object' && bill.itemsBreakdown ? bill.itemsBreakdown : {}),
            splitInto: newIds,
          },
        })
        .where(and(eq(bills.id, bill.id), eq(bills.tenantId, ctx.tenantId))),
      db
        .update(orders)
        .set({ billId: newIds[0], updatedAt: new Date() })
        .where(and(eq(orders.billId, bill.id), eq(orders.tenantId, ctx.tenantId))),
    ]);

    void writeTenantAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorName: ctx.userName,
      action: 'bill.split',
      targetType: 'bill',
      targetId: bill.id,
      metadata: { mode: body.mode, newBillIds: newIds },
    });

    return NextResponse.json({
      success: true,
      splitBillIds: newIds,
      bills: splitPayloads.map((sp, i) => ({
        id: newIds[i],
        totalAmount: sp.totalPaise / 100,
        breakdown: sp.breakdown,
      })),
    });
  } catch (error) {
    return handleError(error, 'Failed to split bill');
  }
}
