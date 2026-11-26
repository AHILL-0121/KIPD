'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { IndianRupee, Hotel, UtensilsCrossed, Wallet, AlertCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { useQuery } from '@/hooks/use-query';
import { useAppMessages } from '@/components/ui/i18n-provider';
import { formatCurrency } from '@/lib/currency';

interface FinanceResponse {
  range: '7d' | '30d' | '90d' | 'all';
  summary: {
    hotelBilled: number;
    hotelCollected: number;
    restaurantBilled: number;
    restaurantCollected: number;
    totalCollected: number;
    totalRefunded: number;
    netCollected: number;
    outstanding: number;
  };
  byMethod: Array<{ method: string; amount: number; count: number }>;
  ledger: Array<{
    id: string;
    entryType: 'payment' | 'refund';
    kind: string;
    guestName: string;
    billId: string;
    amount: number;
    method: string;
    reference: string | null;
    receivedBy: string | null;
    note: string | null;
    createdAt: string;
  }>;
}

export default function FinancePage() {
  const m = useAppMessages();
  const methodLabels: Record<string, string> = m.finance.methods;
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const { data, isLoading, error, refetch } = useQuery<FinanceResponse>(`/api/finance?range=${range}`, [range]);

  if (isLoading && !data) return <LoadingState message={m.common.loading} />;
  if (error || !data) return <ErrorState message={error || m.common.error} reset={refetch} />;

  const { summary, byMethod, ledger } = data;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="section-title">{m.finance.title}</h1>
          <p className="section-sub">{m.finance.subtitle}</p>
        </div>

        <div role="group" aria-label="Time window" className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-stone-100">
          {([
            ['7d', m.finance.range7d],
            ['30d', m.finance.range30d],
            ['90d', m.finance.range90d],
            ['all', m.finance.rangeAll],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              aria-pressed={range === val}
              onClick={() => setRange(val)}
              className={`h-10 px-3.5 rounded-lg text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
                range === val ? 'bg-white text-ink font-semibold shadow-sm' : 'text-ink-soft font-medium hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        <Card hover={false}>
          <CardIcon variant="sage">
            <IndianRupee className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink">{formatCurrency(summary.netCollected)}</div>
          <div className="text-sm font-medium text-ink-soft mt-1">{m.finance.netCollected}</div>
          <div className="text-xs text-ink-muted mt-1">
            {formatCurrency(summary.totalCollected)} {m.finance.grossLabel} − {formatCurrency(summary.totalRefunded)} {m.finance.refundedLabel}
          </div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="amber">
            <Hotel className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink">{formatCurrency(summary.hotelCollected)}</div>
          <div className="text-sm font-medium text-ink-soft mt-1">{m.finance.hotelCollected}</div>
          <div className="text-xs text-ink-muted mt-1">
            {formatCurrency(summary.hotelBilled)} {m.finance.totalFolioBilled}
          </div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="amber">
            <UtensilsCrossed className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink">{formatCurrency(summary.restaurantCollected)}</div>
          <div className="text-sm font-medium text-ink-soft mt-1">{m.finance.restaurantCollected}</div>
          <div className="text-xs text-ink-muted mt-1">
            {formatCurrency(summary.restaurantBilled)} {m.finance.totalRestaurantBilled}
          </div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="terra">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-terra">{formatCurrency(summary.outstanding)}</div>
          <div className="text-sm font-medium text-ink-soft mt-1">{m.finance.openReceivable}</div>
          <div className="text-xs text-ink-muted mt-1">{m.finance.openReceivableSub}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Method Mix */}
        <Card hover={false}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle>{m.finance.byMethodTitle}</CardTitle>
              <CardDescription>{m.finance.byMethodSub}</CardDescription>
            </div>
            <Wallet className="w-5 h-5 text-amber-deep" aria-hidden="true" />
          </div>

          {byMethod.length === 0 ? (
            <p className="text-sm text-ink-muted py-6 text-center">{m.finance.noPayments}</p>
          ) : (
            <div className="space-y-3">
              {byMethod.map((mt) => (
                <div key={mt.method} className="flex items-center justify-between p-3 rounded-xl bg-cream border border-stone-200">
                  <div>
                    <div className="font-medium text-ink">{methodLabels[mt.method] || mt.method}</div>
                    <div className="text-xs text-ink-muted">
                      {mt.count} {mt.count === 1 ? m.finance.txSingle : m.finance.txPlural}
                    </div>
                  </div>
                  <div className="font-semibold text-ink">{formatCurrency(mt.amount)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-stone-200 flex gap-2">
            <Link href="/dashboard/billing/hotel" className="flex-1 text-center py-2 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-ink">
              {m.finance.hotelBillingLink}
            </Link>
            <Link href="/dashboard/billing/restaurant" className="flex-1 text-center py-2 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-ink">
              {m.finance.restaurantBillingLink}
            </Link>
          </div>
        </Card>

        {/* Ledger */}
        <Card hover={false} className="lg:col-span-2">
          <div className="mb-4">
            <CardTitle>{m.finance.recentTransactionsTitle}</CardTitle>
            <CardDescription>{m.finance.recentTransactionsSub}</CardDescription>
          </div>

          {ledger.length === 0 ? (
            <p className="text-sm text-ink-muted py-8 text-center">{m.finance.noTransactions}</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {ledger.map((row) => (
                <div key={`${row.entryType}-${row.id}`} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0 ${
                        row.entryType === 'refund' ? 'bg-terra-pale text-terra' : 'bg-sage-pale text-sage-deep'
                      }`}
                    >
                      {row.entryType === 'refund'
                        ? <ArrowDownLeft className="w-4 h-4" aria-hidden="true" />
                        : <ArrowUpRight className="w-4 h-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink truncate">{row.guestName}</span>
                        <Badge variant={row.kind === 'stay' ? 'amber' : 'stone'}>
                          {row.kind === 'stay' ? m.finance.hotelTag : m.finance.restaurantTag}
                        </Badge>
                        <span className="text-xs font-mono text-ink-muted">{methodLabels[row.method] || row.method}</span>
                      </div>
                      <div className="text-xs text-ink-muted truncate">
                        {format(new Date(row.createdAt), 'd MMM yyyy, h:mm a')}
                        {row.reference ? ` · Ref: ${row.reference}` : ''}
                        {row.receivedBy ? ` · By ${row.receivedBy}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className={`font-semibold text-sm ${row.entryType === 'refund' ? 'text-terra' : 'text-sage-deep'}`}>
                    {row.amount < 0 ? `-${formatCurrency(Math.abs(row.amount))}` : `+${formatCurrency(row.amount)}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
