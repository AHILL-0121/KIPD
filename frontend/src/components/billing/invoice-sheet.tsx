import { format } from 'date-fns';
import { taxRowsOf, type InvoiceDocument } from '@/lib/invoice';

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', razorpay: 'Online payment', stripe: 'Card (online)' };
const rate = (n: number) => String(Math.round(n * 100) / 100);
const SAC_LABEL: Record<string, string> = { '9963': 'Accommodation service', '996331': 'Restaurant service' };

/**
 * The A4 stay invoice. It only draws what the invoice document says (frozen at issue time, plus live payments).
 * Sized in millimetres so the on-screen sheet and the printed page match.
 */
export function InvoiceSheet({ doc }: { doc: InvoiceDocument }) {
  const s = doc.snapshot;
  const taxRows = taxRowsOf(s as never).filter((r) => r.cgst + r.sgst + r.igst > 0);
  const when = (iso: string) => format(new Date(iso), 'd MMM yyyy, h:mm a');
  const label = 'text-[10px] font-semibold uppercase tracking-widest text-stone-500';

  return (
    <article aria-label={`${s.title} ${doc.number}`} className="w-[210mm] min-h-[297mm] bg-white p-[14mm] text-[12px] leading-relaxed text-ink">
      <header className="flex items-start justify-between gap-8 border-b-2 border-amber pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">{s.seller.name}</h1>
          {s.seller.address && <p className="mt-1 max-w-[95mm] whitespace-pre-line text-stone-600">{s.seller.address}</p>}
          {(s.seller.phone || s.seller.email) && <p className="text-stone-600">{[s.seller.phone, s.seller.email].filter(Boolean).join(' · ')}</p>}
          {s.seller.gstin && (
            <p className="mt-1 font-medium">
              GSTIN: <span className="font-mono">{s.seller.gstin}</span>
              {s.seller.stateName && <span className="text-stone-600"> · {s.seller.stateName} ({s.seller.stateCode})</span>}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold uppercase tracking-wide text-amber">{s.title}</p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
            <dt className="text-stone-500">Invoice no.</dt><dd className="font-mono font-semibold">{doc.number}</dd>
            <dt className="text-stone-500">Date</dt><dd className="font-medium">{format(new Date(doc.issuedAt), 'd MMM yyyy')}</dd>
          </dl>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-8">
        <div>
          <p className={label}>Billed to</p>
          <p className="mt-1 text-sm font-semibold">{s.buyer.name}</p>
          {s.buyer.address && <p className="whitespace-pre-line text-stone-600">{s.buyer.address}</p>}
          {s.buyer.gstin && <p>GSTIN: <span className="font-mono">{s.buyer.gstin}</span></p>}
          {(s.buyer.phone || s.buyer.email) && <p className="text-stone-600">{[s.buyer.phone, s.buyer.email].filter(Boolean).join(' · ')}</p>}
          {s.placeOfSupply && <p className="mt-1 text-stone-600">Place of supply: <span className="font-medium text-ink">{s.placeOfSupply}</span></p>}
        </div>
        <div>
          <p className={label}>Stay</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-stone-500">Room</dt><dd className="font-medium">{s.stay.roomNumber}</dd>
            <dt className="text-stone-500">Check-in</dt><dd>{when(s.stay.checkIn)}</dd>
            <dt className="text-stone-500">Check-out</dt><dd>{when(s.stay.checkOut)}</dd>
            <dt className="text-stone-500">Nights</dt><dd>{s.stay.nights}</dd>
            {s.stay.guests ? <><dt className="text-stone-500">Guests</dt><dd>{s.stay.guests}</dd></> : null}
          </dl>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-y border-stone-300 bg-stone-100 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-600">
            <th className="w-8 px-2 py-2">#</th>
            <th className="px-2 py-2">Description</th>
            <th className="w-16 px-2 py-2 text-right">Qty</th>
            <th className="w-28 px-2 py-2 text-right">Rate (₹)</th>
            <th className="w-32 px-2 py-2 text-right">Taxable value (₹)</th>
          </tr>
        </thead>
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i} className="border-b border-stone-200 align-top">
              <td className="px-2 py-2.5 text-stone-500">{i + 1}</td>
              <td className="px-2 py-2.5">{l.description}<span className="block text-[10px] text-stone-500">SAC {l.sac} · {SAC_LABEL[l.sac] ?? 'Service'}{l.gstRate ? ` · GST ${rate(l.gstRate)}%` : ''}</span></td>
              <td className="px-2 py-2.5 text-right tabular-nums">{l.qty}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{inr(l.rate)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{inr(l.taxable)}</td>
            </tr>
          ))}
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
        <div className="flex justify-between border-t-2 border-ink pt-1.5 text-sm font-bold"><span>Total</span><span className="tabular-nums">₹ {inr(s.total)}</span></div>
      </div>
      <p className="mt-2 text-[11px] text-stone-600"><span className="font-semibold text-ink">Amount in words:</span> {doc.totalInWords}</p>

      <section className="mt-6">
        <p className={label}>Payments</p>
        {doc.payments.length === 0 ? (
          <p className="mt-1 text-stone-500">No payment received yet.</p>
        ) : (
          <table className="mt-1 w-full border-collapse">
            <tbody>
              {doc.payments.map((p) => (
                <tr key={p.id} className="border-b border-stone-200">
                  <td className="py-1.5 pr-3 text-stone-600">{format(new Date(p.date), 'd MMM yyyy')}</td>
                  <td className="py-1.5 pr-3">{METHOD[p.method] ?? p.method}{p.reference ? <span className="text-stone-500"> · {p.reference}</span> : null}</td>
                  <td className="py-1.5 text-right tabular-nums">₹ {inr(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-2 ml-auto w-[88mm] space-y-1">
          {doc.creditNotes.map((c) => (
            <div key={c.id} className="flex justify-between gap-3"><span className="text-stone-600">Credit note {c.number}<span className="block text-[10px] text-stone-500">{c.reason}</span></span><span className="tabular-nums">− ₹ {inr(c.amount)}</span></div>
          ))}
          <div className="flex justify-between"><span className="text-stone-600">Paid</span><span className="tabular-nums">₹ {inr(doc.paid)}</span></div>
          <div className="flex justify-between border-y border-ink py-1.5 text-sm font-bold"><span>{doc.balance > 0 ? 'Balance due' : 'Balance'}</span><span className="tabular-nums">₹ {inr(doc.balance)}</span></div>
          {doc.refundDue > 0 && <div className="flex justify-between font-semibold"><span>Refund due to guest</span><span className="tabular-nums">₹ {inr(doc.refundDue)}</span></div>}
        </div>
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-8 border-t border-stone-300 pt-4 text-[11px]">
        <div className="space-y-3">
          {s.bankDetails && <div><p className={label}>Bank details</p><p className="mt-0.5 whitespace-pre-line">{s.bankDetails}</p></div>}
          {s.terms && <div><p className={label}>Terms</p><p className="mt-0.5 whitespace-pre-line">{s.terms}</p></div>}
          <p className="text-stone-500">This is a computer generated invoice.</p>
        </div>
        <div className="flex flex-col items-end justify-end text-right">
          <div className="h-14" />
          <p className="w-48 border-t border-stone-400 pt-1 text-stone-600">Authorised signatory<br /><span className="font-medium text-ink">{s.seller.name}</span></p>
        </div>
      </footer>
    </article>
  );
}
