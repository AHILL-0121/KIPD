'use client';

import { motion } from 'framer-motion';

export type KipdScene = 
  | '404' 
  | 'loading' 
  | 'success' 
  | 'error' 
  | 'empty' 
  | 'no-connection' 
  | 'booking-confirmed' 
  | 'checkout' 
  | 'order-ready' 
  | 'maintenance'
  | 'default';

interface KipdIllustrationProps {
  scene?: KipdScene;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
  className?: string;
}

export function KipdIllustration({ scene = 'default', size = 'md', message, className }: KipdIllustrationProps) {
  const sizes = {
    sm: { width: 160, height: 140 },
    md: { width: 280, height: 220 },
    lg: { width: 360, height: 300 },
    xl: { width: 480, height: 400 },
  };

  const { width, height } = sizes[size];

  const renderScene = () => {
    switch (scene) {
      case '404':
        return <NotFoundScene />;
      case 'loading':
        return <LoadingScene />;
      case 'success':
        return <SuccessScene />;
      case 'error':
        return <ErrorScene />;
      case 'empty':
        return <EmptyScene />;
      case 'no-connection':
        return <NoConnectionScene />;
      case 'booking-confirmed':
        return <BookingConfirmedScene />;
      case 'checkout':
        return <CheckoutScene />;
      case 'order-ready':
        return <OrderReadyScene />;
      case 'maintenance':
        return <MaintenanceScene />;
      default:
        return <DefaultScene />;
    }
  };

  return (
    <div className={`flex flex-col items-center gap-4 ${className || ''}`}>
      <svg 
        width={width} 
        height={height} 
        viewBox="0 0 280 220" 
        fill="none"
        className="select-none"
      >
        {renderScene()}
      </svg>
      {message && (
        <p className="text-center text-ink-muted text-sm font-serif italic max-w-xs">
          {message}
        </p>
      )}
    </div>
  );
}

// Scene Components

