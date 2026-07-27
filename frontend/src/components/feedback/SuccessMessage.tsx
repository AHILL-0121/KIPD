'use client';

import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface SuccessMessageProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  scene?: 'success' | 'booking-confirmed';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function SuccessMessage({ 
  title, 
  message, 
  actionLabel, 
  onAction,
  scene = 'success',
  size = 'lg'
}: SuccessMessageProps) {
  return (
    <motion.div 
      className="flex flex-col items-center justify-center py-12 px-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <KipdIllustration scene={scene} size={size} />
      
      <h2 className="text-3xl font-display text-ink mt-8 mb-3 text-center">
        {title}
      </h2>
      
      <p className="text-ink-muted text-center max-w-md mb-8">
        {message}
      </p>
      
      {actionLabel && onAction && (
        <Button variant="primary" size="lg" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
