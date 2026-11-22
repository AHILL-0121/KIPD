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
    <Card hover className="overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-ink mb-1">{item.name}</h3>
          <p className="text-sm text-ink-muted line-clamp-2">{item.description}</p>
        </div>
        <div className="ml-3">
          <div className="font-bold text-xl text-amber">
            {formatCurrency(Number(item.price))}
          </div>
        </div>
      </div>

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

      <div className="flex gap-2 pt-3 border-t border-stone-200">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => onToggleAvailability(item)}
        >
          {item.isAvailable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {item.isAvailable ? 'Hide' : 'Show'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => onEdit(item)}
        >
          <Edit className="w-4 h-4" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500"
          onClick={() => onDelete(item)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
