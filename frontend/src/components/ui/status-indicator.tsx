'use client';

interface StatusIndicatorProps {
  label: string;
  status: 'live' | 'idle' | 'error';
  className?: string;
}

export function StatusIndicator({ label, status, className = '' }: StatusIndicatorProps) {
  const statusConfig = {
    live: { color: 'text-sage', bg: 'bg-sage' },
    idle: { color: 'text-amber-deep', bg: 'bg-amber-deep' },
    error: { color: 'text-terra', bg: 'bg-terra' },
  };

  const config = statusConfig[status];

  return (
    <div className={`inline-flex items-center gap-2 ${config.color} ${className}`}>
      <div className="relative">
        <span className={`block w-2 h-2 rounded-full ${config.bg}`} />
        {status === 'live' && (
          <span className={`absolute inset-0 rounded-full ${config.bg} animate-ping opacity-75`} />
        )}
      </div>
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
    </div>
  );
}
