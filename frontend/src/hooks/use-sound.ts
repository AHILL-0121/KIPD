'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSavedSound,
  playChime,
  saveSound,
  unlockAudio,
  type SoundChannel,
} from '@/lib/chime';

/**
 * Manages persisted per-screen notification sound state across route transitions
 * and resumes the shared Web Audio context on user interaction when needed.
 */
export function useSound(channel: SoundChannel) {
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = soundOn;

  useEffect(() => {
    const saved = getSavedSound(channel);
    if (!saved) return;
    setSoundOn(true);
    soundRef.current = true;
    void unlockAudio();
  }, [channel]);

  // If the user hard-reloaded with sound enabled, browsers suspend AudioContext until the first tap/keypress.
  useEffect(() => {
    if (!soundOn || typeof window === 'undefined') return;
    const resumeOnGesture = () => {
      void unlockAudio();
    };
    window.addEventListener('pointerdown', resumeOnGesture, { once: true, passive: true });
    window.addEventListener('keydown', resumeOnGesture, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', resumeOnGesture);
      window.removeEventListener('keydown', resumeOnGesture);
    };
  }, [soundOn]);

  const toggleSound = useCallback(async () => {
    if (soundRef.current) {
      setSoundOn(false);
      soundRef.current = false;
      saveSound(channel, false);
      return;
    }
    if (await playChime(channel)) {
      setSoundOn(true);
      soundRef.current = true;
      saveSound(channel, true);
    }
  }, [channel]);

  const ring = useCallback(() => {
    if (soundRef.current) {
      void playChime(channel);
    }
  }, [channel]);

  return { soundOn, toggleSound, ring };
}
