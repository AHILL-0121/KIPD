'use client';

import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { Button } from './button';
import { Plus, LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface EmptyStateProps {
  title: string;
  description?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: string;
  icon?: LucideIcon;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function EmptyState({ 
  title, 
  description,
  message,
  actionLabel, 
  onAction,
  action,
  icon: Icon,
  size = 'md'
}: EmptyStateProps) {
  const displayMessage = message || description;
  
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {Icon ? (
        <div className="mb-6 p-4 rounded-full bg-amber-50">
          <Icon className="h-12 w-12 text-amber-600" />
        </div>
      ) : (
        <KipdIllustration scene="empty" size={size} />
      )}
      
      <h3 className="text-2xl font-display text-ink mt-6 mb-2">
        {title}
      </h3>
      
      {displayMessage && (
        <p className="text-ink-muted text-center max-w-md mb-8">
          {displayMessage}
        </p>
      )}
      
      {actionLabel && action && (
        <Link href={action}>
          <Button variant="primary" className="gap-2">
            <Plus className="h-4 w-4" />
            {actionLabel}
          </Button>
        </Link>
      )}
      
      {actionLabel && onAction && !action && (
        <Button variant="primary" onClick={onAction} className="gap-2">
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
