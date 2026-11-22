'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, QrCode, Copy, Check, Edit, Trash2 } from 'lucide-react';
import type { Table } from './types';

interface TableCardProps {
  table: Table;
  isCopied: boolean;
  onCopyQrLink: (table: Table) => void;
  onEdit: (table: Table) => void;
  onDelete: (table: Table) => void;
}

export function TableCard({
  table,
  isCopied,
  onCopyQrLink,
  onEdit,
  onDelete,
}: TableCardProps) {
  return (
    <Card hover className="overflow-hidden">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg text-ink">Table {table.tableNumber}</h3>
            {table.section && (
              <Badge variant="stone" className="text-xs font-semibold">
                {table.section}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-ink-muted">
            <Users className="w-3.5 h-3.5" />
            <span>Seats {table.capacity}</span>
          </div>
        </div>
        <Badge variant="sage" className="text-xs shrink-0">
          <QrCode className="w-3 h-3 mr-1" />
          QR Ready
        </Badge>
      </div>

      {table.tags && table.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {table.tags.map((tag, idx) => (
            <span
              key={idx}
              className="text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-ink-soft font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {table.qrCode && (
        <div className="bg-stone-50 rounded-lg p-3 mb-4">
          <p className="text-xs text-ink-muted mb-1">QR Menu Link</p>
          <p className="text-sm text-ink font-mono truncate">{table.qrCode}</p>
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-stone-200">
        {table.qrCode && (
          <Link href="/dashboard/restaurant/qr" className="flex-1">
            <Button size="sm" variant="ghost" className="w-full">
              <QrCode className="w-4 h-4" /> Print QR
            </Button>
          </Link>
        )}
        {table.qrCode && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1"
            onClick={() => onCopyQrLink(table)}
          >
            {isCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {isCopied ? 'Copied!' : 'Copy Link'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => onEdit(table)}
        >
          <Edit className="w-4 h-4" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500"
          onClick={() => onDelete(table)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
