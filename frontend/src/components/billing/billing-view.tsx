'use client';

import { useState, useEffect } from 'react';
import { useLive } from '@/lib/use-live';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Receipt, IndianRupee, CheckCircle2, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { billStatus } from '@/lib/bill-status';

type BillKind = 'stay' | 'restaurant';

interface Payment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  receivedBy: string | null;
  note: string | null;
  createdAt: string;
}

interface Bill {
  id: string;
  kind: BillKind;
  guestName: string;
  totalAmount: number;
  paidAmount: number;
  status: 'open' | 'partial' | 'paid';
  createdAt: string;
  settledAt?: string | null;
  receipt?: {
    subtotal: number;
    cgst: number;
    sgst: number;
    total: number;
    items: Array<{ name: string; qty: number; rate: number; amt: number }>;
  } | null;
  stay?: { roomNumber: string | null; checkIn: string; checkOut: string; nights: number; bookingStatus: string } | null;
  payments: Payment[];
}

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card (machine)' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map(m => [m.value, m.label]));
const REFERENCE_LABEL: Record<string, string> = { upi: 'UPI transaction ID', card: 'Last 4 digits or slip number', bank_transfer: 'Bank reference' };

const COPY: Record<BillKind, { title: string; sub: string; empty: string; chooseHint: string }> = {
  stay: { title: 'Hotel billing', sub: 'Stay bills: take deposits and payments, and see what has been paid.', empty: 'No stay is waiting for payment.', chooseHint: 'Choose a bill to see the stay and its payments.' },
  restaurant: { title: 'Restaurant billing', sub: 'Table bills sent from the floor, and the invoices already paid.', empty: 'Nothing to collect right now.', chooseHint: 'Choose a bill to see what was ordered.' },
};

/** Two decimals, no thousands separator: what goes in the amount box. */
const plain = (n: number) => (Math.round(n * 100) / 100).toString();

