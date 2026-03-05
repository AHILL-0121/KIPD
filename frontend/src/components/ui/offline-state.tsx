'use client';

import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { Button } from './button';
import { RefreshCw } from 'lucide-react';

interface OfflineStateProps {
  onRetry?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function OfflineState({ onRetry, size = 'md' }: OfflineStateProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <KipdIllustration 
        scene="no-connection" 
        size={size} 
        message="No internet connection detected"
      />
      
      <h2 className="text-3xl font-display text-ink mt-6 mb-2">
        You're Offline
      </h2>
      
      <p className="text-ink-muted text-center max-w-md mb-8">
        Please check your internet connection and try again.
      </p>
      
      <Button variant="primary" onClick={handleRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Retry Connection
      </Button>
    </div>
  );
}
