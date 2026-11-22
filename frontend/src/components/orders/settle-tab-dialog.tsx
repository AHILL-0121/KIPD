'use client';

import { Receipt, Package } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import type { Order, TableTab } from './types';

interface SettleTableDialogProps {
  tab: TableTab | null;
  onClose: () => void;
  saving: boolean;
  onSettle: (paymentMethod: 'cash' | 'upi') => void;
}

export function SettleTableDialog({
  tab,
  onClose,
  saving,
  onSettle,
}: SettleTableDialogProps) {
  if (!tab) return null;

  return (
    <Dialog
      open={!!tab}
      onClose={onClose}
      labelledBy="settle-title"
      dismissible={!saving}
      className="p-8 max-w-md w-full"
    >
      <div className="text-center mb-6">
        <div
          aria-hidden="true"
          className="h-16 w-16 bg-amber-pale text-amber-deep rounded-full flex items-center justify-center font-bold text-3xl mx-auto mb-3"
        >
          {tab.table.tableNumber}
        </div>
        <h2 id="settle-title" className="text-2xl font-bold text-ink">
          Settle table {tab.table.tableNumber}
        </h2>
        <p className="text-lg text-ink font-bold mt-2">Total: {formatCurrency(tab.total)}</p>
        <p className="text-sm text-ink-muted">
          {tab.tickets.length} {tab.tickets.length === 1 ? 'ticket' : 'tickets'} on this tab
        </p>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full py-6 text-lg"
          disabled={saving}
          onClick={() => onSettle('cash')}
        >
          <Receipt className="w-5 h-5 mr-2" aria-hidden="true" /> Send bill to front desk
        </Button>
        <Button variant="ghost" className="w-full mt-2" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

interface SettleTakeawayDialogProps {
  order: Order | null;
  onClose: () => void;
  saving: boolean;
  onSettle: (paymentMethod?: 'cash' | 'upi') => void;
}

export function SettleTakeawayDialog({
  order,
  onClose,
  saving,
  onSettle,
}: SettleTakeawayDialogProps) {
  if (!order) return null;

  return (
    <Dialog
      open={!!order}
      onClose={onClose}
      labelledBy="settle-takeaway-title"
      dismissible={!saving}
      className="p-8 max-w-md w-full"
    >
      <div className="text-center mb-6">
        <div
          aria-hidden="true"
          className="h-16 w-16 bg-amber-pale text-amber-deep rounded-full flex items-center justify-center font-bold text-3xl mx-auto mb-3"
        >
          <Package className="w-8 h-8" />
        </div>
        <h2 id="settle-takeaway-title" className="text-2xl font-bold text-ink">
          Settle Take-away
        </h2>
        {order.specialInstructions && order.specialInstructions.startsWith('Customer:') && (
          <p className="text-sm font-semibold text-amber-deep mt-1">
            {order.specialInstructions.split(' · ')[0]}
          </p>
        )}
        <p className="text-2xl font-bold text-ink mt-3">
          {formatCurrency(Number(order.totalAmount))}
        </p>
        <p className="text-sm text-ink-muted mt-1">
          {order.orderItems?.length ?? 0} item{order.orderItems?.length === 1 ? '' : 's'} on this order
        </p>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full py-6 text-lg"
          disabled={saving}
          onClick={() => onSettle('cash')}
        >
          <Receipt className="w-5 h-5 mr-2" aria-hidden="true" /> Send bill to billing
        </Button>
        <Button variant="ghost" className="w-full mt-2" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
