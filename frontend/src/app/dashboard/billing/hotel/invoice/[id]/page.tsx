'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/loading-state';
import { A4Frame } from '@/components/billing/a4-frame';
import { InvoiceSheet } from '@/components/billing/invoice-sheet';
import { formatCurrency } from '@/lib/currency';
import type { InvoiceDocument } from '@/lib/invoice';

export default function InvoicePage({ params }: { params: { id: string } }) {
  const [doc, setDoc] = useState<InvoiceDocument | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'failed' | 'ready'>('loading');

  // Credit note dialog
  const [showCredit, setShowCredit] = useState(false);
  const [credit, setCredit] = useState({ amount: '', reason: '', full: false });
  const [issuing, setIssuing] = useState(false);
  const [creditError, setCreditError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetch(`/api/billing/${params.id}/invoice`)
      .then(async res => {
        if (res.status === 404) { setState('missing'); return; }
        if (!res.ok) throw new Error(String(res.status));
        setDoc(await res.json());
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, [params.id]);
  useEffect(load, [load]);

  const left = doc ? Math.round((doc.snapshot.total - doc.credited) * 100) / 100 : 0;

  const openCredit = () => { setCredit({ amount: '', reason: '', full: false }); setCreditError(''); setShowCredit(true); };

  const issueCredit = async () => {
    if (issuing) return;
    const amount = Number(credit.amount);
    if (!credit.full && !(amount > 0)) { setCreditError('Enter the amount to credit, tax included.'); return; }
    if (credit.reason.trim().length < 3) { setCreditError('Say why the credit is being given.'); return; }
    setIssuing(true);
    setCreditError('');
    try {
      const res = await fetch(`/api/billing/${params.id}/credit-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credit.full ? { full: true, reason: credit.reason } : { amount, reason: credit.reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreditError(res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not issue the credit note. Nothing was changed, please try again.');
        return;
      }
      setShowCredit(false);
      setNotice(`Credit note ${data.number} issued.`);
      load();
    } catch {
      setCreditError('Could not reach the server. Nothing was changed, please try again.');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      {state === 'loading' && <LoadingState message="Loading invoice..." />}
      {state === 'missing' && <p role="alert" className="rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">No invoice has been issued for this bill yet. Open the bill in hotel billing and choose Issue A4 invoice.</p>}
      {state === 'failed' && <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">Could not load the invoice. Refresh the page to try again.</p>}

      {doc && (
        <>
          {notice && <p role="status" className="mb-4 rounded-lg bg-sage-pale px-4 py-3 text-sm font-medium text-sage print:hidden">{notice}</p>}
          <A4Frame
            fileTitle={`Invoice ${doc.number.replace(/\//g, '-')}`}
            backHref="/dashboard/billing/hotel"
            backLabel="Back to hotel billing"
            sheet={<InvoiceSheet doc={doc} />}
            actions={left > 0 ? (
              <Button variant="ghost" onClick={openCredit}>
                <FilePlus2 className="w-4 h-4" aria-hidden="true" /> Issue credit note
              </Button>
            ) : undefined}
            below={doc.creditNotes.length > 0 ? (
              <section aria-label="Credit notes" className="mx-auto mt-6 max-w-[210mm]">
                <h2 className="mb-2 text-sm font-semibold text-ink">Credit notes on this invoice</h2>
                <ul className="space-y-2">
                  {doc.creditNotes.map(c => (
                    <li key={c.id}>
                      <Link href={`/dashboard/billing/hotel/credit-note/${c.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm hover:border-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
                        <span><span className="font-mono font-medium">{c.number}</span> · {format(new Date(c.issuedAt), 'd MMM yyyy')} · {c.reason}</span>
                        <span className="font-semibold tabular-nums">− {formatCurrency(c.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : undefined}
          />

          <Dialog open={showCredit} onClose={() => setShowCredit(false)} labelledBy="credit-title" dismissible={!issuing} className="p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 id="credit-title" className="text-2xl font-bold text-ink">Issue credit note</h2>
            <p className="mt-2 text-ink-muted">
              Reduces invoice {doc.number}. Up to {formatCurrency(left)} can still be credited. It lowers what the guest still owes, gets its own number, and can&apos;t be changed once issued.
            </p>
            <div className="mt-5 space-y-4">
              <Input
                label="Amount to credit, tax included (₹)"
                type="number" inputMode="decimal" min={0} step="0.01"
                disabled={credit.full}
                value={credit.full ? String(left) : credit.amount}
                onChange={(e) => setCredit({ ...credit, amount: e.target.value })}
              />
              <label className="flex items-center gap-3 text-sm text-ink cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={credit.full} onChange={(e) => setCredit({ ...credit, full: e.target.checked })} />
                Credit everything left on the invoice ({formatCurrency(left)})
              </label>
              <Input label="Reason" placeholder="For example: room rate corrected, or stay cancelled" value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} />
            </div>
            {creditError && <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{creditError}</p>}
            <div className="mt-6 space-y-3">
              <Button className="w-full" onClick={issueCredit} isLoading={issuing}>{issuing ? 'Issuing…' : 'Issue credit note'}</Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowCredit(false)} disabled={issuing}>Cancel</Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  );
}
