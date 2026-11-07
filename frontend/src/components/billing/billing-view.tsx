'use client';

import { useState, useEffect } from 'react';
import { useLive } from '@/lib/use-live';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import Link from 'next/link';
import { Receipt, IndianRupee, CheckCircle2, Printer, Link2, Copy, FileText, BedDouble, X } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { billStatus } from '@/lib/bill-status';
import { suggestedDeposit } from '@/lib/deposit';
import { GST_STATES, splitGst } from '@/lib/gst';

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
    igst?: number;
    gstRate?: number;
    /** One entry per GST rate on the bill (a stay with food charged to the room has two). */
    taxSummary?: Array<{ rate: number; taxable: number; tax: number }>;
    total: number;
    items: Array<{ name: string; qty: number; rate: number; amt: number }>;
  } | null;
  /** Set once the stay's invoice has been issued. */
  invoiceNumber?: string | null;
  stay?: { roomNumber: string | null; checkIn: string; checkOut: string; nights: number; bookingStatus: string } | null;
  payments: Payment[];
}

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card (machine)' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];
const ONLINE_QR = { value: 'razorpay_qr', label: 'Online payment QR (Razorpay)' };
const ONLINE = { value: 'razorpay', label: 'Online payment link (Razorpay)' };
const isOnline = (method: string) => method === 'razorpay' || method === 'razorpay_qr';
const METHOD_LABEL: Record<string, string> = { ...Object.fromEntries(METHODS.map(m => [m.value, m.label])), razorpay: 'Online payment', razorpay_qr: 'Online payment', stripe: 'Card (online)' };

