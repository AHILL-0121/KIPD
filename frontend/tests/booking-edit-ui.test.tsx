// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BookingsPage from '@/app/dashboard/bookings/page';

const type = { id: 'rt1', name: 'Deluxe', basePrice: '3000', maxOccupancy: 2 };
const iso = (daysFromNow: number) => { const d = new Date(); d.setHours(14, 0, 0, 0); d.setDate(d.getDate() + daysFromNow); return d.toISOString(); };
const booking = (id: string, guest: string, status: string, extra = {}) => ({
  id, guest: { id: `g-${id}`, name: guest, email: `${id}@mail.com` }, room: { id: 'r1', roomNumber: '101', roomType: type },
  checkInDate: iso(3), checkOutDate: iso(5), numGuests: 2, status, totalAmount: '6000', source: 'staff', ...extra,
});
const ROOMS = [
  { id: 'r1', roomNumber: '101', roomType: type, status: 'occupied' },
  { id: 'r2', roomNumber: '102', roomType: type, status: 'available' },
  { id: 'r3', roomNumber: '103', roomType: type, status: 'cleaning' },
  { id: 'r4', roomNumber: '104', roomType: type, status: 'maintenance' },
];

function serve(bookings: unknown[], write: (url: string, init: RequestInit) => Response = () => new Response('{}')) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method) return write(url, init);
    if (url.startsWith('/api/bookings')) return new Response(JSON.stringify(bookings));
    if (url.startsWith('/api/rooms')) return new Response(JSON.stringify(ROOMS));
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const writes = (api: ReturnType<typeof serve>) => api.mock.calls.filter(([, init]) => init?.method).map(([url, init]) => ({ url, method: init?.method, body: JSON.parse(String(init?.body)) }));

async function openEdit(guest: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${guest}, room`) }));
  fireEvent.click(await screen.findByRole('button', { name: 'Change dates or room' }));
  return screen.findByRole('dialog', { name: 'Change booking' });
}
const roomOptions = (dialog: HTMLElement) => Array.from(within(dialog).getByLabelText('Room').querySelectorAll('option')).map((o) => o.textContent ?? '');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('changing a booking from the Bookings screen', () => {
  it('sends only what changed, then says what the stay now costs', async () => {
    const api = serve([booking('a', 'Asha Rao', 'confirmed')], () => new Response(JSON.stringify({ success: true, booking: { totalAmount: 6000 }, billTotal: 6300 })));
    render(<BookingsPage />);
    const dialog = await openEdit('Asha Rao');
    fireEvent.change(within(dialog).getByLabelText('Number of guests'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes(api)).toEqual([{ url: '/api/bookings/a', method: 'PATCH', body: { numGuests: 1 } }]));
    expect((await screen.findByRole('status')).textContent).toMatch(/Asha Rao updated\. The total is now .*6,300/);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change booking' })).toBeNull());
  });

  it('shows the server\'s reason and keeps the form open when the change is refused', async () => {
    serve([booking('a', 'Asha Rao', 'confirmed')], () => new Response(JSON.stringify({ error: 'Room 101 sleeps 2. Choose a bigger room or fewer guests.' }), { status: 409 }));
    render(<BookingsPage />);
    const dialog = await openEdit('Asha Rao');
    fireEvent.change(within(dialog).getByLabelText('Number of guests'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/sleeps 2/);
    expect(screen.getByRole('dialog', { name: 'Change booking' })).toBeTruthy();
  });

  it('saving with nothing changed just closes, without calling the server', async () => {
    const api = serve([booking('a', 'Asha Rao', 'confirmed')]);
    render(<BookingsPage />);
    const dialog = await openEdit('Asha Rao');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change booking' })).toBeNull());
    expect(writes(api)).toEqual([]);
  });

  it('a future booking may move to any room in service; a guest in the house only to a room that is free now', async () => {
    serve([booking('a', 'Asha Rao', 'confirmed'), booking('b', 'Bala Iyer', 'checked_in', { checkInDate: iso(-1), checkOutDate: iso(1) })]);
    render(<BookingsPage />);
    const future = await openEdit('Asha Rao');
    expect(roomOptions(future).map((t) => t.slice(0, 8))).toEqual(['Room 101', 'Room 102', 'Room 103']); // not 104: out of order
    fireEvent.click(within(future).getByRole('button', { name: 'Keep as it is' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change booking' })).toBeNull());

    const inHouse = await openEdit('Bala Iyer');
    expect(roomOptions(inHouse).map((t) => t.slice(0, 8))).toEqual(['Room 101', 'Room 102']); // own room, and the free one
    expect(within(inHouse).getByText(/check-in date stays as it is/)).toBeTruthy();
  });

  it('is not offered once the invoice is issued, or for a finished booking', async () => {
    serve([
      booking('a', 'Asha Rao', 'checked_in', { invoice: { billId: 'bill1', number: 'INV/26-27/0001' } }),
      booking('b', 'Bala Iyer', 'checked_out', { checkInDate: iso(-5), checkOutDate: iso(-3) }),
    ]);
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Asha Rao, room/ }));
    await screen.findByRole('dialog', { name: 'Asha Rao' });
    expect(screen.queryByRole('button', { name: 'Change dates or room' })).toBeNull();
  });
});

describe('the new booking form', () => {
  it('offers rooms that are occupied or being cleaned today (the booking may be for later), but not ones out of order', async () => {
    serve([]);
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /New booking/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New booking' });
    expect(roomOptions(dialog).map((t) => t.slice(0, 8))).toEqual(['Room 101', 'Room 102', 'Room 103']);
  });
});
