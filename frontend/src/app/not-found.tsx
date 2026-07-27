'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-16">
      <div className="max-w-3xl w-full text-center">
        
        {/* 4-Mascot-4 Design */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {/* First 4 */}
          <div className="text-[12rem] sm:text-[14rem] font-display font-bold text-stone-200 leading-none select-none">
            4
          </div>
          
          {/* Kipd Mascot (replaces the 0) */}
          <div className="relative">
            <motion.svg 
              width="180" 
              height="180" 
              viewBox="0 0 140 140" 
              fill="none"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {/* Party hat */}
              <path 
                d="M70 15 L95 65 L45 65 Z" 
                fill="#C8573A" 
                stroke="#A0441C" 
                strokeWidth="2"
              />
              <ellipse cx="70" cy="65" rx="28" ry="8" fill="#C8573A" opacity="0.3" />
              <circle cx="70" cy="15" r="6" fill="#FAF8F4" />
              
              {/* Head */}
              <circle cx="70" cy="85" r="45" fill="#E8A020" />
              <circle cx="70" cy="85" r="45" fill="url(#mascotGradient)" />
              
              {/* Ears */}
              <ellipse cx="35" cy="70" rx="15" ry="25" fill="#E8A020" />
              <ellipse cx="105" cy="70" rx="15" ry="25" fill="#E8A020" />
              <ellipse cx="35" cy="75" rx="8" ry="15" fill="#D89520" />
              <ellipse cx="105" cy="75" rx="8" ry="15" fill="#D89520" />
              
              {/* Face - X eyes (confused/dizzy) */}
              <g>
                <line x1="55" y1="75" x2="63" y2="83" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" />
                <line x1="63" y1="75" x2="55" y2="83" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" />
              </g>
              <g>
                <line x1="77" y1="75" x2="85" y2="83" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" />
                <line x1="85" y1="75" x2="77" y2="83" stroke="#1A1410" strokeWidth="3" strokeLinecap="round" />
              </g>
              
              {/* Nose */}
              <circle cx="70" cy="92" r="5" fill="#C8573A" />
              
              {/* Sad/confused mouth */}
              <path 
                d="M 55 105 Q 70 98 85 105" 
                stroke="#8B4513" 
                strokeWidth="2.5" 
                strokeLinecap="round"
                fill="none"
              />
              
              {/* Whisker spots */}
              <circle cx="45" cy="90" r="6" fill="#D89520" opacity="0.4" />
              <circle cx="95" cy="90" r="6" fill="#D89520" opacity="0.4" />
              
              {/* Gradient Definition */}
              <defs>
                <radialGradient id="mascotGradient" cx="0.3" cy="0.3">
                  <stop offset="0%" stopColor="#FAE59F" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#E8A020" stopOpacity="0" />
                </radialGradient>
              </defs>
              
              {/* Question mark */}
              <text x="110" y="45" fontSize="28" fill="#E8A020" fontWeight="bold">?</text>
            </motion.svg>
          </div>
          
          {/* Second 4 */}
          <div className="text-[12rem] sm:text-[14rem] font-display font-bold text-stone-200 leading-none select-none">
            4
          </div>
        </div>
        
        <p className="text-sm font-mono text-amber-600 uppercase tracking-wide mb-4">
          Oops! This page seems to have wandered off...
        </p>
        
        <h1 className="text-4xl sm:text-5xl font-display font-bold text-ink mb-6">
          Page Not Found
        </h1>
        
        <p className="text-lg text-ink-muted mb-12 max-w-md mx-auto leading-relaxed">
          The page you're looking for doesn't exist or has been moved. 
          Let me help you find your way back!
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/">
            <Button variant="primary" size="lg" className="gap-2 min-w-[140px]">
              <Home className="h-5 w-5" />
              Go Home
            </Button>
          </Link>
          
          <Button 
            variant="ghost" 
            size="lg" 
            className="gap-2 min-w-[140px]"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-5 w-5" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
