// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatePicker, parseYmd, toYmd } from '@/components/ui/date-picker';
import { Dialog } from '@/components/ui/dialog';

function Field({ initial = '2026-10-15', ...rest }: { initial?: string; min?: string; max?: string; required?: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <DatePicker label="Check-in" value={v} onChange={setV} {...rest} />
      <output data-testid="value">{v}</output>
    </>
  );
}
const value = () => screen.getByTestId('value').textContent;

afterEach(cleanup);

describe('date helpers', () => {
  it('round-trips in local time and rejects impossible dates', () => {
    expect(toYmd(new Date(2026, 9, 31))).toBe('2026-10-31');
    expect(parseYmd('2026-10-31')?.getDate()).toBe(31);
    expect(parseYmd('2026-02-31')).toBeNull();
    expect(parseYmd('')).toBeNull();
  });
});

describe('DatePicker', () => {
  it('shows the chosen day readably, and picks another with a click', async () => {
    render(<Field />);
    const trigger = screen.getByRole('button', { name: /15 Oct 2026/ });
    expect(screen.getByLabelText('Check-in')).toBe(trigger); // the label is linked to the field
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Choose check-in' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Saturday, 31 October 2026/ }));
    expect(value()).toBe('2026-10-31');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByLabelText('Check-in'));
  });

  it('moves with the arrow keys and picks with Enter', async () => {
    render(<Field />);
    fireEvent.click(screen.getByLabelText('Check-in'));
    await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-15'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-23'));
    fireEvent.keyDown(document.activeElement!, { key: 'PageDown' });
    await waitFor(() => expect(document.activeElement?.getAttribute('data-date')).toBe('2026-11-23'));
    fireEvent.click(document.activeElement!); // Enter on a button is a click
    expect(value()).toBe('2026-11-23');
  });

  it('will not offer days outside min and max', async () => {
    render(<Field min="2026-10-10" max="2026-10-20" />);
    fireEvent.click(screen.getByLabelText('Check-in'));
    await screen.findByRole('dialog');
    expect((screen.getByRole('button', { name: /, 9 October 2026/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /, 21 October 2026/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /, 10 October 2026/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('jumps months from the month grid, and Clear only exists when the date is optional', async () => {
    const { unmount } = render(<Field />);
    fireEvent.click(screen.getByLabelText('Check-in'));
    fireEvent.click(await screen.findByRole('button', { name: /October 2026, choose month/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dec' }));
    expect((await screen.findByRole('grid')).getAttribute('aria-label')).toBe('December 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(value()).toBe('');
    unmount();
    render(<Field required />);
    fireEvent.click(screen.getByLabelText('Check-in'));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('Escape closes only the calendar, not the dialog around it', async () => {
    render(
      <Dialog open onClose={() => { throw new Error('dialog closed'); }} labelledBy="t">
        <h2 id="t">Booking</h2>
        <Field />
      </Dialog>,
    );
    fireEvent.click(await screen.findByLabelText('Check-in'));
    await screen.findByRole('dialog', { name: 'Choose check-in' });
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose check-in' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Booking' })).toBeTruthy();
  });
});
