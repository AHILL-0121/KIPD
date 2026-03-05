'use client';

import { KipdIllustration } from '@/components/mascot/KipdIllustration';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullScreen?: boolean;
}

export function LoadingState({ 
  message = "Fetching your data...", 
  size = 'md',
  fullScreen = false 
}: LoadingStateProps) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-canvas/95 backdrop-blur-sm flex items-center justify-center z-50">
        <KipdIllustration scene="loading" size={size} message={message} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-16">
      <KipdIllustration scene="loading" size={size} message={message} />
    </div>
  );
}
