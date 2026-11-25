'use client';

/**
 * Synthesizes a clean two-tone service bell chime using the Web Audio API
 * so KDS and Orders alerts work without external MP3 assets.
 */
let sharedCtx: AudioContext | null = null;

export async function playChime(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;

    sharedCtx ??= new Ctor();
    if (sharedCtx.state === 'suspended') {
      await sharedCtx.resume();
    }
    if (sharedCtx.state !== 'running') return false;

    const now = sharedCtx.currentTime;
    const notes = [880, 1174.66]; // A5 -> D6 chime
    notes.forEach((freq, i) => {
      if (!sharedCtx) return;
      const osc = sharedCtx.createOscillator();
      const gain = sharedCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0.001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(sharedCtx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.38);
    });
    return true;
  } catch {
    return false;
  }
}
