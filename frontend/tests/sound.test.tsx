// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { playChime, SOUND_PROFILES } from '@/lib/chime';
import { useSound } from '@/hooks/use-sound';

function createMockAudioContext() {
  const createdOscillators: Array<{ type: string; freqs: number[] }> = [];
  class MockAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    createOscillator() {
      const record = { type: 'sine', freqs: [] as number[] };
      createdOscillators.push(record);
      return {
        get type() {
          return record.type;
        },
        set type(v: string) {
          record.type = v;
        },
        frequency: {
          setValueAtTime: (freq: number) => {
            record.freqs.push(freq);
          },
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    }
  }
  return { MockAudioContext, createdOscillators };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('chime profiles & persisted sound state', () => {
  it('uses distinct waveforms and notes for orders vs kds', async () => {
    const { MockAudioContext, createdOscillators } = createMockAudioContext();
    vi.stubGlobal('AudioContext', MockAudioContext);

    expect(await playChime('orders')).toBe(true);
    expect(createdOscillators.length).toBe(SOUND_PROFILES.orders.notes.length);
    expect(createdOscillators.map((o) => o.freqs[0])).toEqual(SOUND_PROFILES.orders.notes);
    expect(createdOscillators.every((o) => o.type === 'sine')).toBe(true);

    createdOscillators.length = 0;
    expect(await playChime('kds')).toBe(true);
    expect(createdOscillators.length).toBe(SOUND_PROFILES.kds.notes.length);
    expect(createdOscillators.map((o) => o.freqs[0])).toEqual(SOUND_PROFILES.kds.notes);
    expect(createdOscillators.every((o) => o.type === 'triangle')).toBe(true);
  });

  it('persists Orders and KDS sound toggles independently across page unmount/remount', async () => {
    const { MockAudioContext } = createMockAudioContext();
    vi.stubGlobal('AudioContext', MockAudioContext);

    const ordersHook = renderHook(() => useSound('orders'));
    expect(ordersHook.result.current.soundOn).toBe(false);

    await act(async () => {
      await ordersHook.result.current.toggleSound();
    });
    expect(ordersHook.result.current.soundOn).toBe(true);
    expect(localStorage.getItem('kipd-sound-orders')).toBe('on');
    expect(localStorage.getItem('kipd-sound-kds')).toBeNull();

    // Navigating away unmounts OrdersPage and returns later
    ordersHook.unmount();
    const ordersRevisit = renderHook(() => useSound('orders'));
    expect(ordersRevisit.result.current.soundOn).toBe(true);

    // KDS has its own independent toggle
    const kdsHook = renderHook(() => useSound('kds'));
    expect(kdsHook.result.current.soundOn).toBe(false);
    await act(async () => {
      await kdsHook.result.current.toggleSound();
    });
    expect(kdsHook.result.current.soundOn).toBe(true);
    expect(localStorage.getItem('kipd-sound-kds')).toBe('on');
  });
});
