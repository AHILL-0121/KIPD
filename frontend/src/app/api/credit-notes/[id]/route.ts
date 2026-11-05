import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { creditNotes } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { creditNoteDocument, type CreditNoteSnapshot } from '@/lib/invoice';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    assertUuid(params.id, 'Credit note');
    const [row] = await db.select().from(creditNotes).where(and(eq(creditNotes.id, params.id), eq(creditNotes.tenantId, tenantId))).limit(1);
    if (!row) throw notFound('Credit note');
    return NextResponse.json(creditNoteDocument({ id: row.id, billId: row.billId, number: row.number, issuedAt: row.issuedAt, issuedBy: row.issuedBy, snapshot: row.data as CreditNoteSnapshot }));
  } catch (error) {
    return handleError(error, 'Failed to load the credit note');
  }
}
