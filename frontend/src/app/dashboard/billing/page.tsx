'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Receipt, DollarSign, CreditCard, Printer, Send } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

interface Bill {
  id: string;
  guestName: string;
  bookingId?: string;
  roomNumber?: string;
  items: Array<{
    type: 'room' | 'food' | 'service';
    description: string;
    amount: number;
    date: string;
  }>;
  totalAmount: number;
  paidAmount: number;
  status: 'open' | 'paid' | 'partial';
  createdAt: string;
  receipt?: {
    subtotal: number;
    cgst: number;
    sgst: number;
    total: number;
    items: Array<{ name: string; qty: number; rate: number; amt: number }>;
  };
}

export default function BillingPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [viewMode, setViewMode] = useState<'open' | 'history'>('open');

  // Custom Receipt Config Binding
  const [receiptConfig, setReceiptConfig] = useState({
    header: 'KIPD RESTAURANT',
    subtext: 'GST INVOICE • WALK-IN',
    footer: 'WE ARE HAPPY TO SERVE YOU'
  });

  useEffect(() => {
    fetchBills();

    const savedConfig = localStorage.getItem('kipd-receipt-config');
    if (savedConfig) {
      try { setReceiptConfig(JSON.parse(savedConfig)); } catch (e) { }
    }

    // Bind real-time Front Desk Sync
    let eventSource: EventSource | null = null;
    let isMounted = true;

    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!isMounted) return; // Prevent zombie socket leaking due to pending fetch!

        if (data?.id) {
          eventSource = new EventSource(`/api/sse/kds/${data.id}`);
          eventSource.onmessage = (event) => {
            const ticket = JSON.parse(event.data);
            if (ticket.type !== 'connected') {
              fetchBills(); // Instantly sync new tabs settled from Waiter POS!
            }
          };
        }
      });

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const fetchBills = () => {
    fetch('/api/billing')
      .then(res => res.json())
      .then(data => setBills(data))
      .catch(console.error);
  };

  const handleRecordPayment = async () => {
    if (!selectedBill) return;

    try {
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: selectedBill.id,
          paymentMethod: 'cash' // Hardcoded cash mapping for Walk-in Cashier flow
        })
      });

      if (!res.ok) throw new Error('Failed to record payment');

      setSelectedBill(null);
      fetchBills(); // Fetch global metrics automatically
    } catch (err) {
      console.error(err);
      alert('Failed to authorize transaction');
    }
  };

  const openBills = bills.filter(b => b.status === 'open' || b.status === 'partial');
  const allPaidBills = bills.filter(b => b.status === 'paid');
  const recentPaid = allPaidBills.slice(0, 5);

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
          <h1 className="section-title">Billing & Invoices</h1>
          <p className="section-sub">Unified guest billing and payment tracking</p>
        </div>
        <div className="flex bg-stone-200/50 rounded-lg p-1 w-fit border border-stone-200">
          <button
            onClick={() => { setViewMode('open'); setSelectedBill(null); }}
            className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all ${viewMode === 'open' ? 'bg-white shadow-sm text-ink' : 'text-stone-500 hover:text-ink'}`}
          >
            Active Tabs
          </button>
          <button
            onClick={() => { setViewMode('history'); setSelectedBill(null); }}
            className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all ${viewMode === 'history' ? 'bg-white shadow-sm text-ink' : 'text-stone-500 hover:text-ink'}`}
          >
            Invoice History
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
        <Card hover={false} className="border-2 border-amber">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-ink mb-1">{formatCurrency(bills.reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0))}</div>
              <div className="text-sm text-ink-muted">Outstanding Balance</div>
            </div>
            <DollarSign className="w-8 h-8 text-amber" />
          </div>
        </Card>

        <Card hover={false} className="border-2 border-sage">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-ink mb-1">{openBills.length}</div>
              <div className="text-sm text-ink-muted">Open Bills</div>
            </div>
            <Receipt className="w-8 h-8 text-sage" />
          </div>
        </Card>

        <Card hover={false} className="border-2 border-terra">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-ink mb-1">{formatCurrency(recentPaid.reduce((sum, b) => sum + b.totalAmount, 0))}</div>
              <div className="text-sm text-ink-muted">Today's Collections</div>
            </div>
            <CreditCard className="w-8 h-8 text-terra" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
        {/* Left Column Feed */}
        <div className="print:hidden">

          {viewMode === 'open' && (
            <>
              <h2 className="font-serif text-xl font-bold mb-4">Open Bills</h2>
              <div className="space-y-3">
                {openBills.map((bill) => (
                  <Card
                    key={bill.id}
                    hover
                    className={`cursor-pointer transition-all ${selectedBill?.id === bill.id ? 'ring-2 ring-amber ring-offset-2 bg-amber-50/10' : ''}`}
                    onClick={() => setSelectedBill(selectedBill?.id === bill.id ? null : bill)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-ink">{bill.guestName}</h3>
                        {bill.roomNumber && (
                          <p className="text-sm text-ink-muted">Room {bill.roomNumber}</p>
                        )}
                      </div>
                      <Badge variant={bill.status === 'partial' ? 'amber' : 'stone'}>
                        {bill.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-stone-200">
                      <div className="text-sm text-ink-muted">
                        {bill.items.length} items
                      </div>
                      <div className="font-bold text-lg text-ink">
                        {formatCurrency(bill.totalAmount)}
                      </div>
                    </div>
                  </Card>
                ))}
                {openBills.length === 0 && (
                  <div className="text-center p-8 text-stone-400 border border-dashed border-stone-200 rounded-xl">No open bills</div>
                )}
              </div>


            </>
          )}

          {viewMode === 'history' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-xl font-bold text-ink">Archive</h2>
                <Badge variant="stone">{allPaidBills.length} Total Invoices</Badge>
              </div>
              <div className="space-y-3">
                {allPaidBills.map((bill) => (
                  <Card
                    key={bill.id}
                    hover
                    className={`cursor-pointer transition-all border-l-4 border-l-sage ${selectedBill?.id === bill.id ? 'ring-2 ring-sage ring-offset-2 bg-sage-50/10 opacity-100' : 'opacity-90 hover:opacity-100'}`}
                    onClick={() => setSelectedBill(selectedBill?.id === bill.id ? null : bill)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-ink">{bill.guestName}</h3>
                        <p className="text-xs text-stone-400 font-mono mt-1">
                          {new Date(bill.createdAt).toLocaleDateString()} at {new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="font-bold text-lg text-ink">
                          {formatCurrency(bill.totalAmount)}
                        </div>
                        <Badge variant="sage" className="mt-1">{bill.status}</Badge>
                      </div>
                    </div>
                  </Card>
                ))}
                {allPaidBills.length === 0 && (
                  <div className="text-center p-8 text-stone-400 border border-dashed border-stone-200 rounded-xl">No historical invoices found.</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Column: Thermal Receipt Preview */}
        <div>
          {selectedBill ? (
            <Card hover={false} className="sticky top-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-ink">{selectedBill.guestName}</h2>
                  {selectedBill.roomNumber && (
                    <p className="text-ink-muted">Room {selectedBill.roomNumber}</p>
                  )}
                </div>
                <Badge variant="amber">{selectedBill.status}</Badge>
              </div>

              {/* Receipt / Items Breakdown */}
              {selectedBill.receipt ? (
                <div id="thermal-receipt-container" className="mb-6 w-full max-w-[300px] mx-auto">
                  <div id="thermal-receipt" className="p-4 bg-white border border-stone-200 rounded-md font-mono text-xs w-full shadow-sm">
                    <div className="text-center mb-4 pb-4 border-b border-dashed border-stone-300">
                      <h3 className="font-bold text-lg leading-tight uppercase tracking-widest mb-1">{receiptConfig.header}</h3>
                      <p className="text-[10px] text-stone-500 uppercase leading-none">{receiptConfig.subtext}</p>
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
                        {selectedBill.receipt.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-stone-100/50">
                            <td className="py-2 pr-2">{item.name}</td>
                            <td className="py-2 text-center text-stone-600">{item.qty}</td>
                            <td className="py-2 text-right text-stone-600">{item.rate}</td>
                            <td className="py-2 text-right font-medium">{item.amt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="space-y-1 mb-4 pt-2 border-t border-dashed border-stone-300 w-3/4 ml-auto">
                      <div className="flex justify-between text-[11px] text-stone-600">
                        <span>Sub Total:</span>
                        <span>Rs {selectedBill.receipt.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-600">
                        <span>SGST (2.5%):</span>
                        <span>Rs {selectedBill.receipt.sgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-600 pb-2">
                        <span>CGST (2.5%):</span>
                        <span>Rs {selectedBill.receipt.cgst.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-bold text-sm border-y border-dashed border-stone-300 py-2 mb-6 w-full">
                      <span>TOTAL</span>
                      <span>: Rs {selectedBill.receipt.total.toFixed(2)}</span>
                    </div>

                    <div className="text-center">
                      <p className="text-[10px] text-stone-500 font-bold tracking-widest uppercase">{receiptConfig.footer}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
                  {selectedBill.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between py-2 border-b border-stone-100 text-sm">
                      <div>
                        <div className="text-ink font-medium">{item.description}</div>
                        <div className="text-xs text-ink-muted">
                          {new Date(item.date).toLocaleDateString()} • {item.type}
                        </div>
                      </div>
                      <div className="font-medium text-ink">{formatCurrency(item.amount)}</div>
                    </div>
                  ))}

                  <div className="space-y-2 mb-6 pt-4 border-t-2 border-stone-300">
                    <div className="flex justify-between text-ink-muted">
                      <span>Subtotal</span>
                      <span>{formatCurrency(selectedBill.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-ink-muted">
                      <span>Paid</span>
                      <span className="text-sage">-{formatCurrency(selectedBill.paidAmount)}</span>
                    </div>
                    <div className="flex justify-between text-2xl font-bold text-ink">
                      <span>Balance</span>
                      <span>{formatCurrency(selectedBill.totalAmount - selectedBill.paidAmount)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3 print:hidden">
                {selectedBill.status !== 'paid' && (
                  <Button variant="sage" className="w-full" onClick={handleRecordPayment}>
                    <CreditCard className="w-4 h-4" />
                    Record Payment (Cash)
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button variant="ghost" onClick={() => window.print()}>
                    <Printer className="w-4 h-4" />
                    Print
                  </Button>
                  <Button variant="ghost">
                    <Send className="w-4 h-4" />
                    Email
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-96 text-ink-muted">
              Select a bill to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
