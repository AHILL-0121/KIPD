// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Select } from '@/components/ui/select';

const OPTIONS = [
  { value: 'a', label: 'Starters' },
  { value: 'b', label: 'Main Course' },
  { value: 'c', label: 'Desserts' },
];

function Harness({ initial = 'a' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <Select label="Category" value={v} onChange={(e) => setV(e.target.value)} options={OPTIONS} />;
}

const trigger = () => screen.getByRole('combobox');
const hidden = () => screen.getByLabelText('Category') as HTMLSelectElement;

afterEach(cleanup);

describe('Select', () => {
  it('shows the chosen label and keeps the real <select> in sync for forms', () => {
    render(<Harness initial="b" />);
    expect(trigger().textContent).toContain('Main Course');
    expect(hidden().value).toBe('b');
  });

  it('opens on click and picks an option, firing the caller\'s onChange', async () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Desserts' }));
    expect(hidden().value).toBe('c');
    expect(trigger().textContent).toContain('Desserts');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull()); // fades out first
  });

  it('works from the keyboard: arrows move, Enter picks, Escape closes', async () => {
    render(<Harness />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // opens on the current option
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(hidden().value).toBe('b');

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(hidden().value).toBe('b');
  });

  it('shows a placeholder when the value matches no option', () => {
    render(<Harness initial="" />);
    expect(trigger().textContent).toContain('Select…');
  });
});
