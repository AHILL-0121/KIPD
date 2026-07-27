'use client';

import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface MaintenanceModeProps {
  title?: string;
  message?: string;
  estimatedTime?: string;
  onRefresh?: () => void;
}

export default function MaintenanceMode({
  title = "System Maintenance",
  message = "We're currently performing scheduled maintenance to improve your experience. We'll be back shortly!",
  estimatedTime,
  onRefresh
}: MaintenanceModeProps) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <KipdIllustration scene="maintenance" size="xl" />
        
        <h1 className="text-5xl font-display text-ink mt-8 mb-4">
          {title}
        </h1>
        
        <p className="text-lg text-ink-muted mb-6 font-serif max-w-lg mx-auto">
          {message}
        </p>
        
        {estimatedTime && (
          <p className="text-sm text-ink-muted/70 mb-8">
            Estimated time: {estimatedTime}
          </p>
        )}
        
        <Button 
          variant="primary" 
          size="lg" 
          onClick={onRefresh || (() => window.location.reload())}
          className="gap-2"
        >
          <RefreshCw className="h-5 w-5" />
          Check Again
        </Button>
      </div>
    </div>
  );
}
