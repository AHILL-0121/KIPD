// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HoldButton } from '@/components/ui/hold-button';

/**
 * Accepting a new kitchen order must need a deliberate hold: a tap, a short press, or a pointer that
 * slides away must do nothing, and a full hold must confirm exactly once.
 */
afterEach(() => { cleanup(); vi.useRealTimers(); });

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const setup = (props: { duration?: number; disabled?: boolean } = {}) => {
  const onConfirm = vi.fn();
  render(<HoldButton onConfirm={onConfirm} duration={props.duration ?? 120} disabled={props.disabled}>Accept order</HoldButton>);
  return { onConfirm, button: screen.getByRole('button', { name: /accept order/i }) };
};

describe('HoldButton', () => {
  it('a quick tap does nothing', async () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button);
    await wait(20);
    fireEvent.pointerUp(button);
    await wait(250);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a full hold confirms exactly once', async () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button);
    await wait(300);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button);
    await wait(100);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('sliding the pointer away cancels the hold', async () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button);
    await wait(40);
    fireEvent.pointerLeave(button);
    await wait(250);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('can be held again after letting go', async () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button); await wait(300); fireEvent.pointerUp(button);
    fireEvent.pointerDown(button); await wait(300); fireEvent.pointerUp(button);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('works from the keyboard: hold Space', async () => {
    const { onConfirm, button } = setup();
    fireEvent.keyDown(button, { key: ' ' });
    await wait(300);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(button, { key: ' ' });
  });

  it('a keyboard tap does nothing, and key repeat does not restart the hold', async () => {
    const { onConfirm, button } = setup();
    fireEvent.keyDown(button, { key: 'Enter' });
    await wait(20);
    fireEvent.keyUp(button, { key: 'Enter' });
    await wait(250);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: 'Enter' });
    await wait(60);
    fireEvent.keyDown(button, { key: 'Enter', repeat: true }); // held down: browsers repeat the event
    await wait(300);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('losing focus mid-hold cancels it', async () => {
    const { onConfirm, button } = setup();
    fireEvent.keyDown(button, { key: ' ' });
    await wait(40);
    fireEvent.blur(button);
    await wait(250);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a disabled button never confirms', async () => {
    const { onConfirm, button } = setup({ disabled: true });
    fireEvent.pointerDown(button);
    await wait(300);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tells the user it needs a hold', () => {
    setup();
    expect(screen.getByText('Press and hold')).toBeTruthy();
  });
});
