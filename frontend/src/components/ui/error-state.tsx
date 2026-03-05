'use client';

import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { Button } from './button';
import { RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error & { digest?: string };
  reset?: () => void;
  showHomeButton?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function ErrorState({ 
  title = "Something Went Wrong",
  message = "We encountered an error while processing your request. Please try again.",
  error,
  reset,
  showHomeButton = true,
  size = 'md'
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <KipdIllustration scene="error" size={size} />
      
      <h2 className="text-3xl font-display text-ink mt-6 mb-2">
        {title}
      </h2>
      
      <p className="text-ink-muted text-center max-w-md mb-2">
        {message}
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
            Try Again
          </Button>
        )}
        
        {showHomeButton && (
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
