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
}

export default function BillingPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  useEffect(() => {
    fetch('/api/billing')
      .then(res => res.json())
      .then(data => setBills(data))
      .catch(console.error);
  }, []);

  const openBills = bills.filter(b => b.status === 'open' || b.status === 'partial');
  const recentPaid = bills.filter(b => b.status === 'paid').slice(0, 5);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="section-title">Billing & Invoices</h1>
        <p className="section-sub">Unified guest billing and payment tracking</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
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

      <div className="grid grid-cols-2 gap-6">
        {/* Open Bills */}
        <div>
          <h2 className="font-serif text-xl font-bold mb-4">Open Bills</h2>
          <div className="space-y-3">
            {openBills.map((bill) => (
              <Card 
                key={bill.id} 
                hover 
                className="cursor-pointer"
                onClick={() => setSelectedBill(bill)}
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
          </div>
        </div>

        {/* Bill Details */}
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

              {/* Items Breakdown */}
              <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
                {selectedBill.items.map((item, idx) => (
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
              </div>

              {/* Totals */}
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

              {/* Actions */}
              <div className="space-y-3">
                <Button variant="sage" className="w-full">
                  <CreditCard className="w-4 h-4" />
                  Record Payment
                </Button>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="ghost">
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
