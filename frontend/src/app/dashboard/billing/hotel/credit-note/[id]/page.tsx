'use client';

import { useEffect, useState } from 'react';
import { A4Frame } from '@/components/billing/a4-frame';
import { CreditNoteSheet } from '@/components/billing/credit-note-sheet';
import { LoadingState } from '@/components/ui/loading-state';
import type { CreditNoteDocument } from '@/lib/invoice';

export default function CreditNotePage({ params }: { params: { id: string } }) {
  const [doc, setDoc] = useState<CreditNoteDocument | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'failed' | 'ready'>('loading');

  useEffect(() => {
    fetch(`/api/credit-notes/${params.id}`)
      .then(async res => {
        if (res.status === 404) { setState('missing'); return; }
        if (!res.ok) throw new Error(String(res.status));
        setDoc(await res.json());
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, [params.id]);

  return (
    <div className="p-4 md:p-8">
      {state === 'loading' && <LoadingState message="Loading credit note..." />}
      {state === 'missing' && <p role="alert" className="rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">This credit note was not found.</p>}
      {state === 'failed' && <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">Could not load the credit note. Refresh the page to try again.</p>}
      {doc && (
        <A4Frame
          fileTitle={`Credit note ${doc.number.replace(/\//g, '-')}`}
          backHref={`/dashboard/billing/hotel/invoice/${doc.billId}`}
          backLabel="Back to the invoice"
          sheet={<CreditNoteSheet doc={doc} />}
        />
      )}
    </div>
  );
}
