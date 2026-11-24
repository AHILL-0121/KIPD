'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Edit, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { MenuItem } from './types';

interface MenuItemCardProps {
  item: MenuItem;
  onToggleAvailability: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}

export function MenuItemCard({
  item,
  onToggleAvailability,
  onEdit,
  onDelete,
}: MenuItemCardProps) {
  return (
    <Card hover className="overflow-hidden flex flex-col justify-between">
      <div>
        {item.imageUrl && (
          <div className="relative w-full h-40 -mt-6 -mx-6 mb-4 overflow-hidden border-b border-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            />
          </div>
        )}

        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 pr-2">
            <h3 className="font-semibold text-lg text-ink mb-1">{item.name}</h3>
            <p className="text-sm text-ink-muted line-clamp-2">{item.description}</p>
          </div>
          <div className="ml-2 text-right">
            <div className="font-bold text-xl text-amber">
              {formatCurrency(Number(item.price))}
            </div>
            {item.variants && item.variants.length > 0 && (
              <span className="text-[11px] text-ink-muted">+{item.variants.length} sizes</span>
            )}
          </div>
        </div>

        {/* Variants pill list */}
        {item.variants && item.variants.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {item.variants.map((v, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 text-[11px] bg-stone-100 text-ink-soft px-2 py-0.5 rounded-md font-medium"
              >
                <span>{v.name}:</span>
                <span className="font-semibold text-ink">₹{v.price}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-4">
          <Badge variant="stone" className="text-xs">
            {item.category?.name || 'Uncategorized'}
          </Badge>
          {(item.tags || []).map((tag) => (
            <Badge key={tag} variant="amber" className="text-xs">
              {tag}
            </Badge>
          ))}
          <Badge variant={item.isAvailable ? 'sage' : 'stone'} className="text-xs">
            {item.isAvailable ? 'Available' : 'Unavailable'}
          </Badge>
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t border-stone-200 mt-auto">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => onToggleAvailability(item)}
        >
          {item.isAvailable ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
          {item.isAvailable ? 'Hide' : 'Show'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => onEdit(item)}
        >
          <Edit className="w-4 h-4 mr-1" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500"
          onClick={() => onDelete(item)}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
