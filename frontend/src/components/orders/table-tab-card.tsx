'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Receipt } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { orderStatus } from '@/lib/order-status';
import type { TableTab } from './types';

interface TableTabCardProps {
  tab: TableTab;
  onAddMore: (tableId: string) => void;
  onSettle: (tab: TableTab) => void;
  onUpdateStatus: (orderId: string, status: string) => void;
}

export function TableTabCard({
  tab,
  onAddMore,
  onSettle,
  onUpdateStatus,
}: TableTabCardProps) {
  return (
    <Card hover={false}>
      <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-4">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-12 w-12 rounded-full bg-amber-pale text-amber-deep flex items-center justify-center font-bold text-xl"
          >
            {tab.table.tableNumber}
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">Table {tab.table.tableNumber}</h2>
            <p className="text-sm text-ink-muted">
              {tab.tickets.length} {tab.tickets.length === 1 ? 'ticket' : 'tickets'} sent to the kitchen
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-ink-muted">Tab total</div>
          <div className="text-2xl font-bold text-ink">{formatCurrency(tab.total)}</div>
        </div>
      </div>

      <div className="space-y-4 mb-4">
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

      <div className="flex gap-3 pt-4 border-t border-stone-200">
        <Button
          variant="ghost"
          className="flex-1 bg-stone-100 hover:bg-stone-200"
          onClick={() => onAddMore(tab.table.id)}
        >
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Add more items
        </Button>
        <Button className="flex-1" onClick={() => onSettle(tab)}>
          <Receipt className="w-4 h-4 mr-2" aria-hidden="true" /> Settle bill
        </Button>
      </div>
    </Card>
  );
}
