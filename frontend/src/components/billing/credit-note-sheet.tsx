import { format } from 'date-fns';
import { taxRowsOf, type CreditNoteDocument } from '@/lib/invoice';

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (n: number) => String(Math.round(n * 100) / 100);

/** The A4 credit note: who it is for, the invoice it corrects, why, and the tax taken back. */
export function CreditNoteSheet({ doc }: { doc: CreditNoteDocument }) {
  const s = doc.snapshot;
  const taxRows = taxRowsOf(s as never).filter((r) => r.cgst + r.sgst + r.igst > 0);
  const label = 'text-[10px] font-semibold uppercase tracking-widest text-stone-500';

  return (
    <article aria-label={`Credit note ${doc.number}`} className="w-[210mm] min-h-[297mm] bg-white p-[14mm] text-[12px] leading-relaxed text-ink">
      <header className="flex items-start justify-between gap-8 border-b-2 border-terra pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">{s.seller.name}</h1>
          {s.seller.address && <p className="mt-1 max-w-[95mm] whitespace-pre-line text-stone-600">{s.seller.address}</p>}
          {s.seller.gstin && (
            <p className="mt-1 font-medium">
              GSTIN: <span className="font-mono">{s.seller.gstin}</span>
              {s.seller.stateName && <span className="text-stone-600"> · {s.seller.stateName} ({s.seller.stateCode})</span>}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold uppercase tracking-wide text-terra">Credit Note</p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
            <dt className="text-stone-500">Credit note no.</dt><dd className="font-mono font-semibold">{doc.number}</dd>
            <dt className="text-stone-500">Date</dt><dd className="font-medium">{format(new Date(doc.issuedAt), 'd MMM yyyy')}</dd>
          </dl>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-8">
        <div>
          <p className={label}>Issued to</p>
          <p className="mt-1 text-sm font-semibold">{s.buyer.name}</p>
          {s.buyer.address && <p className="whitespace-pre-line text-stone-600">{s.buyer.address}</p>}
          {s.buyer.gstin && <p>GSTIN: <span className="font-mono">{s.buyer.gstin}</span></p>}
          {s.placeOfSupply && <p className="mt-1 text-stone-600">Place of supply: <span className="font-medium text-ink">{s.placeOfSupply}</span></p>}
        </div>
        <div>
          <p className={label}>Against invoice</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-stone-500">Invoice no.</dt><dd className="font-mono font-medium">{s.invoice.number}</dd>
            <dt className="text-stone-500">Invoice date</dt><dd>{format(new Date(s.invoice.date), 'd MMM yyyy')}</dd>
            <dt className="text-stone-500">Invoice total</dt><dd>₹ {inr(s.invoice.total)}</dd>
          </dl>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-y border-stone-300 bg-stone-100 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-600">
            <th className="px-2 py-2">Description</th>
            <th className="w-36 px-2 py-2 text-right">Value credited (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-stone-200 align-top">
            <td className="px-2 py-2.5">Credit against invoice {s.invoice.number}<span className="block text-stone-600">Reason: {s.reason}</span></td>
            <td className="px-2 py-2.5 text-right tabular-nums">{inr(s.taxable)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 ml-auto w-[88mm] space-y-1">
        <div className="flex justify-between"><span className="text-stone-600">Taxable value</span><span className="tabular-nums">₹ {inr(s.taxable)}</span></div>
        {taxRows.map((r) => s.interState ? (
          <div key={r.rate} className="flex justify-between"><span className="text-stone-600">IGST @ {rate(r.rate)}%</span><span className="tabular-nums">₹ {inr(r.igst)}</span></div>
        ) : (
          <div key={r.rate}>
            <div className="flex justify-between"><span className="text-stone-600">CGST @ {rate(r.rate / 2)}%</span><span className="tabular-nums">₹ {inr(r.cgst)}</span></div>
            <div className="flex justify-between"><span className="text-stone-600">SGST @ {rate(r.rate / 2)}%</span><span className="tabular-nums">₹ {inr(r.sgst)}</span></div>
          </div>
        ))}
        <div className="flex justify-between border-t-2 border-ink pt-1.5 text-sm font-bold"><span>Total credit</span><span className="tabular-nums">₹ {inr(s.total)}</span></div>
      </div>
      <p className="mt-2 text-[11px] text-stone-600"><span className="font-semibold text-ink">Amount in words:</span> {doc.totalInWords}</p>

      <footer className="mt-12 grid grid-cols-2 gap-8 border-t border-stone-300 pt-4 text-[11px]">
        <p className="text-stone-500">This is a computer generated credit note.</p>
        <div className="flex flex-col items-end justify-end text-right">
          <div className="h-14" />
          <p className="w-48 border-t border-stone-400 pt-1 text-stone-600">Authorised signatory<br /><span className="font-medium text-ink">{s.seller.name}</span></p>
        </div>
      </footer>
    </article>
  );
}