function NotFoundScene() {
  return (
    <g>
      {/* Stars */}
      <motion.g
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <text x="18" y="40" fontSize="16" fill="#E8A020">✦</text>
      </motion.g>
      <motion.g
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 2, delay: 0.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <text x="245" y="55" fontSize="12" fill="#E8A020">✦</text>
      </motion.g>
      <motion.g
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 2, delay: 0.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <text x="60" y="18" fontSize="10" fill="#E8A020">✦</text>
      </motion.g>

      {/* 404 text background */}
      <text x="14" y="120" fontFamily="Georgia,serif" fontSize="96" fontWeight="700" fill="#F5C96A" opacity="0.35">404</text>

      {/* Kip - confused */}
      <motion.g 
        transform="translate(140,100)"
        animate={{ y: [0, -14, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Body */}
        <ellipse cx="0" cy="30" rx="52" ry="54" fill="#F5C96A"/>
        <ellipse cx="0" cy="40" rx="30" ry="28" fill="#FDF3DC"/>
        
        {/* Ears */}
        <ellipse cx="-38" cy="-10" rx="16" ry="22" fill="#E8A020" transform="rotate(-12 -38 -10)"/>
        <ellipse cx="-38" cy="-10" rx="9" ry="13" fill="#F5C96A" transform="rotate(-12 -38 -10)"/>
        <ellipse cx="38" cy="-10" rx="16" ry="22" fill="#E8A020" transform="rotate(12 38 -10)"/>
        <ellipse cx="38" cy="-10" rx="9" ry="13" fill="#F5C96A" transform="rotate(12 38 -10)"/>
        
        {/* X eyes */}
        <text x="-26" y="22" fontSize="20" fill="#1A1410" textAnchor="middle">×</text>
        <text x="26" y="22" fontSize="20" fill="#1A1410" textAnchor="middle">×</text>
        
        {/* Nose */}
        <ellipse cx="0" cy="30" rx="6" ry="4.5" fill="#C8573A"/>
        
        {/* Confused mouth */}
        <path d="M -14 42 Q 0 38 14 42" stroke="#C8573A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        
        {/* Sweat drop */}
        <ellipse cx="36" cy="5" rx="4" ry="6" fill="#A8D8EA" opacity="0.8"/>
        <ellipse cx="36" cy="3" rx="2" ry="1.5" fill="white" opacity="0.5"/>
        
        {/* Question mark */}
        <text x="56" y="-8" fontFamily="Georgia,serif" fontSize="28" fontWeight="700" fill="#E8A020">?</text>
        
        {/* Nightcap */}
        <path d="M -20 -14 Q -6 -66 0 -80 Q 6 -66 20 -14 Q 8 -20 0 -18 Q -8 -20 -20 -14 Z" fill="#C8573A" opacity="0.85"/>
        <circle cx="0" cy="-82" r="7" fill="#FDF3DC"/>
      </motion.g>

      {/* Shadow */}
      <motion.ellipse
        cx="140" cy="192" rx="48" ry="8" fill="#C47A10" opacity="0.15"
        animate={{ scaleX: [1, 0.75, 1], opacity: [0.15, 0.08, 0.15] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </g>
  );
}

function LoadingScene() {
  return (
    <g>
      {/* Spinner ring */}
      <motion.g
        transform="translate(140,100)"
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx="0" cy="0" r="68" stroke="#E8E0D0" strokeWidth="6" fill="none"/>
        <path d="M 0 -68 A 68 68 0 0 1 48 -48" stroke="#E8A020" strokeWidth="6" strokeLinecap="round" fill="none"/>
      </motion.g>

      {/* Kip - sleepy */}
      <motion.g
        transform="translate(140,100)"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
      >
        <ellipse cx="0" cy="30" rx="50" ry="52" fill="#F5C96A"/>
        <ellipse cx="0" cy="40" rx="28" ry="26" fill="#FDF3DC"/>
        
        {/* Ears */}
        <ellipse cx="-36" cy="-8" rx="15" ry="21" fill="#E8A020" transform="rotate(-12 -36 -8)"/>
        <ellipse cx="-36" cy="-8" rx="8" ry="12" fill="#F5C96A" transform="rotate(-12 -36 -8)"/>
        <ellipse cx="36" cy="-8" rx="15" ry="21" fill="#E8A020" transform="rotate(12 36 -8)"/>
        <ellipse cx="36" cy="-8" rx="8" ry="12" fill="#F5C96A" transform="rotate(12 36 -8)"/>
        
        {/* Half-closed eyes */}
        <path d="M -28 18 Q -20 14 -12 18" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" fill="none"/>
        <ellipse cx="-20" cy="22" rx="8" ry="5" fill="#1A1410"/>
        <path d="M 12 18 Q 20 14 28 18" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" fill="none"/>
        <ellipse cx="20" cy="22" rx="8" ry="5" fill="#1A1410"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="32" rx="5" ry="4" fill="#C8573A"/>
        
        {/* Small O mouth */}
        <ellipse cx="0" cy="44" rx="5" ry="6" fill="#C8573A" opacity="0.4"/>
        
        {/* ZZZ */}
        <text x="-52" y="-12" fontSize="18" fontFamily="Georgia,serif" fontStyle="italic" fill="#A89880" opacity="0.6">z</text>
        <text x="-58" y="-26" fontSize="14" fontFamily="Georgia,serif" fontStyle="italic" fill="#A89880" opacity="0.4">z</text>
        <text x="-64" y="-38" fontSize="11" fontFamily="Georgia,serif" fontStyle="italic" fill="#A89880" opacity="0.3">z</text>
      </motion.g>

      {/* Loading dots */}
      <g transform="translate(140,190)">
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx={-16 + i * 16}
            cy="0"
            r="4"
            fill="#E8A020"
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </g>

      {/* Shadow */}
      <motion.ellipse
        cx="140" cy="192" rx="46" ry="8" fill="#C47A10" opacity="0.15"
        animate={{ scaleX: [1, 0.75, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
      />
    </g>
  );
}

function SuccessScene() {
  return (
    <g>
      {/* Confetti */}
      {[...Array(6)].map((_, i) => (
        <motion.rect
          key={i}
          x={60 + i * 30}
          y="20"
          width="6"
          height="6"
          rx="1"
          fill={['#E8A020', '#C8573A', '#5E8C6A', '#E8A020', '#C8573A', '#5E8C6A'][i]}
          animate={{ 
            y: [20, 80],
            rotate: [0, 360],
            opacity: [1, 0]
          }}
          transition={{ 
            duration: 2, 
            delay: i * 0.2, 
            repeat: Infinity, 
            ease: 'easeIn' 
          }}
        />
      ))}

      {/* Check mark */}
      <motion.g
        transform="translate(220,40)"
        initial={{ scale: 0, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
      >
        <circle cx="0" cy="0" r="20" fill="#5E8C6A"/>
        <path d="M -8 0 L -3 6 L 8 -6" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </motion.g>

      {/* Kip - joyful */}
      <motion.g
        transform="translate(140,110)"
        animate={{ y: [0, -18, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ellipse cx="0" cy="25" rx="54" ry="56" fill="#F5C96A"/>
        <ellipse cx="0" cy="38" rx="32" ry="30" fill="#FDF3DC"/>
        
        {/* Ears */}
        <ellipse cx="-40" cy="-12" rx="16" ry="23" fill="#E8A020" transform="rotate(-15 -40 -12)"/>
        <ellipse cx="-40" cy="-12" rx="9" ry="14" fill="#F5C96A" transform="rotate(-15 -40 -12)"/>
        <ellipse cx="40" cy="-12" rx="16" ry="23" fill="#E8A020" transform="rotate(15 40 -12)"/>
        <ellipse cx="40" cy="-12" rx="9" ry="14" fill="#F5C96A" transform="rotate(15 40 -12)"/>
        
        {/* Happy eyes */}
        <path d="M -30 16 Q -22 10 -14 16" stroke="#1A1410" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
        <path d="M 14 16 Q 22 10 30 16" stroke="#1A1410" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="28" rx="6" ry="4.5" fill="#C8573A"/>
        
        {/* Big smile */}
        <path d="M -18 38 Q 0 48 18 38" stroke="#C8573A" strokeWidth="3" fill="none" strokeLinecap="round"/>
        
        {/* Raised arms */}
        <ellipse cx="-50" cy="20" rx="12" ry="8" fill="#E8A020" transform="rotate(-35 -50 20)"/>
        <ellipse cx="50" cy="20" rx="12" ry="8" fill="#E8A020" transform="rotate(35 50 20)"/>
      </motion.g>

      {/* Shadow */}
      <motion.ellipse
        cx="140" cy="198" rx="50" ry="8" fill="#C47A10" opacity="0.15"
        animate={{ scaleX: [1, 0.75, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </g>
  );
}

function ErrorScene() {
  return (
    <g>
      {/* X mark */}
      <motion.g
        transform="translate(220,45)"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="0" cy="0" r="20" fill="#C8573A"/>
        <path d="M -8 -8 L 8 8 M 8 -8 L -8 8" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
      </motion.g>

      {/* Smoke puffs */}
      {[0, 1, 2].map((i) => (
        <motion.ellipse
          key={i}
          cx="220"
          cy="70"
          rx="8"
          ry="6"
          fill="#A89880"
          opacity="0.6"
          animate={{ 
            y: [-24, 0],
            scale: [1, 1.4],
            opacity: [0.6, 0]
          }}
          transition={{ 
            duration: 2, 
            delay: i * 0.5, 
            repeat: Infinity, 
            ease: 'easeOut' 
          }}
        />
      ))}

      {/* Kip - sad */}
      <motion.g
        transform="translate(135,108)"
        animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
        transition={{ duration: 3, repeat: Infinity, times: [0, 0.83, 0.86, 0.89, 0.92, 1] }}
      >
        <ellipse cx="0" cy="28" rx="52" ry="54" fill="#F5C96A"/>
        <ellipse cx="0" cy="38" rx="30" ry="28" fill="#FDF3DC"/>
        
        {/* Ears - droopy */}
        <ellipse cx="-38" cy="-6" rx="15" ry="22" fill="#E8A020" transform="rotate(-8 -38 -6)"/>
        <ellipse cx="-38" cy="-6" rx="8" ry="13" fill="#F5C96A" transform="rotate(-8 -38 -6)"/>
        <ellipse cx="38" cy="-6" rx="15" ry="22" fill="#E8A020" transform="rotate(8 38 -6)"/>
        <ellipse cx="38" cy="-6" rx="8" ry="13" fill="#F5C96A" transform="rotate(8 38 -6)"/>
        
        {/* Worried eyes */}
        <ellipse cx="-20" cy="18" rx="8" ry="10" fill="#1A1410"/>
        <ellipse cx="20" cy="18" rx="8" ry="10" fill="#1A1410"/>
        <ellipse cx="-20" cy="16" rx="3" ry="3" fill="white"/>
        <ellipse cx="20" cy="16" rx="3" ry="3" fill="white"/>
        
        {/* Worried brows */}
        <path d="M -30 8 Q -20 6 -10 8" stroke="#1A1410" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        <path d="M 10 8 Q 20 6 30 8" stroke="#1A1410" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="30" rx="5" ry="4" fill="#C8573A"/>
        
        {/* Sad mouth */}
        <path d="M -14 46 Q 0 42 14 46" stroke="#C8573A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        
        {/* Tear */}
        <ellipse cx="-28" cy="26" rx="3" ry="5" fill="#A8D8EA" opacity="0.8"/>
        <ellipse cx="-28" cy="24" rx="1.5" ry="1.5" fill="white" opacity="0.5"/>
      </motion.g>

      {/* Shadow */}
      <ellipse cx="135" cy="195" rx="48" ry="8" fill="#C47A10" opacity="0.15"/>
    </g>
  );
}

function EmptyScene() {
  return (
    <g>
      {/* Magnifying glass */}
      <motion.g
        transform="translate(200,60)"
        animate={{ rotate: [-5, -5], y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="0" cy="0" r="18" fill="none" stroke="#C8BBA8" strokeWidth="4"/>
        <circle cx="0" cy="0" r="12" fill="none" stroke="#E8E0D0" strokeWidth="2"/>
        <path d="M 14 14 L 26 26" stroke="#C8BBA8" strokeWidth="5" strokeLinecap="round"/>
      </motion.g>

      {/* Question dots */}
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx={50 + i * 18}
          cy="50"
          r="3"
          fill="#E8A020"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 2, delay: i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Kip - tilted head */}
      <motion.g
        transform="translate(130,115)"
        animate={{ y: [0, -8, 0], rotate: [-1, 1, -1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <g transform="rotate(-5 0 0)">
          <ellipse cx="0" cy="26" rx="50" ry="52" fill="#F5C96A"/>
          <ellipse cx="0" cy="36" rx="28" ry="26" fill="#FDF3DC"/>
          
          {/* Ears */}
          <ellipse cx="-36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(-12 -36 -10)"/>
          <ellipse cx="-36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(-12 -36 -10)"/>
          <ellipse cx="36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(12 36 -10)"/>
          <ellipse cx="36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(12 36 -10)"/>
          
          {/* Curious eyes */}
          <circle cx="-20" cy="16" r="9" fill="#1A1410"/>
          <circle cx="-20" cy="14" r="3" fill="white"/>
          <circle cx="20" cy="16" r="9" fill="#1A1410"/>
          <circle cx="20" cy="14" r="3" fill="white"/>
          
          {/* Nose */}
          <ellipse cx="0" cy="28" rx="5" ry="4" fill="#C8573A"/>
          
          {/* Small curious mouth */}
          <ellipse cx="0" cy="40" rx="4" ry="5" fill="#C8573A" opacity="0.5"/>
        </g>
      </motion.g>

      {/* Shadow */}
      <motion.ellipse
        cx="130" cy="198" rx="46" ry="8" fill="#C47A10" opacity="0.15"
        animate={{ scaleX: [1, 0.75, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </g>
  );
}

function NoConnectionScene() {
  return (
    <g>
      {/* Broken WiFi arcs */}
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M ${140 - 20 - i * 15} ${70 + i * 12} Q 140 ${60 + i * 8} ${140 + 20 + i * 15} ${70 + i * 12}`}
          stroke="#C8573A"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="8,8"
          animate={{ opacity: [0.15, 0.6, 0.15] }}
          transition={{ duration: 2, delay: i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* X on WiFi */}
      <g transform="translate(140,55)">
        <path d="M -10 -10 L 10 10 M 10 -10 L -10 10" stroke="#C8573A" strokeWidth="4" strokeLinecap="round"/>
      </g>

      {/* Kip - droopy/sad */}
      <motion.g
        transform="translate(140,120)"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ellipse cx="0" cy="26" rx="50" ry="52" fill="#F5C96A"/>
        <ellipse cx="0" cy="36" rx="28" ry="26" fill="#FDF3DC"/>
        
        {/* Droopy ears */}
        <ellipse cx="-36" cy="-4" rx="14" ry="20" fill="#E8A020" transform="rotate(-5 -36 -4)"/>
        <ellipse cx="-36" cy="-4" rx="7" ry="11" fill="#F5C96A" transform="rotate(-5 -36 -4)"/>
        <ellipse cx="36" cy="-4" rx="14" ry="20" fill="#E8A020" transform="rotate(5 36 -4)"/>
        <ellipse cx="36" cy="-4" rx="7" ry="11" fill="#F5C96A" transform="rotate(5 36 -4)"/>
        
        {/* Sad eyes */}
        <circle cx="-20" cy="18" r="7" fill="#1A1410"/>
        <circle cx="20" cy="18" r="7" fill="#1A1410"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="28" rx="5" ry="4" fill="#C8573A"/>
        
        {/* Frown */}
        <path d="M -12 42 Q 0 38 12 42" stroke="#C8573A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      </motion.g>

      {/* Shadow */}
      <ellipse cx="140" cy="198" rx="46" ry="8" fill="#C47A10" opacity="0.15"/>
    </g>
  );
}

function BookingConfirmedScene() {
  return (
    <g>
      {/* Orbiting stars */}
      {[0, 1, 2, 3].map((i) => {
        const angle = (i * 90 * Math.PI) / 180;
        const radius = 75;
        return (
          <motion.g
            key={i}
            transform={`translate(140,105)`}
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          >
            <text 
              x={Math.cos(angle) * radius} 
              y={Math.sin(angle) * radius} 
              fontSize="14" 
              fill="#E8A020"
            >
              ✦
            </text>
          </motion.g>
        );
      })}

      {/* Key */}
      <motion.g
        transform="translate(210,50)"
        animate={{ rotate: [-10, 10, -10] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '50% 20%' }}
      >
        <rect x="-4" y="0" width="8" height="20" rx="2" fill="#E8A020"/>
        <rect x="-8" y="18" width="16" height="8" rx="2" fill="#E8A020"/>
        <rect x="-10" y="24" width="5" height="4" fill="#E8A020"/>
        <rect x="5" y="24" width="5" height="4" fill="#E8A020"/>
      </motion.g>

      {/* Kip - joyful */}
      <motion.g
        transform="translate(140,115)"
        animate={{ scale: [1, 1.05, 1], rotate: [0, -2, 2, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.75, 1] }}
      >
        <ellipse cx="0" cy="24" rx="52" ry="54" fill="#F5C96A"/>
        <ellipse cx="0" cy="36" rx="30" ry="28" fill="#FDF3DC"/>
        
        {/* Ears */}
        <ellipse cx="-38" cy="-12" rx="16" ry="22" fill="#E8A020" transform="rotate(-12 -38 -12)"/>
        <ellipse cx="-38" cy="-12" rx="9" ry="13" fill="#F5C96A" transform="rotate(-12 -38 -12)"/>
        <ellipse cx="38" cy="-12" rx="16" ry="22" fill="#E8A020" transform="rotate(12 38 -12)"/>
        <ellipse cx="38" cy="-12" rx="9" ry="13" fill="#F5C96A" transform="rotate(12 38 -12)"/>
        
        {/* Happy eyes */}
        <path d="M -28 14 Q -20 8 -12 14" stroke="#1A1410" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
        <path d="M 12 14 Q 20 8 28 14" stroke="#1A1410" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="26" rx="6" ry="4.5" fill="#C8573A"/>
        
        {/* Big smile */}
        <path d="M -16 36 Q 0 44 16 36" stroke="#C8573A" strokeWidth="3" fill="none" strokeLinecap="round"/>
      </motion.g>

      {/* Shadow */}
      <ellipse cx="140" cy="200" rx="48" ry="8" fill="#C47A10" opacity="0.15"/>
    </g>
  );
}

function CheckoutScene() {
  return (
    <g>
      {/* Suitcase */}
      <g transform="translate(200,75)">
        <rect x="-18" y="0" width="36" height="30" rx="3" fill="#C8573A"/>
        <rect x="-16" y="2" width="32" height="26" rx="2" fill="#E07A60"/>
        <rect x="-4" y="-6" width="8" height="8" rx="2" fill="#A8493A"/>
        <path d="M -12 0 L -12 30 M 0 0 L 0 30 M 12 0 L 12 30" stroke="#A8493A" strokeWidth="1.5"/>
      </g>

      {/* Kip - waving */}
      <motion.g
        transform="translate(125,115)"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ellipse cx="0" cy="24" rx="50" ry="52" fill="#F5C96A"/>
        <ellipse cx="0" cy="36" rx="28" ry="26" fill="#FDF3DC"/>
        
        {/* Ears */}
        <ellipse cx="-36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(-12 -36 -10)"/>
        <ellipse cx="-36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(-12 -36 -10)"/>
        <ellipse cx="36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(12 36 -10)"/>
        <ellipse cx="36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(12 36 -10)"/>
        
        {/* Friendly eyes */}
        <path d="M -28 14 Q -20 10 -12 14" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" fill="none"/>
        <path d="M 12 14 Q 20 10 28 14" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" fill="none"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="26" rx="5" ry="4" fill="#C8573A"/>
        
        {/* Smile */}
        <path d="M -14 36 Q 0 42 14 36" stroke="#C8573A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        
        {/* Waving arm */}
        <motion.g
          animate={{ rotate: [0, -25, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '60% 80%' }}
        >
          <ellipse cx="48" cy="18" rx="10" ry="7" fill="#E8A020" transform="rotate(25 48 18)"/>
        </motion.g>
      </motion.g>

      {/* Shadow */}
      <ellipse cx="125" cy="198" rx="46" ry="8" fill="#C47A10" opacity="0.15"/>
    </g>
  );
}

function OrderReadyScene() {
  return (
    <g>
      {/* Steam */}
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d="M 200 85 Q 195 75 200 65"
          stroke="#C8BBA8"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
          animate={{ 
            y: [0, -28],
            x: [0, 4],
            scaleX: [1, 0.5],
            opacity: [0.7, 0]
          }}
          transition={{ 
            duration: 2, 
            delay: i * 0.4, 
            repeat: Infinity, 
            ease: 'easeOut' 
          }}
        />
      ))}

      {/* Plate with food */}
      <g transform="translate(200,90)">
        <ellipse cx="0" cy="0" rx="24" ry="6" fill="#E8E0D0"/>
        <ellipse cx="0" cy="-4" rx="18" ry="10" fill="#E8A020"/>
        <ellipse cx="-6" cy="-8" rx="6" ry="6" fill="#C8573A"/>
        <ellipse cx="6" cy="-8" rx="5" ry="5" fill="#5E8C6A"/>
      </g>

      {/* Kip - chef hat */}
      <motion.g
        transform="translate(130,115)"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Chef hat */}
        <g transform="translate(0,-15)">
          <ellipse cx="0" cy="-35" rx="30" ry="18" fill="white"/>
          <rect x="-22" y="-35" width="44" height="20" fill="white"/>
          <rect x="-24" y="-16" width="48" height="4" rx="2" fill="#F5F0E8"/>
        </g>

        <ellipse cx="0" cy="24" rx="50" ry="52" fill="#F5C96A"/>
        <ellipse cx="0" cy="36" rx="28" ry="26" fill="#FDF3DC"/>
        
        {/* Ears */}
        <ellipse cx="-36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(-12 -36 -10)"/>
        <ellipse cx="-36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(-12 -36 -10)"/>
        <ellipse cx="36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(12 36 -10)"/>
        <ellipse cx="36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(12 36 -10)"/>
        
        {/* Proud eyes */}
        <path d="M -28 14 Q -20 8 -12 14" stroke="#1A1410" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
        <path d="M 12 14 Q 20 8 28 14" stroke="#1A1410" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="26" rx="5" ry="4" fill="#C8573A"/>
        
        {/* Big smile */}
        <path d="M -16 36 Q 0 44 16 36" stroke="#C8573A" strokeWidth="3" fill="none" strokeLinecap="round"/>
      </motion.g>

      {/* Shadow */}
      <ellipse cx="130" cy="198" rx="46" ry="8" fill="#C47A10" opacity="0.15"/>
    </g>
  );
}

function MaintenanceScene() {
  return (
    <g>
      {/* Wrench */}
      <motion.g
        transform="translate(200,65)"
        animate={{ rotate: [-15, 15, -15] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '50% 70%' }}
      >
        <rect x="-4" y="0" width="8" height="36" rx="2" fill="#A89880"/>
        <path d="M -8 -4 L -10 -8 L -8 -12 L -4 -14 L 0 -12 L 4 -14 L 8 -12 L 10 -8 L 8 -4 Z" fill="#A89880"/>
      </motion.g>

      {/* Kip - worker */}
      <motion.g
        transform="translate(130,115)"
        animate={{ rotate: [0, -3, 0], y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Sweatband */}
        <rect x="-28" y="-24" width="56" height="8" rx="4" fill="#C8573A"/>

        <ellipse cx="0" cy="24" rx="50" ry="52" fill="#F5C96A"/>
        <ellipse cx="0" cy="36" rx="28" ry="26" fill="#FDF3DC"/>
        
        {/* Ears */}
        <ellipse cx="-36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(-12 -36 -10)"/>
        <ellipse cx="-36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(-12 -36 -10)"/>
        <ellipse cx="36" cy="-10" rx="15" ry="21" fill="#E8A020" transform="rotate(12 36 -10)"/>
        <ellipse cx="36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(12 36 -10)"/>
        
        {/* Focused eyes */}
        <circle cx="-20" cy="16" r="8" fill="#1A1410"/>
        <circle cx="20" cy="16" r="8" fill="#1A1410"/>
        <circle cx="-20" cy="14" r="2" fill="white"/>
        <circle cx="20" cy="14" r="2" fill="white"/>
        
        {/* Nose */}
        <ellipse cx="0" cy="26" rx="5" ry="4" fill="#C8573A"/>
        
        {/* Determined mouth */}
        <path d="M -10 36 L 10 36" stroke="#C8573A" strokeWidth="2.5" strokeLinecap="round"/>
        
        {/* Sweat drop */}
        <ellipse cx="34" cy="8" rx="3" ry="5" fill="#A8D8EA" opacity="0.8"/>
      </motion.g>

      {/* Shadow */}
      <ellipse cx="130" cy="198" rx="46" ry="8" fill="#C47A10" opacity="0.15"/>
    </g>
  );
}

function DefaultScene() {
  return (
    <g>
      {/* Default Kip - the original mascot */}
      <motion.g
        transform="translate(140,110)"
        animate={{ y: [0, -16, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ellipse cx="0" cy="24" rx="50" ry="52" fill="#F5C96A"/>
        <ellipse cx="0" cy="36" rx="28" ry="26" fill="#FDF3DC"/>
        
        {/* Ears */}
        <motion.ellipse
          cx="-36" cy="-10" rx="15" ry="21" fill="#E8A020" 
          transform="rotate(-12 -36 -10)"
          animate={{ rotate: [-12, -8, -12] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <ellipse cx="-36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(-12 -36 -10)"/>
        <motion.ellipse
          cx="36" cy="-10" rx="15" ry="21" fill="#E8A020" 
          transform="rotate(12 36 -10)"
          animate={{ rotate: [12, 16, 12] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <ellipse cx="36" cy="-10" rx="8" ry="12" fill="#F5C96A" transform="rotate(12 36 -10)"/>
        
        {/* Eyes with blink */}
        <motion.g
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.05, 0.1], repeatDelay: 3 }}
        >
          <circle cx="-20" cy="16" r="8" fill="#1A1410"/>
          <circle cx="-20" cy="14" r="2.5" fill="white"/>
          <circle cx="20" cy="16" r="8" fill="#1A1410"/>
          <circle cx="20" cy="14" r="2.5" fill="white"/>
        </motion.g>
        
        {/* Nose */}
        <ellipse cx="0" cy="26" rx="6" ry="4.5" fill="#C8573A"/>
        
        {/* Smile */}
        <path d="M -14 36 Q 0 42 14 36" stroke="#C8573A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        
        {/* Tail wag */}
        <motion.ellipse
          cx="52" cy="30" rx="12" ry="20" fill="#E8A020" 
          transform="rotate(45 52 30)"
          animate={{ rotate: [45, 60, 45] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '52px 30px' }}
        />
      </motion.g>

      {/* Shadow */}
      <motion.ellipse
        cx="140" cy="195" rx="48" ry="8" fill="#C47A10" 
        opacity="0.15"
        animate={{ scaleX: [1, 0.75, 1], opacity: [0.15, 0.08, 0.15] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </g>
  );
}
