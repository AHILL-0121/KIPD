'use client';

import { motion } from 'framer-motion';

export function KipdMascot({ className = '', size = 'md', animated = true }: { 
  className?: string; 
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}) {
  const sizeMap = {
    sm: 80,
    md: 160,
    lg: 240,
    xl: 320,
  };
  
  const width = sizeMap[size];
  const height = width;

  const MascotSVG = (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mascot-svg"
    >
      {/* Body */}
      <ellipse cx="100" cy="120" rx="60" ry="70" fill="#E8A020" />
      
      {/* Belly spot */}
      <ellipse cx="100" cy="130" rx="35" ry="45" fill="#FFF5E1" />
      
      {/* Left ear */}
      <ellipse cx="70" cy="60" rx="18" ry="30" fill="#E8A020" transform="rotate(-25 70 60)" />
      <ellipse cx="70" cy="62" rx="10" ry="18" fill="#FFD480" transform="rotate(-25 70 62)" />
      
      {/* Right ear */}
      <ellipse cx="130" cy="60" rx="18" ry="30" fill="#E8A020" transform="rotate(25 130 60)" />
      <ellipse cx="130" cy="62" rx="10" ry="18" fill="#FFD480" transform="rotate(25 130 62)" />
      
      {/* Head */}
      <circle cx="100" cy="85" r="45" fill="#E8A020" />
      
      {/* Snout */}
      <ellipse cx="100" cy="95" rx="25" ry="20" fill="#FFD480" />
      
      {/* Nose */}
      <ellipse cx="100" cy="92" rx="8" ry="6" fill="#C8573A" />
      
      {/* Left eye */}
      <g className="eye-l">
        <ellipse cx="85" cy="80" rx="8" ry="12" fill="#1C1917" />
        <ellipse cx="87" cy="78" rx="3" ry="4" fill="white" />
      </g>
      
      {/* Right eye */}
      <g className="eye-r">
        <ellipse cx="115" cy="80" rx="8" ry="12" fill="#1C1917" />
        <ellipse cx="117" cy="78" rx="3" ry="4" fill="white" />
      </g>
      
      {/* Smile */}
      <path
        d="M 90 100 Q 100 105 110 100"
        stroke="#C8573A"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Left arm */}
      <ellipse cx="50" cy="120" rx="15" ry="35" fill="#E8A020" transform="rotate(-20 50 120)" />
      
      {/* Right arm */}
      <ellipse cx="150" cy="120" rx="15" ry="35" fill="#E8A020" transform="rotate(20 150 120)" />
      
      {/* Tail */}
      <g className="kip-tail">
        <path
          d="M 140 140 Q 160 135 165 125 Q 170 115 168 105"
          stroke="#E8A020"
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="168" cy="102" r="8" fill="#FFD480" />
      </g>
      
      {/* Left leg */}
      <ellipse cx="80" cy="175" rx="12" ry="25" fill="#E8A020" />
      <ellipse cx="80" cy="185" rx="14" ry="8" fill="#C68510" />
      
      {/* Right leg */}
      <ellipse cx="120" cy="175" rx="12" ry="25" fill="#E8A020" />
      <ellipse cx="120" cy="185" rx="14" ry="8" fill="#C68510" />
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
        animate={{
          y: [0, -16, 0],
          rotate: [-1, 1, -1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {MascotSVG}
      </motion.div>
      
      {/* Shadow */}
      <motion.div
        className="mascot-shadow"
        animate={{
          scaleX: [1, 0.85, 1],
          opacity: [0.6, 0.3, 0.6],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          width: width * 0.6,
          height: 20,
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.15) 0%, transparent 70%)',
          borderRadius: '50%',
          margin: '0 auto',
          marginTop: -10,
        }}
      />
      
      <style jsx>{`
        .mascot-svg:hover {
          filter: drop-shadow(0 12px 32px rgba(232, 160, 32, 0.4));
        }
        
        .eye-l, .eye-r {
          animation: blink 4s ease-in-out infinite;
        }
        
        .eye-r {
          animation-delay: 0.08s;
        }
        
        @keyframes blink {
          0%, 90%, 100% {
            transform: scaleY(1);
          }
          95% {
            transform: scaleY(0.1);
          }
        }
        
        .mascot-svg:hover .kip-tail {
          animation: tailWag 0.3s ease-in-out infinite alternate;
        }
        
        @keyframes tailWag {
          from {
            transform: rotate(-8deg) translateX(0);
          }
          to {
            transform: rotate(8deg) translateX(3px);
          }
        }
      `}</style>
    </motion.div>
  );
}
