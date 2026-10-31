// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Dialog } from '@/components/ui/dialog';

function Harness({ dismissible = true, onClose = () => {} }: { dismissible?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Dialog open={open} onClose={() => { onClose(); setOpen(false); }} labelledBy="t" dismissible={dismissible}>
        <h2 id="t">Title</h2>
        <button aria-label="Close" onClick={() => setOpen(false)}>x</button>
        <input aria-label="Amount" />
        <button>Save</button>
      </Dialog>
    </div>
  );
}

afterEach(cleanup);

describe('Dialog', () => {
  it('is a labelled modal dialog, outside the page wrapper, and focuses the first field', async () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText('Open it'));
    const dialog = await screen.findByRole('dialog', { name: 'Title' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(container.contains(dialog)).toBe(false); // portalled to <body>, so no transformed parent can move it
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
  });

  it('keeps Tab inside, in both directions', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open it'));
    await screen.findByRole('dialog');
    screen.getByText('Save').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByLabelText('Close'));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Save'));
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    render(<Harness />);
    const opener = screen.getByText('Open it');
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('ignores Escape and outside clicks while saving', async () => {
    const onClose = vi.fn();
    render(<Harness dismissible={false} onClose={onClose} />);
    fireEvent.click(screen.getByText('Open it'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
