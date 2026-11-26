'use client';

import { X, Plus, Receipt, GitMerge } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { orderStatus } from '@/lib/order-status';
import type { TableTab } from './types';

interface TableDetailDrawerProps {
  tab: TableTab | null;
  onClose: () => void;
  onAddMore: (tableId: string) => void;
  onSettle: (tab: TableTab) => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  onMergeTable?: (tab: TableTab) => void;
  canMerge?: boolean;
}

export function TableDetailDrawer({
  tab,
  onClose,
  onAddMore,
  onSettle,
  onUpdateStatus,
  onMergeTable,
  canMerge = false,
}: TableDetailDrawerProps) {
  if (!tab) return null;

  return (
    <Dialog
      open={Boolean(tab)}
      onClose={onClose}
      labelledBy="table-tab-detail-title"
      variant="drawer"
    >
      <div className="flex flex-col h-full">
        <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="table-tab-detail-title" className="text-2xl font-bold text-ink">
                Table {tab.table.tableNumber}
              </h2>
              <Badge variant="amber" dot>Occupied</Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-ink-muted">
              {tab.table.section && <span>{tab.table.section} · </span>}
              <span>Seats {tab.table.capacity}</span>
              <span>· {tab.tickets.length} {tab.tickets.length === 1 ? 'ticket' : 'tickets'} sent</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-ink-muted hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Tab Summary Card */}
          <div className="flex items-center justify-between p-4 bg-amber-pale/40 border border-amber/30 rounded-xl">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-amber-deep">
                Running Tab Total
              </span>
              <div className="text-2xl font-bold text-ink mt-0.5">
                {formatCurrency(tab.total)}
              </div>
            </div>
            <div className="text-right text-xs text-ink-muted">
              <span>{tab.tickets.reduce((acc, tk) => acc + (tk.orderItems?.length || 0), 0)} items in total</span>
            </div>
          </div>

          {/* Tickets list */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
              Tickets Sent to Kitchen
            </h3>
            {tab.tickets.map((ticket, i) => (
              <div key={ticket.id} className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                <div className="flex items-center justify-between mb-3 border-b border-stone-200 pb-2">
                  <span className="text-sm font-semibold text-ink-soft">
                    Ticket {i + 1}{' '}
                    <span className="font-normal text-ink-muted">
                      · {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                    </span>
                    {ticket.source === 'guest' && (
                      <span className="font-normal text-amber-deep"> · Ordered by guest (QR)</span>
                    )}
                  </span>
                  <Badge variant={orderStatus(ticket.status).tone} dot>
                    {orderStatus(ticket.status).label}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {(ticket.orderItems || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-ink">
                        <span className="font-semibold text-amber-deep mr-2">{item.quantity}×</span>
                        {item.menuItem?.name || 'Item'}
                      </span>
                      <span className="text-ink-muted">
                        {formatCurrency(Number(item.price) * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                {ticket.specialInstructions && (
                  <p className="mt-2 text-xs italic text-ink-muted bg-stone-100 p-2 rounded">
                    Note: {ticket.specialInstructions}
                  </p>
                )}
                {ticket.status === 'ready' && (
                  <Button
                    size="sm"
                    variant="sage"
                    className="w-full mt-3"
                    onClick={() => onUpdateStatus(ticket.id, 'served')}
                  >
                    Mark as served
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-stone-200 bg-white flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="flex-1 bg-stone-100 hover:bg-stone-200"
            onClick={() => {
              const tableId = tab.table.id;
              onClose();
              onAddMore(tableId);
            }}
          >
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Add more items
          </Button>
          {canMerge && onMergeTable && (
            <Button
              variant="ghost"
              className="bg-stone-100 hover:bg-stone-200"
              onClick={() => {
                const tabToMerge = tab;
                onClose();
                onMergeTable(tabToMerge);
              }}
            >
              <GitMerge className="w-4 h-4 mr-1.5" aria-hidden="true" /> Merge
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={() => {
              const tabToCheckout = tab;
              onClose();
              onSettle(tabToCheckout);
            }}
          >
            <Receipt className="w-4 h-4 mr-2" aria-hidden="true" /> Settle bill
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
