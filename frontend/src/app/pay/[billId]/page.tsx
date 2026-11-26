'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { CheckCircle2, CreditCard, ExternalLink, RefreshCw, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { KipdMascot } from '@/components/mascot/KipdMascot';
import { formatCurrency } from '@/lib/currency';

interface PublicBillPayload {
  restaurantName: string;
  bill: {
    id: string;
    status: 'open' | 'partial' | 'paid';
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    itemsBreakdown?: {
      subtotal?: number;
      cgst?: number;
      sgst?: number;
      total?: number;
      items?: Array<{ name: string; qty: number; rate: number; amt: number }>;
    } | null;
    createdAt: string;
    settledAt: string | null;
  };
  methods: {
    razorpay: boolean;
    directUpi: boolean;
  };
  directUpiUrl: string | null;
}

export default function PublicPayAtTablePage({ params }: { params: { billId: string } }) {
  const [data, setData] = useState<PublicBillPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [upiLink, setUpiLink] = useState<string | null>(null);

  const loadBill = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/pay/${params.billId}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Bill could not be found.');
      setData(json);
      setError(null);
      if (json.directUpiUrl) {
        setUpiLink(json.directUpiUrl);
        QRCode.toDataURL(json.directUpiUrl, { width: 260, margin: 2 })
          .then(setQrImg)
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your bill.');
    } finally {
      setLoading(false);
    }
  }, [params.billId]);

  useEffect(() => {
    loadBill();
  }, [loadBill]);

  // Poll until settled
  useEffect(() => {
    if (!data || data.bill.status === 'paid') return;
    const timer = setInterval(loadBill, 5000);
    return () => clearInterval(timer);
  }, [data, loadBill]);

  const startPayment = async (mode: 'razorpay_link' | 'upi_intent') => {
    setStarting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/public/pay/${params.billId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not start payment.');

      if (out.paymentLinkUrl) {
        window.location.href = out.paymentLinkUrl;
        return;
      }
      if (out.upiUrl) {
        setUpiLink(out.upiUrl);
        const qr = await QRCode.toDataURL(out.upiUrl, { width: 260, margin: 2 });
        setQrImg(qr);
        window.location.href = out.upiUrl;
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Payment could not be started.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <LoadingState message="Loading your table bill..." />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <KipdMascot size="lg" animated={false} />
          <p className="mt-6 text-lg text-ink" role="alert">{error || 'Bill not found'}</p>
          <Button className="mt-6" onClick={loadBill}>Try again</Button>
        </div>
      </div>
    );
  }

  const { restaurantName, bill, methods } = data;
  const items = bill.itemsBreakdown?.items ?? [];
  const isPaid = bill.status === 'paid' || bill.remainingAmount <= 0;

  return (
    <div className="min-h-screen bg-cream px-4 py-8">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <p className="text-xs font-mono uppercase tracking-widest text-amber-deep font-semibold">Pay at Table</p>
          <h1 className="font-serif text-2xl font-bold text-ink mt-1">{restaurantName}</h1>
        </div>

        <Card hover={false} className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div>
              <div className="text-xs text-ink-muted">Amount Due</div>
              <div className="text-3xl font-bold text-ink">
                {isPaid ? formatCurrency(0) : formatCurrency(bill.remainingAmount)}
              </div>
            </div>
            <Badge variant={isPaid ? 'sage' : bill.status === 'partial' ? 'amber' : 'stone'} dot>
              {isPaid ? 'Paid' : bill.status === 'partial' ? 'Part Paid' : 'Due'}
            </Badge>
          </div>

          {items.length > 0 && (
            <div className="space-y-2 text-sm">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between gap-2">
                  <span className="text-ink">
                    <span className="font-semibold text-amber-deep mr-1.5">{item.qty}×</span>
                    {item.name}
                  </span>
                  <span className="text-ink-muted shrink-0">{formatCurrency(item.amt)}</span>
                </div>
              ))}
              {bill.itemsBreakdown?.cgst !== undefined && (
                <div className="pt-2 border-t border-stone-100 text-xs text-ink-muted space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(bill.itemsBreakdown.subtotal ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST (CGST + SGST)</span>
                    <span>{formatCurrency((bill.itemsBreakdown.cgst ?? 0) + (bill.itemsBreakdown.sgst ?? 0))}</span>
                  </div>
                </div>
              )}
              {bill.paidAmount > 0 && (
                <div className="flex justify-between text-xs text-sage-deep font-medium pt-1">
                  <span>Already Paid</span>
                  <span>{formatCurrency(bill.paidAmount)}</span>
                </div>
              )}
            </div>
          )}
        </Card>

        {isPaid ? (
          <Card hover={false} className="text-center py-6 border-2 border-sage">
            <CheckCircle2 className="w-12 h-12 text-sage mx-auto mb-2" aria-hidden="true" />
            <h2 className="text-xl font-bold text-ink">Thank you! Payment received.</h2>
            <p className="text-sm text-ink-muted mt-1">
              Total settled: {formatCurrency(bill.totalAmount)}. You may show this screen to your server.
            </p>
          </Card>
        ) : (
          <Card hover={false} className="space-y-4">
            {actionError && (
              <p role="alert" className="rounded-lg bg-terra-pale px-3 py-2.5 text-sm text-terra">
                {actionError}
              </p>
            )}

            {methods.razorpay && (
              <Button
                className="w-full h-12 text-base"
                disabled={starting}
                isLoading={starting}
                onClick={() => startPayment('razorpay_link')}
              >
                <CreditCard className="w-5 h-5" aria-hidden="true" />
                Pay {formatCurrency(bill.remainingAmount)} Online (Razorpay)
              </Button>
            )}

            {methods.directUpi && upiLink && (
              <div className="space-y-3 text-center">
                {qrImg && (
                  <div className="inline-block p-3 bg-white rounded-xl border border-stone-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrImg} alt="Scan with any UPI app to pay" className="w-48 h-48" />
                  </div>
                )}
                <a href={upiLink} onClick={() => void fetch(`/api/public/pay/${params.billId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'upi_intent' }) }).catch(() => {})} className="block">
                  <Button variant={methods.razorpay ? 'ghost' : 'primary'} className="w-full h-12">
                    <Smartphone className="w-5 h-5" aria-hidden="true" />
                    Open UPI App (GPay / PhonePe / Paytm)
                    <ExternalLink className="w-4 h-4 ml-1" aria-hidden="true" />
                  </Button>
                </a>
                <p className="text-xs text-ink-muted">After paying via UPI app, let your server know so they confirm your receipt.</p>
              </div>
            )}

            {!methods.razorpay && !methods.directUpi && (
              <p className="text-sm text-ink-muted text-center py-2">
                Online Pay at Table is not enabled yet. Please pay your server or at the billing desk.
              </p>
            )}

            <button
              type="button"
              onClick={loadBill}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-ink-muted hover:text-ink pt-1"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Refresh payment status
            </button>
          </Card>
        )}

        <footer className="text-center text-xs text-ink-muted pt-2">
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
        </footer>
      </div>
    </div>
  );
}
