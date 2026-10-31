// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BookingsPage from '@/app/dashboard/bookings/page';
import { bookingStatus } from '@/lib/booking-status';

const type = { id: 'rt1', name: 'Deluxe', basePrice: '3000', maxOccupancy: 2 };
const iso = (daysFromNow: number) => { const d = new Date(); d.setHours(14, 0, 0, 0); d.setDate(d.getDate() + daysFromNow); return d.toISOString(); };
const booking = (id: string, guest: string, status: string, extra = {}) => ({
  id, guest: { id: `g-${id}`, name: guest, email: `${id}@mail.com`, phone: '+91 90000 00000' }, room: { id: 'r1', roomNumber: '101', roomType: type },
  checkInDate: iso(0), checkOutDate: iso(2), numGuests: 2, status, totalAmount: '6000', source: 'staff', ...extra,
});
const ROOMS = [{ id: 'r1', roomNumber: '101', roomType: type, status: 'available' }, { id: 'r2', roomNumber: '102', roomType: type, status: 'available' }];

function serve(bookings: unknown[], opts: { bookingsOk?: boolean; write?: (url: string, init: RequestInit) => Response; rooms?: unknown[] } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method) return (opts.write ?? (() => new Response('{}')))(url, init);
    if (url.startsWith('/api/bookings')) return opts.bookingsOk === false ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(bookings));
    if (url.startsWith('/api/rooms')) return new Response(JSON.stringify(opts.rooms ?? ROOMS));
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const writes = (api: ReturnType<typeof serve>) => api.mock.calls.filter(([, init]) => init?.method).map(([url, init]) => ({ url, method: init?.method, body: JSON.parse(String(init?.body)) }));
const tabsGroup = () => within(screen.getByRole('group', { name: 'Show bookings that are' }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('booking status wording', () => {
  it('only cancelled is red, and a guest in the house reads "In house"', () => {
    for (const s of ['pending', 'confirmed', 'checked_in', 'checked_out']) expect(bookingStatus(s).tone).not.toBe('terra');
    expect(bookingStatus('cancelled').tone).toBe('terra');
    expect(bookingStatus('checked_in').label).toBe('In house');
    expect(bookingStatus('odd_one').label).toBe('Odd one');
  });
});

describe('bookings page', () => {
  it('summarises the day, counts statuses in the tabs, and puts what needs handling first', async () => {
    serve([
      booking('old', 'Old Guest', 'checked_out', { checkInDate: iso(-9), checkOutDate: iso(-7) }),
      booking('a', 'Asha Rao', 'pending', { source: 'online' }),
      booking('b', 'Bala Iyer', 'checked_in', { checkInDate: iso(-2), checkOutDate: iso(0) }),
    ]);
    render(<BookingsPage />);
    expect(await screen.findByText('3 bookings · 1 arriving today · 1 leaving today · 1 to confirm')).toBeTruthy();
    expect(tabsGroup().getByRole('button', { name: /In house/ }).textContent).toContain('1');
    const rows = screen.getAllByRole('listitem').map(li => li.textContent ?? '');
    expect(rows[0]).toContain('Bala Iyer'); // arrived earlier, still to check out
    expect(rows[1]).toContain('Asha Rao');
    expect(rows[2]).toContain('Old Guest'); // finished bookings last
    expect(screen.getByText('Online request')).toBeTruthy();
  });

  it('filters by tab and by search', async () => {
    serve([booking('a', 'Asha Rao', 'pending'), booking('b', 'Bala Iyer', 'confirmed')]);
    render(<BookingsPage />);
    const row = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name}, room`) });
    await waitFor(() => expect(row('Asha Rao')).toBeTruthy());
    fireEvent.click(tabsGroup().getByRole('button', { name: /Confirmed/ }));
    expect(row('Asha Rao')).toBeNull();
    expect(row('Bala Iyer')).toBeTruthy();
    fireEvent.click(tabsGroup().getByRole('button', { name: /^All/ }));
    fireEvent.change(screen.getByLabelText('Search bookings'), { target: { value: 'asha' } });
    expect(row('Bala Iyer')).toBeNull();
    expect(row('Asha Rao')).toBeTruthy();
  });

  it('says so when bookings cannot be loaded, instead of "No bookings yet"', async () => {
    serve([], { bookingsOk: false });
    render(<BookingsPage />);
    expect((await screen.findByRole('status')).textContent).toMatch(/couldn.t load/i);
  });

  it('confirms a pending request from the row, and shows the reason if the server refuses', async () => {
    const api = serve([booking('a', 'Asha Rao', 'pending')], { write: () => new Response(JSON.stringify({ error: 'Only a pending booking can be confirmed.' }), { status: 409 }) });
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Asha Rao' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Only a pending booking can be confirmed.');
    expect(writes(api)).toEqual([{ url: '/api/bookings/a', method: 'PATCH', body: { action: 'confirm' } }]);
  });

  it('opens a drawer with the details, and asks before cancelling', async () => {
    const api = serve([booking('b', 'Bala Iyer', 'confirmed', { specialRequests: 'Late arrival' })]);
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Bala Iyer, room 101, Confirmed/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Bala Iyer' });
    expect(within(drawer).getByText('Late arrival')).toBeTruthy();
    expect(within(drawer).getByText('b@mail.com')).toBeTruthy();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel booking' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cancel this booking?' });
    expect(writes(api)).toEqual([]); // nothing happens until it is confirmed
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel booking' }));
    await waitFor(() => expect(writes(api)).toEqual([{ url: '/api/bookings/b', method: 'PATCH', body: { action: 'cancel' } }]));
  });

  it('opens a new booking with the right room when sent from the Rooms page', async () => {
    window.history.replaceState(null, '', '/dashboard/bookings?new=1&room=r2');
    serve([]);
    render(<BookingsPage />);
    const dialog = await screen.findByRole('dialog', { name: 'New booking' });
    expect((within(dialog).getByLabelText('Room') as HTMLSelectElement).value).toBe('r2');
    expect(within(dialog).getByText(/1 night × ₹3,000/)).toBeTruthy(); // today to tomorrow by default
    expect(window.location.search).toBe(''); // so a refresh does not reopen it
  });

  it('checks the form before sending, and shows the reason when the server says no', async () => {
    const api = serve([], { write: () => new Response(JSON.stringify({ error: 'This room is already booked for those dates.' }), { status: 409 }) });
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /New booking/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New booking' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create booking' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/guest name, room and both dates/i);
    expect(writes(api)).toEqual([]);
    fireEvent.change(within(dialog).getByLabelText('Guest email (optional)'), { target: { value: 'c@mail.com' } });
    fireEvent.change(within(dialog).getByLabelText('Guest name'), { target: { value: 'Chitra' } });
    fireEvent.change(within(dialog).getByLabelText('Number of guests'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create booking' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/sleeps 2/);
    fireEvent.change(within(dialog).getByLabelText('Number of guests'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create booking' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe('This room is already booked for those dates.'));
    expect(screen.getByRole('dialog', { name: 'New booking' })).toBeTruthy();
  });
});

describe('guest email', () => {
  it('is optional: a booking goes through with just a name, and sends no email', async () => {
    const api = serve([]);
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /New booking/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New booking' });
    expect(within(dialog).getByLabelText('Guest email (optional)')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create booking' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/guest name/i); // the name is the required one
    fireEvent.change(within(dialog).getByLabelText('Guest name'), { target: { value: 'Chitra' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create booking' }));
    await waitFor(() => expect(writes(api)).toHaveLength(1));
    expect(writes(api)[0].body).toMatchObject({ guestName: 'Chitra', roomId: 'r1' });
    expect(writes(api)[0].body.guestEmail).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('never shows the stand-in address of a guest who left no email', async () => {
    serve([booking('n', 'Chitra', 'confirmed', { guest: { id: 'g', name: 'Chitra', email: 'guest-1234@no-email.kipd.local' } })]);
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Chitra, room 101/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Chitra' });
    expect(screen.queryByText(/kipd\.local/)).toBeNull();
    expect(within(drawer).queryByText('Email')).toBeNull();
    expect(screen.getAllByText('No email on file').length).toBeGreaterThan(0);
  });
});

describe('payment on a booking', () => {
  const partial = { id: 'bill1', status: 'partial', totalAmount: 10000, paidAmount: 2000 };

  it('the drawer says how much is paid, and links to Hotel billing while money is owed', async () => {
    serve([booking('b', 'Bala Iyer', 'confirmed', { bill: partial })]);
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Bala Iyer, room 101, Confirmed/ }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('₹2,000 paid, ₹8,000 owed')).toBeTruthy();
    expect(within(drawer).getByRole('link', { name: 'Record a payment in Billing' }).getAttribute('href')).toBe('/dashboard/billing/hotel');
  });

  it('a paid-up stay has no payment link, and a pending request explains why it has no bill', async () => {
    serve([
      booking('b', 'Bala Iyer', 'confirmed', { bill: { id: 'bill1', status: 'paid', totalAmount: 6000, paidAmount: 6000 } }),
      booking('p', 'Pema Dorji', 'pending'),
    ]);
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Bala Iyer, room 101, Confirmed/ }));
    let drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Paid in full (₹6,000)')).toBeTruthy();
    expect(within(drawer).queryByRole('link', { name: /Record a payment/ })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Pema Dorji, room 101, Pending/ }));
    drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('No bill until the request is confirmed')).toBeTruthy();
  });

  it('cancelling a booking that was paid for says how much to refund by hand', async () => {
    serve([booking('b', 'Bala Iyer', 'confirmed', { bill: partial })], { write: () => new Response(JSON.stringify({ success: true, refundDue: 2000 })) });
    render(<BookingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Bala Iyer, room 101, Confirmed/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel booking' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cancel this booking?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel booking' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/cancelled\. ₹2,000 was already paid and needs refunding by hand/);
  });
});
