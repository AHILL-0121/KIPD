'use client';

import { motion } from 'framer-motion';
import { KipBell, KipFigure, KipStyles } from './Kip';

export function KipdMascot({ className = '', size = 'md', animated = true }: {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}) {
  const sizeMap = { sm: 80, md: 160, lg: 240, xl: 320 };
  const width = sizeMap[size];

  const MascotSVG = (
    <svg
      width={width}
      height={width}
      viewBox="-6 -6 212 212"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="kip-svg mascot-svg"
      role="img"
      aria-label="Kip the bellhop owl"
    >
      <KipStyles />
      <KipFigure mood="happy" hat="bellhop" rightWing="bell">
        <g transform="translate(188 126)"><KipBell ring={animated} /></g>
      </KipFigure>
    </svg>
  );

  if (!animated) {
    return <div className={className}>{MascotSVG}</div>;
  }

  return (
    <motion.div
      className={`mascot-container ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
    >
      <motion.div
        animate={{ y: [0, -16, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {MascotSVG}
      </motion.div>

      <motion.div
        aria-hidden="true"
        animate={{ scaleX: [1, 0.85, 1], opacity: [0.6, 0.3, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: width * 0.6,
          height: 20,
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.15) 0%, transparent 70%)',
          borderRadius: '50%',
          margin: '0 auto',
          marginTop: -10,
        }}
      />
    </motion.div>
  );
}
