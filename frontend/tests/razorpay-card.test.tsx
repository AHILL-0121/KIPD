// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RazorpayConnectionCard } from '@/components/settings/razorpay-connection-card';
import { ConfirmHost } from '@/components/ui/confirm';

const URL_A = 'https://kipd.test/api/webhooks/razorpay/tenant-a';
const none = { connected: false, keyId: null, mode: null, webhookReady: false, webhookUrl: URL_A };
const live = { connected: true, keyId: 'rzp_live_AbC123', mode: 'live', webhookReady: true, webhookUrl: URL_A };

function serve(initial: unknown, write: (method: string, body: unknown) => Response = () => new Response('{}'), status = 200) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method) return write(init.method, init.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(JSON.stringify(initial), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const writes = (api: ReturnType<typeof serve>) => api.mock.calls.filter(([, init]) => init?.method).map(([, init]) => ({ method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Settings > Razorpay account', () => {
  it('connecting sends the keys once, then shows the webhook address and the secret a single time', async () => {
    const api = serve(none, () => new Response(JSON.stringify({ ...live, webhookSecret: 'whsec_shown_once' })));
    render(<RazorpayConnectionCard />);
    fireEvent.change(await screen.findByLabelText('Key ID'), { target: { value: ' rzp_live_AbC123 ' } });
    fireEvent.change(screen.getByLabelText('Key Secret'), { target: { value: 'the-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Razorpay' }));

    expect(await screen.findByText('whsec_shown_once')).toBeTruthy();
    expect(writes(api)).toEqual([{ method: 'PUT', body: { keyId: 'rzp_live_AbC123', keySecret: 'the-secret' } }]);
    expect(screen.getByText(URL_A)).toBeTruthy();
    expect(screen.getByText('rzp_live_AbC123')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
    // the key secret is gone from the page: the form is closed and nothing displays it
    expect(screen.queryByLabelText('Key Secret')).toBeNull();
    expect(document.body.textContent).not.toContain('the-secret');

    fireEvent.click(screen.getByRole('button', { name: 'I have saved it in Razorpay' }));
    expect(screen.queryByText('whsec_shown_once')).toBeNull();
  });

  it('shows Razorpay\'s refusal and keeps what was typed', async () => {
    serve(none, () => new Response(JSON.stringify({ error: 'Razorpay did not accept these keys. Check the Key ID and Key Secret and try again. Nothing was saved.' }), { status: 400 }));
    render(<RazorpayConnectionCard />);
    fireEvent.change(await screen.findByLabelText('Key ID'), { target: { value: 'rzp_live_wrong' } });
    fireEvent.change(screen.getByLabelText('Key Secret'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Razorpay' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/did not accept these keys/);
    expect((screen.getByLabelText('Key ID') as HTMLInputElement).value).toBe('rzp_live_wrong');
  });

  it('does not call the server with an empty form', async () => {
    const api = serve(none);
    render(<RazorpayConnectionCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Razorpay' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Enter both/);
    expect(writes(api)).toEqual([]);
  });

  it('a connected account shows no secret, and warns when the webhook secret is missing', async () => {
    serve({ ...live, mode: 'test', webhookReady: false });
    render(<RazorpayConnectionCard />);
    expect(await screen.findByText('Test mode')).toBeTruthy();
    expect(screen.getByText(/never shown again/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/No webhook secret yet/);
    expect(screen.queryByLabelText('Key Secret')).toBeNull();
  });

  it('asks before disconnecting, and does nothing if the owner backs out', async () => {
    const api = serve(live, () => new Response(JSON.stringify(none)));
    render(<><RazorpayConnectionCard /><ConfirmHost /></>);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disconnect Razorpay?' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(dialog).toBeTruthy();
    expect(writes(api)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await screen.findByRole('dialog', { name: 'Disconnect Razorpay?' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' }).at(-1)!);
    await waitFor(() => expect(writes(api)).toEqual([{ method: 'DELETE', body: undefined }]));
    expect(await screen.findByRole('button', { name: 'Connect Razorpay' })).toBeTruthy();
  });

  it('a manager is told only the owner can change it', async () => {
    serve({ error: 'You do not have permission to do this' }, undefined, 403);
    render(<RazorpayConnectionCard />);
    expect(await screen.findByText(/Only the owner can connect or change/)).toBeTruthy();
    expect(screen.queryByLabelText('Key ID')).toBeNull();
  });
});
