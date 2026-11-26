'use client';

import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { Button } from './button';
import { RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { useAppMessages } from '@/components/ui/i18n-provider';

interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error & { digest?: string };
  reset?: () => void;
  showHomeButton?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function ErrorState({ 
  title,
  message,
  error,
  reset,
  showHomeButton = true,
  size = 'md'
}: ErrorStateProps) {
  const m = useAppMessages();
  const displayTitle = title ?? m.common.somethingWrong;
  const displayMessage = message ?? m.common.error;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <KipdIllustration scene="error" size={size} />
      
      <h2 className="text-3xl font-display text-ink mt-6 mb-2">
        {displayTitle}
      </h2>
      
      <p className="text-ink-muted text-center max-w-md mb-2">
        {displayMessage}
      </p>
      
      {error?.digest && (
        <p className="text-xs text-ink-muted/60 font-mono mb-8">
          Error ID: {error.digest}
        </p>
      )}
      
      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        {reset && (
          <Button variant="primary" onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {m.common.tryAgain}
          </Button>
        )}
        
        {showHomeButton && (
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <Home className="h-4 w-4" />
              {m.common.goHome}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
