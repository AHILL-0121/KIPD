'use client';

/**
 * Synthesizes distinct audio alerts for Orders (front-of-house) and KDS (kitchen)
 * using the Web Audio API so notifications work without external audio assets.
 */
export type SoundChannel = 'orders' | 'kds';

interface SoundProfile {
  notes: number[];
  waveform: OscillatorType;
  stepSec: number;
  durationSec: number;
  peakGain: number;
}

export const SOUND_PROFILES: Record<SoundChannel, SoundProfile> = {
  // Crisp upward major triad (C6 -> E6 -> G6) for waiters / table POS
  orders: {
    notes: [1046.5, 1318.51, 1567.98],
    waveform: 'sine',
    stepSec: 0.095,
    durationSec: 0.28,
    peakGain: 0.16,
  },
  // Punchy two-strike pass bell (D5 -> A5) so kitchen tickets cut through kitchen noise
  kds: {
    notes: [587.33, 880],
    waveform: 'triangle',
    stepSec: 0.17,
    durationSec: 0.45,
    peakGain: 0.24,
  },
};

const STORAGE_KEYS: Record<SoundChannel, string> = {
  orders: 'kipd-sound-orders',
  kds: 'kipd-sound-kds',
};

let sharedCtx: AudioContext | null = null;

export function getSavedSound(channel: SoundChannel): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEYS[channel]) === 'on';
  } catch {
    return false;
  }
}

export function saveSound(channel: SoundChannel, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS[channel], enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
}

export async function unlockAudio(): Promise<AudioContext | null> {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  sharedCtx ??= new Ctor();
  if (sharedCtx.state === 'suspended') {
    await sharedCtx.resume();
  }
  return sharedCtx.state === 'running' ? sharedCtx : null;
}

export async function playChime(channel: SoundChannel = 'orders'): Promise<boolean> {
  try {
    const ctx = await unlockAudio();
    if (!ctx) return false;

    const { notes, waveform, stepSec, durationSec, peakGain } = SOUND_PROFILES[channel];
    const now = ctx.currentTime;

    notes.forEach((freq, i) => {
      const startAt = now + i * stepSec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = waveform;
      osc.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + durationSec + 0.03);
    });
    return true;
  } catch {
    return false;
  }
}