/** What Settings > Payments allows. Until it loads, every manual way is offered and online payment is not. */
interface PaySettings { manualMethods: string[]; onlinePayments: boolean; depositPercent: number; razorpayConfigured: boolean }
const DEFAULT_PAY: PaySettings = { manualMethods: METHODS.map(m => m.value), onlinePayments: false, depositPercent: 0, razorpayConfigured: false };
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
  const [paySettings, setPaySettings] = useState<PaySettings>(DEFAULT_PAY);
  const [link, setLink] = useState<{ url: string; amount: number } | null>(null);
  const [copied, setCopied] = useState(false);
  // A QR on screen, waiting for the guest to scan it. paidBefore is what the bill had received when it was made.
  const [qr, setQr] = useState<{ id: string; imageUrl: string; amount: number; expiresAt: number; paidBefore: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Charge a restaurant bill to a guest's room
  const [showRoom, setShowRoom] = useState(false);
  const [inHouse, setInHouse] = useState<Bill[] | null>(null);
  const [roomBillId, setRoomBillId] = useState('');
  const [posting, setPosting] = useState(false);
  const [roomError, setRoomError] = useState('');

  // The invoice dialog (hotel stays): who the invoice is made out to
  const [showInvoice, setShowInvoice] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [buyer, setBuyer] = useState({ name: '', gstin: '', stateCode: '', address: '' });

  useEffect(() => {
    fetchBills();

    fetch('/api/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.receiptSettings) setReceiptConfig(data.receiptSettings); })
      .catch(() => { }); // keep the default receipt

    fetch('/api/settings/payments')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && Array.isArray(data.manualMethods)) setPaySettings({ ...DEFAULT_PAY, ...data }); })
      .catch(() => { }); // keep the defaults: staff can still record every manual way

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

  // The ways offered in the dialog: the manual ones Settings allows, plus an online link (hotel or restaurant) when it is on.
  const methodOptions = [
    ...METHODS.filter(m => paySettings.manualMethods.includes(m.value)),
    ...(paySettings.onlinePayments && paySettings.razorpayConfigured ? [ONLINE_QR, ONLINE] : []),
  ];

  // A first payment on a hotel stay starts at the suggested deposit, when the property has one. Anything else starts at what is owed.
  const depositFor = (b: Bill) => (kind === 'stay' && b.paidAmount === 0 ? suggestedDeposit(b.totalAmount, paySettings.depositPercent) : 0);

  const openPay = () => {
    if (!selected) return;
    const deposit = depositFor(selected);
    setForm({ amount: plain(deposit > 0 ? deposit : owed), method: methodOptions[0]?.value ?? 'cash', reference: '', note: '' });
    setPayError('');
    setLink(null);
    setCopied(false);
    setShowPay(true);
  };
  const openRoom = () => {
    setRoomError('');
    setRoomBillId('');
    setInHouse(null);
    setShowRoom(true);
    // Guests who are checked in and whose stay is not yet invoiced: an issued invoice can no longer take new charges.
    fetch('/api/billing?kind=stay')
      .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then((rows: Bill[]) => {
        const open = rows.filter(b => b.stay?.bookingStatus === 'checked_in' && !b.invoiceNumber);
        setInHouse(open);
        if (open.length === 1) setRoomBillId(open[0].id);
      })
      .catch(() => { setInHouse([]); setRoomError('Could not load the guests who are staying. Close this and try again.'); });
  };

  const postToRoom = async () => {
    if (!selected || !roomBillId || posting) return;
    setPosting(true);
    setRoomError('');
    try {
      const res = await fetch(`/api/billing/${selected.id}/post-to-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stayBillId: roomBillId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRoomError(res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not charge this to the room. Nothing was changed, please try again.');
        return;
      }
      const room = inHouse?.find(b => b.id === roomBillId)?.stay?.roomNumber;
      setShowRoom(false);
      setSelectedId(null);
      setNotice(`${formatCurrency(data.posted)} charged to Room ${room ?? ''}. It will be on that guest's bill.`);
      fetchBills();
    } catch {
      setRoomError('Could not reach the server. Nothing was changed, please try again.');
    } finally {
      setPosting(false);
    }
  };

  const openInvoice = () => {
    if (!selected) return;
    setBuyer({ name: selected.guestName, gstin: '', stateCode: '', address: '' });
    setInvoiceError('');
    setShowInvoice(true);
  };

  const issueInvoice = async () => {
    if (!selected || issuing) return;
    setIssuing(true);
    setInvoiceError('');
    try {
      const res = await fetch(`/api/billing/${selected.id}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: buyer.name.trim() || undefined, gstin: buyer.gstin.trim() || undefined, stateCode: buyer.stateCode || undefined, address: buyer.address.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInvoiceError(res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not issue the invoice. Nothing was changed, please try again.');
        return;
      }
      setShowInvoice(false);
      setNotice(`Invoice ${data.number} issued.`);
      fetchBills();
    } catch {
      setInvoiceError('Could not reach the server. Nothing was changed, please try again.');
    } finally {
      setIssuing(false);
    }
  };

  // While a QR is showing: tick the countdown, and re-read the bill every few seconds to see the payment arrive.
  useEffect(() => {
    if (!qr) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(fetchBills, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr?.id]);

  const qrPaid = !!qr && !!selected && selected.paidAmount >= qr.paidBefore + qr.amount - 0.005;
  const qrExpired = !!qr && !qrPaid && now >= qr.expiresAt;
  const secondsLeft = qr ? Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)) : 0;

  const closePay = () => {
    // Leaving an unpaid QR open would let a guest pay after staff took cash instead, so stop it (best effort).
    if (qr && !qrPaid) fetch(`/api/billing?qr=${encodeURIComponent(qr.id)}`, { method: 'DELETE' }).catch(() => { });
    setShowPay(false); setPayError(''); setLink(null); setQr(null);
  };

  const copyLink = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setCopied(false); }
  };

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
          reference: form.method === 'cash' || isOnline(form.method) ? undefined : form.reference.trim() || undefined,
          note: form.note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPayError(res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not record the payment. Nothing was changed, please try again.');
        return;
      }
      if (form.method === 'razorpay_qr') {
        const data = await res.json().catch(() => ({}));
        if (!data?.paymentQr?.imageUrl) { setPayError('Razorpay did not return a QR code. Nothing was changed, please try again.'); return; }
        setNow(Date.now());
        setQr({ id: data.paymentQr.id, imageUrl: data.paymentQr.imageUrl, amount: data.paymentQr.amount, expiresAt: new Date(data.paymentQr.expiresAt).getTime(), paidBefore: selected.paidAmount });
        return; // nothing is recorded until the guest pays; the bill updates by itself then
      }
      if (form.method === 'razorpay') {
        const data = await res.json().catch(() => ({}));
        if (!data?.paymentLink?.url) { setPayError('Razorpay did not return a payment link. Nothing was changed, please try again.'); return; }
        setLink({ url: data.paymentLink.url, amount: data.paymentLink.amount });
        return; // nothing is recorded until the guest pays; the bill updates by itself then
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
                <div className="flex items-center gap-3">
                  <Badge variant={billStatus(selected.status).tone}>{billStatus(selected.status).label}</Badge>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="Close bill"
                    className="p-2 rounded-full bg-stone-100 text-ink-soft hover:bg-stone-200 hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
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

                    {/* Tax lines only when the bill has tax (a stay bill has it when the hotel charges room GST in Settings) */}
                    {(selected.receipt.sgst > 0 || selected.receipt.cgst > 0) && (
                      <div className="space-y-1 mb-4 pt-2 border-t border-dashed border-stone-300 w-3/4 ml-auto">
                        <div className="flex justify-between text-[11px] text-stone-600">
                          <span>Sub Total:</span>
                          <span>Rs {selected.receipt.subtotal.toFixed(2)}</span>
                        </div>
                        {(selected.receipt.taxSummary?.filter(g => g.tax > 0) ?? [{ rate: selected.receipt.gstRate ?? 5, tax: selected.receipt.cgst + selected.receipt.sgst }]).map(g => {
                          const half = splitGst(Math.round(g.tax * 100), false);
                          return (
                            <div key={g.rate} className="pb-1">
                              <div className="flex justify-between text-[11px] text-stone-600"><span>SGST ({g.rate / 2}%):</span><span>Rs {(half.sgstPaise / 100).toFixed(2)}</span></div>
                              <div className="flex justify-between text-[11px] text-stone-600"><span>CGST ({g.rate / 2}%):</span><span>Rs {(half.cgstPaise / 100).toFixed(2)}</span></div>
                            </div>
                          );
                        })}
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

                {kind === 'restaurant' && selected.status === 'open' && selected.payments.length === 0 && (
                  <Button variant="ghost" className="w-full" onClick={openRoom}>
                    <BedDouble className="w-4 h-4" aria-hidden="true" />
                    Charge to room
                  </Button>
                )}

                {selected.stay && (selected.invoiceNumber ? (
                  <Link
                    href={`/dashboard/billing/hotel/invoice/${selected.id}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-base font-medium text-ink-soft hover:bg-stone-100 hover:border-stone-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                  >
                    <FileText className="w-4 h-4" aria-hidden="true" />
                    Open invoice {selected.invoiceNumber}
                  </Link>
                ) : (
                  <Button variant="ghost" className="w-full" onClick={openInvoice}>
                    <FileText className="w-4 h-4" aria-hidden="true" />
                    Issue A4 invoice
                  </Button>
                ))}

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

            {qr ? (
              <div className="mt-5 space-y-4 text-center">
                {qrPaid ? (
                  <p role="status" className="rounded-lg bg-sage-pale px-4 py-6 text-sage font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                    {formatCurrency(qr.amount)} received.{owed > 0 ? ` ${formatCurrency(owed)} is still owed.` : ' The bill is paid in full.'}
                  </p>
                ) : qrExpired ? (
                  <p role="alert" className="rounded-lg bg-terra-pale px-4 py-6 text-sm text-terra">This QR code has expired. Close this and make a new one.</p>
                ) : (
                  <>
                    <p role="status" className="text-sm text-ink-muted">Ask the guest to scan this with any UPI app and pay <span className="font-semibold text-ink">{formatCurrency(qr.amount)}</span>. It is added to this bill by itself once they pay.</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr.imageUrl} alt={`UPI QR code to pay ${formatCurrency(qr.amount)}`} className="mx-auto w-56 h-56 rounded-lg border border-stone-200 bg-white object-contain" />
                    <p className="text-sm text-ink-muted">Waiting for payment… expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
                  </>
                )}
                <Button className="w-full" variant={qrPaid ? 'primary' : 'ghost'} onClick={() => { closePay(); fetchBills(); }}>{qrPaid ? 'Done' : 'Cancel and close'}</Button>
              </div>
            ) : link ? (
              <div className="mt-5 space-y-4">
                <p role="status" className="rounded-lg bg-sage-pale px-4 py-3 text-sm text-sage font-medium">
                  Payment link for {formatCurrency(link.amount)} is ready. Send it to the guest. The payment is added to this bill by itself once they pay.
                </p>
                <Input label="Payment link" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
                <div className="flex gap-3">
                  <Button variant="ghost" className="flex-1" onClick={copyLink}>
                    <Copy className="w-4 h-4" aria-hidden="true" />
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-ink hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
                    <Link2 className="w-4 h-4" aria-hidden="true" />
                    Open link
                  </a>
                </div>
                <Button className="w-full" onClick={() => { closePay(); fetchBills(); }}>Done</Button>
              </div>
            ) : (
            <>
            <div className="mt-5 space-y-4">
              <div>
                <Input
                  label={isOnline(form.method) ? 'Amount to collect (₹)' : 'Amount received (₹)'}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
                {selected && depositFor(selected) > 0 && Number(form.amount) === depositFor(selected) && depositFor(selected) !== owed && (
                  <p className="mt-1.5 text-sm text-ink-muted">Suggested deposit ({paySettings.depositPercent}% of the stay). Change it if the guest pays a different amount.</p>
                )}
                {Number(form.amount) !== owed && (
                  <button type="button" onClick={() => setForm({ ...form, amount: plain(owed) })} className="mt-1.5 text-sm font-medium text-amber-deep hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber rounded">
                    Use the full {formatCurrency(owed)}
                  </button>
                )}
              </div>
              <Select label="Paid by" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} options={methodOptions} />
              {form.method !== 'cash' && !isOnline(form.method) && (
                <Input label={`${REFERENCE_LABEL[form.method]} (optional)`} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              )}
              <Input label="Note (optional)" placeholder="For example: advance for the stay" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>

            {payError && <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{payError}</p>}
            <div className="mt-6 space-y-3">
              <Button className="w-full" onClick={handleRecordPayment} isLoading={paying}>
                {paying ? 'Saving…' : form.method === 'razorpay_qr' ? 'Show QR code' : form.method === 'razorpay' ? 'Create payment link' : 'Save payment'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={closePay} disabled={paying}>
                Cancel
              </Button>
            </div>
            </>
            )}
          </>
        )}
      </Dialog>

      {/* Charge to room */}
      <Dialog open={showRoom && !!selected} onClose={() => setShowRoom(false)} labelledBy="room-title" dismissible={!posting} className="p-8 max-w-md w-full">
        {selected && (
          <>
            <h2 id="room-title" className="text-2xl font-bold text-ink">Charge to room</h2>
            <p className="text-ink-muted mt-2">
              Moves this bill ({formatCurrency(selected.totalAmount)}) onto a guest&apos;s stay, so they pay for it at check-out and it appears on their invoice. It can&apos;t be undone.
            </p>
            <div className="mt-5">
              {inHouse === null ? (
                <p className="text-sm text-ink-muted">Loading guests…</p>
              ) : inHouse.length === 0 ? (
                <p className="rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">No guest is checked in with an open bill. Charges can only go to a guest who is staying and hasn&apos;t been invoiced yet.</p>
              ) : (
                <Select
                  label="Guest"
                  value={roomBillId}
                  onChange={(e) => setRoomBillId(e.target.value)}
                  placeholder="Choose a room"
                  options={inHouse.map(b => ({ value: b.id, label: `Room ${b.stay?.roomNumber ?? '?'} · ${b.guestName}` }))}
                />
              )}
            </div>
            {roomError && <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{roomError}</p>}
            <div className="mt-6 space-y-3">
              <Button className="w-full" onClick={postToRoom} isLoading={posting} disabled={!roomBillId}>{posting ? 'Charging…' : 'Charge to room'}</Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowRoom(false)} disabled={posting}>Cancel</Button>
            </div>
          </>
        )}
      </Dialog>

      {/* Issue invoice */}
      <Dialog open={showInvoice && !!selected} onClose={() => setShowInvoice(false)} labelledBy="invoice-title" dismissible={!issuing} className="p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {selected && (
          <>
            <h2 id="invoice-title" className="text-2xl font-bold text-ink">Issue invoice</h2>
            <p className="text-ink-muted mt-2">
              For {formatCurrency(selected.totalAmount)}. Once issued the invoice gets its number and can&apos;t be changed, so check who it is made out to. For a business guest, add their GSTIN.
            </p>
            <div className="mt-5 space-y-4">
              <Input label="Billed to" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
              <Input label="Guest or company GSTIN (optional)" placeholder="29ABCDE1234F1Z5" value={buyer.gstin} onChange={(e) => setBuyer({ ...buyer, gstin: e.target.value.toUpperCase() })} />
              <Select
                label="Guest's state (optional)"
                value={buyer.stateCode}
                onChange={(e) => setBuyer({ ...buyer, stateCode: e.target.value })}
                options={[{ value: '', label: 'Same as the hotel, or from the GSTIN' }, ...GST_STATES.map(st => ({ value: st.code, label: `${st.name} (${st.code})` }))]}
              />
              <Input label="Address (optional)" value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} />
            </div>
            {invoiceError && <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{invoiceError}</p>}
            <div className="mt-6 space-y-3">
              <Button className="w-full" onClick={issueInvoice} isLoading={issuing}>{issuing ? 'Issuing…' : 'Issue invoice'}</Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowInvoice(false)} disabled={issuing}>Cancel</Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
