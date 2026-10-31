// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RoomsPage from '@/app/dashboard/rooms/page';
import { roomStatus } from '@/lib/room-status';

const type = { id: 'rt1', name: 'Deluxe', basePrice: '3000', maxOccupancy: 2, amenities: [], description: '' };
const room = (id: string, roomNumber: string, status: string, floor = 1) => ({ id, roomNumber, roomTypeId: 'rt1', roomType: type, floor, status });
const stay = (id: string, roomId: string, guest: string) => ({ id, roomId, status: 'checked_in', checkOutDate: '2026-11-03T06:30:00.000Z', guest: { name: guest } });

const ROOMS = [room('r1', '101', 'occupied'), room('r2', '102', 'available'), room('r3', '103', 'cleaning'), room('r4', '201', 'maintenance', 2)];

function serve(rooms: unknown[], opts: { roomsOk?: boolean; stays?: unknown[]; write?: (url: string) => Response } = {}) {
  const write = opts.write ?? (() => new Response('{}'));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method) return write(url);
    if (url.startsWith('/api/rooms')) return opts.roomsOk === false ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(rooms));
    if (url.startsWith('/api/room-types')) return new Response(JSON.stringify([type]));
    if (url.startsWith('/api/bookings')) return new Response(JSON.stringify(opts.stays ?? []));
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const writes = (api: ReturnType<typeof serve>) => api.mock.calls.filter(([, init]) => init?.method).map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) }));
const openRoom = async (n: string) => { fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^Room ${n},`) })); return screen.findByRole('dialog', { name: `Room ${n}` }); };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('room status wording', () => {
  it('only out of order is red; everything else is a normal state', () => {
    for (const s of ['available', 'occupied', 'cleaning', 'blocked']) expect(roomStatus(s).tone).not.toBe('terra');
    expect(roomStatus('maintenance')).toEqual({ label: 'Out of order', tone: 'terra' });
    expect(roomStatus('weird').label).toBe('Weird'); // unknown statuses are shown, not hidden
  });
});

describe('rooms page layout', () => {
  it('summarises the property, groups rooms by floor, and shows who is in an occupied room', async () => {
    serve(ROOMS, { stays: [stay('b1', 'r1', 'K. Joshi')] });
    render(<RoomsPage />);
    expect(await screen.findByText('4 rooms · 1 occupied · 1 available')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Floor 1/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Floor 2/ })).toBeTruthy();
    expect(screen.getByText(/K\. Joshi · out /)).toBeTruthy();
    expect(screen.getByText('Ready to sell')).toBeTruthy();
    expect(screen.getByText('Housekeeping in progress')).toBeTruthy();
  });

  it('filters with status tabs that show their counts, and hides floors with nothing left', async () => {
    serve(ROOMS);
    render(<RoomsPage />);
    const tab = within(await screen.findByRole('group', { name: 'Show rooms that are' })).getByRole('button', { name: /Out of order/ });
    expect(tab.textContent).toContain('1');
    fireEvent.click(tab);
    expect(tab.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Room 201,/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Room 101,/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Floor 1/ })).toBeNull();
  });

  it('says so when rooms cannot be loaded, instead of "No rooms yet"', async () => {
    serve([], { roomsOk: false });
    render(<RoomsPage />);
    expect((await screen.findByRole('status')).textContent).toMatch(/couldn.t load/i);
  });
});

describe('room drawer', () => {
  it('opens as a labelled dialog with actions that fit the room, and Escape closes it', async () => {
    serve(ROOMS);
    render(<RoomsPage />);
    const drawer = await openRoom('102');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(within(drawer).getByRole('link', { name: 'Create booking' }).getAttribute('href')).toBe('/dashboard/bookings?new=1&room=r2');
    expect(within(drawer).getByRole('button', { name: 'Block room' })).toBeTruthy();
    expect(within(drawer).queryByRole('button', { name: 'Check out guest' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('marks a room clean straight away, and Undo puts it back', async () => {
    const api = serve(ROOMS);
    render(<RoomsPage />);
    const drawer = await openRoom('103');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Mark as clean' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Room 103 marked clean/);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Room 103, Available/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Room 103, Cleaning/ })).toBeTruthy());
    expect(writes(api).map(w => w.body.status)).toEqual(['available', 'cleaning']);
  });

  it('puts a status back and says so when the change is not saved', async () => {
    serve(ROOMS, { write: () => new Response('{}', { status: 500 }) });
    render(<RoomsPage />);
    const drawer = await openRoom('103');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Mark as clean' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not change room 103/i);
    expect(screen.getByRole('button', { name: /^Room 103, Cleaning/ })).toBeTruthy();
  });

  it('checks a guest out through their booking', async () => {
    const api = serve(ROOMS, { stays: [stay('b1', 'r1', 'K. Joshi')] });
    render(<RoomsPage />);
    await screen.findByText(/K\. Joshi/);
    const drawer = await openRoom('101');
    expect(within(drawer).getByText('K. Joshi')).toBeTruthy();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Check out guest' }));
    await waitFor(() => expect(writes(api)).toEqual([{ url: '/api/bookings/b1', body: { action: 'check-out' } }]));
  });

  it('a failed edit stays open with the reason, and the fields are labelled', async () => {
    serve(ROOMS, { write: () => new Response(JSON.stringify({ error: 'Room number already exists' }), { status: 409 }) });
    render(<RoomsPage />);
    const drawer = await openRoom('102');
    fireEvent.click(within(drawer).getByRole('button', { name: /edit details/i }));
    await screen.findByRole('dialog', { name: 'Edit room 102' });
    fireEvent.change(screen.getByLabelText('Room number'), { target: { value: '103' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Room number already exists');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('asks before deleting, and shows why a delete was refused', async () => {
    const api = serve(ROOMS, { write: () => new Response(JSON.stringify({ error: 'This item is still in use by other records and cannot be removed.' }), { status: 409 }) });
    render(<RoomsPage />);
    const drawer = await openRoom('102');
    fireEvent.click(within(drawer).getByRole('button', { name: /delete room/i }));
    await screen.findByRole('dialog', { name: 'Delete room 102?' });
    expect(writes(api)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete room' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/still in use/i);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
