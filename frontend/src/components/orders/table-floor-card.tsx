'use client';

import { Users, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { useAppMessages } from '@/components/ui/i18n-provider';
import type { TableOption, TableTab } from './types';

interface TableFloorCardProps {
  table: TableOption;
  tab?: TableTab;
  onSelect: (tableId: string) => void;
  onOpenNewOrder: (tableId: string) => void;
}

export function TableFloorCard({
  table,
  tab,
  onSelect,
  onOpenNewOrder,
}: TableFloorCardProps) {
  const m = useAppMessages();
  const isOccupied = Boolean(tab);

  return (
    <button
      type="button"
      onClick={() => {
        if (isOccupied && tab) {
          const el = document.getElementById(`table-tab-${table.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            onSelect(table.id);
          }
        } else {
          onOpenNewOrder(table.id);
        }
      }}
      className={`group flex flex-col justify-between text-left min-h-[142px] p-4 bg-white border rounded-xl shadow-sm transition-all hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        isOccupied
          ? 'border-amber/50 hover:border-amber focus-visible:outline-amber bg-amber-pale/10'
          : 'border-stone-200 hover:border-emerald-600 focus-visible:outline-emerald-500'
      }`}
    >
      {/* Header: Table Number & Status Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[1.375rem] font-bold leading-tight text-ink group-hover:text-amber-deep transition-colors">
            {m.orders.tablePrefix} {table.tableNumber}
          </span>
          {table.section && (
            <span className="text-xs font-semibold text-ink-muted mt-0.5">
              {table.section}
            </span>
          )}
        </div>
        <Badge variant={isOccupied ? 'amber' : 'sage'} dot>
          {isOccupied ? m.orders.occupied : m.orders.available}
        </Badge>
      </div>

      {/* Middle: Capacity & Tags */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Users className="w-3.5 h-3.5 text-ink-soft shrink-0" aria-hidden="true" />
          <span>{m.orders.seatsPrefix} {table.capacity}</span>
        </div>

        {table.tags && table.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {table.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-ink-soft font-medium leading-none"
              >
                {tag}
              </span>
            ))}
            {table.tags.length > 3 && (
              <span className="text-[10px] px-1 rounded bg-stone-100 text-ink-muted font-medium leading-none">
                +{table.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer / Status Note */}
      <div className="mt-3 pt-2.5 border-t border-dashed border-stone-200 flex items-center justify-between text-xs">
        {isOccupied && tab ? (
          <>
            <span className="font-semibold text-ink">
              {tab.tickets.length} {tab.tickets.length === 1 ? m.orders.ticketSingle : m.orders.ticketPlural}
            </span>
            <span className="font-bold text-amber-deep">
              {formatCurrency(tab.total)}
            </span>
          </>
        ) : (
          <span className="text-emerald-700 font-semibold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {m.orders.readyToSeat}
          </span>
        )}
      </div>
    </button>
  );
}