export function BillingView({ kind }: { kind: BillKind }) {
  const copy = COPY[kind];
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'open' | 'history'>('open');

  // Custom Receipt Config Binding
  const [receiptConfig, setReceiptConfig] = useState({
    header: 'KIPD RESTAURANT',
    subtext: 'GST INVOICE • WALK-IN',
    footer: 'WE ARE HAPPY TO SERVE YOU'
  });

  const [channel, setChannel] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState('');

  // The payment dialog
  const [showPay, setShowPay] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [form, setForm] = useState({ amount: '', method: 'cash', reference: '', note: '' });

  useEffect(() => {
    fetchBills();

    try {
      const savedConfig = localStorage.getItem('kipd-receipt-config');
      if (savedConfig) setReceiptConfig(JSON.parse(savedConfig));
    } catch { /* storage blocked or not JSON: keep the default receipt */ }

    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.id) setChannel(data.id); })
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const fetchBills = () => {
    fetch(`/api/billing?kind=${kind}`)
      .then(res => { if (!res.ok) throw new Error(`Bills failed: ${res.status}`); return res.json(); })
      .then(data => { setBills(Array.isArray(data) ? data : []); setLoadFailed(false); })
      .catch((err) => { console.error(err); setLoadFailed(true); }); // keep what is on screen, but say it may be out of date
  };

  useLive(fetchBills, channel);

  const selected = bills.find(b => b.id === selectedId) ?? null;
  const owed = selected ? Math.round((selected.totalAmount - selected.paidAmount) * 100) / 100 : 0;

  const openPay = () => {
    if (!selected) return;
    setForm({ amount: plain(owed), method: 'cash', reference: '', note: '' });
    setPayError('');
    setShowPay(true);
  };
  const closePay = () => { setShowPay(false); setPayError(''); };

  const handleRecordPayment = async () => {
    if (!selected || paying) return;
    const amount = Number(form.amount);
    if (!(amount > 0)) { setPayError('Enter the amount received.'); return; }
    if (Math.round(amount * 100) > Math.round(owed * 100)) { setPayError(`Only ${formatCurrency(owed)} is still owed on this bill.`); return; }
    setPaying(true);
    setPayError('');
    try {
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: selected.id,
          paymentMethod: form.method,
          amount,
          reference: form.method === 'cash' ? undefined : form.reference.trim() || undefined,
          note: form.note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPayError(res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not record the payment. Nothing was changed, please try again.');
        return;
      }
      const left = Math.round((owed - amount) * 100) / 100;
      setNotice(left > 0
        ? `${formatCurrency(amount)} recorded for ${selected.guestName}. ${formatCurrency(left)} is still owed.`
        : `${selected.guestName}'s bill is paid in full.`);
      setTimeout(() => setNotice(''), 6000);
      closePay();
      fetchBills();
    } catch (err) {
      console.error(err);
      setPayError('Could not reach the server. Nothing was changed, please try again.');
    } finally {
      setPaying(false);
    }
  };

  const openBills = bills.filter(b => b.status === 'open' || b.status === 'partial');
  const allPaidBills = bills.filter(b => b.status === 'paid');
  const today = new Date().toDateString();
  // Money actually received today, part payments included.
  const collectedToday = bills.flatMap(b => b.payments).filter(p => new Date(p.createdAt).toDateString() === today).reduce((sum, p) => sum + p.amount, 0);
  const outstanding = openBills.reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0);

  // The stay's dates read as "3 Nov – 5 Nov · 2 nights".
  const stayLine = (b: Bill) => b.stay
    ? `Room ${b.stay.roomNumber ?? '?'} · ${format(new Date(b.stay.checkIn), 'd MMM')} – ${format(new Date(b.stay.checkOut), 'd MMM')} · ${b.stay.nights} ${b.stay.nights === 1 ? 'night' : 'nights'}`
    : '';

  const receiptHeader = kind === 'stay' && /restaurant/i.test(receiptConfig.header) ? receiptConfig.header.replace(/restaurant/i, 'HOTEL') : receiptConfig.header;
  const receiptSub = selected?.stay ? `STAY · ${stayLine(selected)}`.toUpperCase() : receiptConfig.subtext;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page {
            margin: 0;
            size: 80mm auto;
          }
          body * {
            visibility: hidden;
          }
          * {
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            position: static !important;
          }
          #thermal-receipt-container, #thermal-receipt-container * {
            visibility: visible;
          }
          #thermal-receipt-container {
            position: absolute !important;
            left: 0;
            top: 0;
            margin: 0;
            width: 80mm;
            padding: 0;
          }
          #thermal-receipt {
            width: 80mm;
            margin: 0;
            padding: 4mm;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}} />
      <div className="mb-6 print:hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="section-title">{copy.title}</h1>
          <p className="section-sub">{copy.sub}</p>
        </div>
        <div className="flex bg-stone-200/50 rounded-lg p-1 w-fit border border-stone-200">
          <button
            aria-pressed={viewMode === 'open'}
            onClick={() => { setViewMode('open'); setSelectedId(null); }}
            className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${viewMode === 'open' ? 'bg-white shadow-sm text-ink' : 'text-stone-500 hover:text-ink'}`}
          >
            To collect
          </button>
          <button
            aria-pressed={viewMode === 'history'}
            onClick={() => { setViewMode('history'); setSelectedId(null); }}
            className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${viewMode === 'history' ? 'bg-white shadow-sm text-ink' : 'text-stone-500 hover:text-ink'}`}
          >
            Paid invoices
          </button>
        </div>
      </div>

      {loadFailed && (
        <p role="status" className="mb-6 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep print:hidden">
          Couldn&apos;t refresh just now. What you see may be a little out of date, and we&apos;ll keep trying.
        </p>
      )}
      {notice && (
        <p role="status" className="mb-6 rounded-lg bg-sage-pale px-4 py-3 text-sm text-sage font-medium print:hidden">{notice}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8 print:hidden">
        {[
          { label: 'Still to collect', value: formatCurrency(outstanding), icon: IndianRupee },
          { label: 'Unpaid bills', value: String(openBills.length), icon: Receipt },
          { label: 'Collected today', value: formatCurrency(collectedToday), icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} hover={false}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-ink mb-1">{value}</div>
                <div className="text-sm text-ink-muted">{label}</div>
              </div>
              <Icon className="w-8 h-8 text-stone-400" aria-hidden="true" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
        {/* Left Column Feed */}
        <div className="print:hidden">

          {viewMode === 'open' && (
            <>
              <h2 className="font-serif text-xl font-bold mb-4">Unpaid bills</h2>
              <div className="space-y-3">
                {openBills.map((bill) => (
                  <button
                    key={bill.id}
                    type="button"
                    aria-pressed={selectedId === bill.id}
                    className={`block w-full text-left bg-white rounded-2xl p-6 shadow-sm border border-stone-200 transition-all hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${selectedId === bill.id ? 'ring-2 ring-amber ring-offset-2' : ''}`}
                    onClick={() => setSelectedId(selectedId === bill.id ? null : bill.id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-ink">{bill.guestName}</h3>
                        {bill.stay && <p className="text-sm text-ink-muted">{stayLine(bill)}</p>}
                      </div>
                      <Badge variant={billStatus(bill.status).tone}>{billStatus(bill.status).label}</Badge>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-stone-200">
                      <div className="text-sm text-ink-muted">
                        {bill.paidAmount > 0
                          ? `${formatCurrency(bill.paidAmount)} paid, ${formatCurrency(bill.totalAmount - bill.paidAmount)} owed`
                          : bill.receipt ? `${bill.receipt.items.length} ${bill.receipt.items.length === 1 ? 'item' : 'items'}` : 'Open the bill to see items'}
                      </div>
                      <div className="font-bold text-lg text-ink">
                        {formatCurrency(bill.totalAmount)}
                      </div>
                    </div>
                  </button>
                ))}
                {openBills.length === 0 && (
                  <div className="text-center p-8 text-ink-muted border border-dashed border-stone-200 rounded-xl">{copy.empty}</div>
                )}
              </div>
            </>
          )}

          {viewMode === 'history' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-xl font-bold text-ink">Paid invoices</h2>
                <Badge variant="stone">{allPaidBills.length} in total</Badge>
              </div>
              <div className="space-y-3">
                {allPaidBills.map((bill) => (
                  <button
                    key={bill.id}
                    type="button"
                    aria-pressed={selectedId === bill.id}
                    className={`block w-full text-left bg-white rounded-2xl p-6 shadow-sm border border-stone-200 transition-all hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${selectedId === bill.id ? 'ring-2 ring-sage ring-offset-2' : ''}`}
                    onClick={() => setSelectedId(selectedId === bill.id ? null : bill.id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-ink">{bill.guestName}</h3>
                        <p className="text-xs text-ink-muted font-mono mt-1">
                          {new Date(bill.createdAt).toLocaleDateString()} at {new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="font-bold text-lg text-ink">
                          {formatCurrency(bill.totalAmount)}
                        </div>
                        <Badge variant={billStatus(bill.status).tone} className="mt-1">{billStatus(bill.status).label}</Badge>
                      </div>
                    </div>
                  </button>
                ))}
                {allPaidBills.length === 0 && (
                  <div className="text-center p-8 text-ink-muted border border-dashed border-stone-200 rounded-xl">No paid invoices yet.</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Column: the bill, its payments, and the receipt */}
        <div>
          {selected ? (
            <Card hover={false} className="sticky top-8">
              <div className="flex items-center justify-between mb-6 print:hidden">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-ink">{selected.guestName}</h2>
                  {selected.stay && <p className="text-ink-muted">{stayLine(selected)}</p>}
                </div>
                <Badge variant={billStatus(selected.status).tone}>{billStatus(selected.status).label}</Badge>
              </div>

              {selected.receipt ? (
                <div id="thermal-receipt-container" className="mb-6 w-full max-w-[300px] mx-auto">
                  <div id="thermal-receipt" className="p-4 bg-white border border-stone-200 rounded-md font-mono text-xs w-full shadow-sm">
                    <div className="text-center mb-4 pb-4 border-b border-dashed border-stone-300">
                      <h3 className="font-bold text-lg leading-tight uppercase tracking-widest mb-1">{receiptHeader}</h3>
                      <p className="text-[10px] text-stone-500 uppercase leading-none">{receiptSub}</p>
                    </div>

                    <table className="w-full mb-4">
                      <thead>
                        <tr className="border-b border-dashed border-stone-300 uppercase">
                          <th className="text-left pb-1 font-semibold w-1/2">Item</th>
                          <th className="text-center pb-1 font-semibold">Qty</th>
                          <th className="text-right pb-1 font-semibold">Rate</th>
                          <th className="text-right pb-1 font-semibold">Amt</th>
                        </tr>
                      </thead>
                      <tbody className="align-top">
                        {selected.receipt.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-stone-100/50">
                            <td className="py-2 pr-2">{item.name}</td>
                            <td className="py-2 text-center text-stone-600">{item.qty}</td>
                            <td className="py-2 text-right text-stone-600">{item.rate}</td>
                            <td className="py-2 text-right font-medium">{item.amt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Tax lines only when the bill has tax (stay bills carry none until the tax profile exists) */}
                    {(selected.receipt.sgst > 0 || selected.receipt.cgst > 0) && (
                      <div className="space-y-1 mb-4 pt-2 border-t border-dashed border-stone-300 w-3/4 ml-auto">
                        <div className="flex justify-between text-[11px] text-stone-600">
                          <span>Sub Total:</span>
                          <span>Rs {selected.receipt.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-stone-600">
                          <span>SGST (2.5%):</span>
                          <span>Rs {selected.receipt.sgst.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-stone-600 pb-2">
                          <span>CGST (2.5%):</span>
                          <span>Rs {selected.receipt.cgst.toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between font-bold text-sm border-y border-dashed border-stone-300 py-2 mb-6 w-full">
                      <span>TOTAL</span>
                      <span>: Rs {selected.receipt.total.toFixed(2)}</span>
                    </div>

                    <div className="text-center">
                      <p className="text-[10px] text-stone-500 font-bold tracking-widest uppercase">{receiptConfig.footer}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 mb-6 pt-4 border-t-2 border-stone-300 print:hidden">
                <div className="flex justify-between text-ink-muted">
                  <span>Total</span>
                  <span>{formatCurrency(selected.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>Paid</span>
                  <span className="text-sage">-{formatCurrency(selected.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-2xl font-bold text-ink">
                  <span>Still owed</span>
                  <span>{formatCurrency(owed)}</span>
                </div>
              </div>

              {selected.payments.length > 0 && (
                <div className="mb-6 print:hidden">
                  <h3 className="text-sm font-semibold text-ink mb-2">Payments</h3>
                  <ul className="space-y-2">
                    {selected.payments.map(p => (
                      <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium text-ink">{METHOD_LABEL[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}</div>
                          <div className="text-xs text-ink-muted">
                            {format(new Date(p.createdAt), 'd MMM, h:mm a')}{p.receivedBy ? ` · received by ${p.receivedBy}` : ''}{p.note ? ` · ${p.note}` : ''}
                          </div>
                        </div>
                        <div className="font-semibold text-ink">{formatCurrency(p.amount)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-3 print:hidden">
                {selected.status !== 'paid' && (
                  <Button className="w-full" onClick={openPay}>
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    Record payment
                  </Button>
                )}

                <Button variant="ghost" className="w-full" onClick={() => window.print()}>
                  <Printer className="w-4 h-4" aria-hidden="true" />
                  Print bill
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-96 text-ink-muted">
              {copy.chooseHint}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showPay && !!selected} onClose={closePay} labelledBy="pay-title" dismissible={!paying} className="p-8 max-w-md w-full">
        {selected && (
          <>
            <h2 id="pay-title" className="text-2xl font-bold text-ink">Record payment</h2>
            <p className="text-ink-muted mt-2">
              {selected.guestName}: total {formatCurrency(selected.totalAmount)}, paid {formatCurrency(selected.paidAmount)}, <span className="font-semibold text-ink">still owed {formatCurrency(owed)}</span>.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <Input
                  label="Amount received (₹)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
                {Number(form.amount) !== owed && (
                  <button type="button" onClick={() => setForm({ ...form, amount: plain(owed) })} className="mt-1.5 text-sm font-medium text-amber-deep hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber rounded">
                    Use the full {formatCurrency(owed)}
                  </button>
                )}
              </div>
              <Select label="Paid by" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} options={METHODS} />
              {form.method !== 'cash' && (
                <Input label={`${REFERENCE_LABEL[form.method]} (optional)`} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              )}
              <Input label="Note (optional)" placeholder="For example: advance for the stay" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>

            {payError && <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{payError}</p>}
            <div className="mt-6 space-y-3">
              <Button className="w-full" onClick={handleRecordPayment} isLoading={paying}>
                {paying ? 'Saving…' : 'Save payment'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={closePay} disabled={paying}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
