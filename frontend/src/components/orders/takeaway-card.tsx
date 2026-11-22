'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Receipt } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { orderStatus } from '@/lib/order-status';
import type { Order } from './types';

interface TakeawayCardProps {
  order: Order;
  index: number;
  onSettle: (order: Order) => void;
  onUpdateStatus: (orderId: string, status: string) => void;
}

export function TakeawayCard({
  order,
  index,
  onSettle,
  onUpdateStatus,
}: TakeawayCardProps) {
  return (
    <Card hover={false}>
      <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-10 w-10 rounded-full bg-amber-pale text-amber-deep flex items-center justify-center font-bold"
          >
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-ink">Take-away #{index + 1}</h3>
            {order.specialInstructions && order.specialInstructions.startsWith('Customer:') && (
              <p className="text-xs font-semibold text-amber-deep">
                {order.specialInstructions.split(' · ')[0]}
              </p>
            )}
            <p className="text-xs text-ink-muted">
              {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={orderStatus(order.status).tone} dot>
            {orderStatus(order.status).label}
          </Badge>
          <span className="font-bold text-ink">
            {formatCurrency(Number(order.totalAmount))}
          </span>
        </div>
      </div>
      <div className="space-y-1 mb-4">
        {(order.orderItems || []).map((item, idx) => (
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
      <div className="flex gap-2 pt-3 border-t border-stone-200 mt-auto">
        {order.status === 'ready' && (
          <Button
            size="sm"
            variant="sage"
            className="flex-1"
            onClick={() => onUpdateStatus(order.id, 'served')}
          >
            Mark handed over
          </Button>
        )}
        <Button size="sm" className="flex-1" onClick={() => onSettle(order)}>
          <Receipt className="w-4 h-4 mr-1.5" aria-hidden="true" /> Settle bill
        </Button>
      </div>
    </Card>
  );
}
