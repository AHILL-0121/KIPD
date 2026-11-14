'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Link2 } from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { confirmDialog } from '@/components/ui/confirm';
import { toast } from '@/components/ui/toaster';

interface Connection {
  connected: boolean;
  keyId: string | null;
  mode: 'test' | 'live' | null;
  webhookReady: boolean;
  webhookUrl: string;
  /** Present only in the answer to connecting or to "new secret": it is shown once and cannot be read again. */
  webhookSecret?: string;
}

const EVENTS = ['payment_link.paid', 'qr_code.credited'];

/**
 * Settings > Payments > Razorpay. The business connects its own Razorpay account, so online payments settle to its
 * own bank account. The Key Secret is sent to the server once and never comes back; the webhook secret is shown once.
 */
export function RazorpayConnectionCard() {
  const [state, setState] = useState<'loading' | 'ready' | 'owner-only' | 'failed'>('loading');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/payments/razorpay')
      .then(async (res) => {
        if (res.status === 403) { setState('owner-only'); return; }
        if (!res.ok) throw new Error(String(res.status));
        setConnection(await res.json());
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, []);

  const send = async (method: 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<Connection | null> => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/settings/payments/razorpay', {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' && res.status !== 500 ? data.error : 'Something went wrong. Nothing was changed, please try again.');
        return null;
      }
      const { webhookSecret, ...rest } = data as Connection;
      setConnection(rest);
      setSecretOnce(webhookSecret ?? null);
      return data as Connection;
    } catch {
      setError('Could not reach the server. Nothing was changed, please try again.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!keyId.trim() || !keySecret.trim()) { setError('Enter both the Key ID and the Key Secret.'); return; }
    const saved = await send('PUT', { keyId: keyId.trim(), keySecret: keySecret.trim() });
    if (!saved) return;
    setKeyId(''); setKeySecret(''); setEditing(false);
    toast('success', 'Razorpay connected', saved.webhookSecret ? 'One step left: add the webhook in Razorpay.' : undefined);
  };

  const regenerate = async () => {
    const ok = await confirmDialog({
      title: 'Make a new webhook secret?',
      message: 'The current secret stops working straight away. Online payments will not be added to bills until you put the new secret into Razorpay.',
      confirmLabel: 'Make new secret',
    });
    if (ok) await send('POST');
  };

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: 'Disconnect Razorpay?',
      message: 'Payment links and QR codes stop working. Payments already recorded stay as they are. Also remove the webhook in Razorpay.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (ok && (await send('DELETE'))) toast('success', 'Razorpay disconnected');
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast('success', `${what} copied`); }
    catch { toast('error', 'Could not copy', 'Select the text and copy it yourself.'); }
  };

  const showForm = state === 'ready' && (!connection?.connected || editing);

  return (
    <Card hover={false}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber rounded-lg flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle>Razorpay account</CardTitle>
          <CardDescription>Online payments go straight to your own bank account</CardDescription>
        </div>
        {connection?.connected && (
          <Badge variant={connection.webhookReady && !secretOnce ? 'sage' : 'amber'}>
            {connection.mode === 'live' ? 'Live' : 'Test mode'}
          </Badge>
        )}
      </div>

      {state === 'loading' && <p className="text-sm text-ink-muted">Loading…</p>}
      {state === 'failed' && <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">Could not load the Razorpay connection. Refresh the page to try again.</p>}
      {state === 'owner-only' && <p className="text-sm text-ink-muted">Only the owner can connect or change the Razorpay account, because it decides where the money goes.</p>}

      {state === 'ready' && connection?.connected && !editing && (
        <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm mb-6">
          <dt className="text-ink-muted">Key ID</dt>
          <dd className="font-mono text-ink break-all">{connection.keyId}</dd>
          <dt className="text-ink-muted">Key Secret</dt>
          <dd className="text-ink">Saved. It is stored encrypted and is never shown again.</dd>
        </dl>
      )}

      {showForm && (
        <div className="space-y-4 mb-6">
          {!connection?.connected && (
            <p className="text-sm text-ink-muted">
              In Razorpay, open Account &amp; Settings &gt; API Keys and generate a key. Paste both parts here. Use a test key first if you want to try it without real money.
            </p>
          )}
          <Input label="Key ID" placeholder="rzp_live_…" autoComplete="off" value={keyId} onChange={(e) => { setError(''); setKeyId(e.target.value); }} />
          <Input label="Key Secret" type="password" autoComplete="new-password" value={keySecret} onChange={(e) => { setError(''); setKeySecret(e.target.value); }} />
          <div className="flex gap-3">
            {editing && <Button variant="ghost" onClick={() => { setEditing(false); setError(''); setKeyId(''); setKeySecret(''); }} disabled={busy}>Cancel</Button>}
            <Button onClick={connect} isLoading={busy}>{connection?.connected ? 'Replace keys' : 'Connect Razorpay'}</Button>
          </div>
        </div>
      )}

      {state === 'ready' && connection?.connected && (
        <div className="rounded-xl border border-stone-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Link2 className="w-4 h-4" aria-hidden="true" /> Webhook (how a paid bill gets marked paid)
          </div>
          <p className="text-sm text-ink-muted">
            In Razorpay, open Account &amp; Settings &gt; Webhooks and add a webhook with this address, the secret below, and these events: {EVENTS.join(', ')}.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all rounded-lg bg-stone-100 px-3 py-2 text-xs text-ink">{connection.webhookUrl}</code>
            <Button variant="ghost" size="sm" aria-label="Copy webhook address" onClick={() => copy(connection.webhookUrl, 'Address')}><Copy className="w-4 h-4" aria-hidden="true" /></Button>
          </div>

          {secretOnce ? (
            <div role="status" className="rounded-lg bg-amber-pale px-4 py-3">
              <p className="text-sm font-semibold text-amber-deep">Webhook secret: copy it now. It will not be shown again.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 min-w-0 break-all rounded-lg bg-white px-3 py-2 text-xs text-ink">{secretOnce}</code>
                <Button variant="ghost" size="sm" aria-label="Copy webhook secret" onClick={() => copy(secretOnce, 'Secret')}><Copy className="w-4 h-4" aria-hidden="true" /></Button>
              </div>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setSecretOnce(null)}>I have saved it in Razorpay</Button>
            </div>
          ) : connection.webhookReady ? (
            <p className="text-sm text-ink-muted">A webhook secret is set. If you have lost it, make a new one and update it in Razorpay.</p>
          ) : (
            <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">No webhook secret yet, so online payments are switched off. Make one and add it in Razorpay.</p>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{error}</p>}

      {state === 'ready' && connection?.connected && !editing && (
        <div className="flex flex-wrap justify-end gap-3 mt-6 pt-6 border-t border-stone-200">
          <Button variant="ghost" className="text-terra hover:bg-terra-pale" onClick={disconnect} disabled={busy}>Disconnect</Button>
          <Button variant="ghost" onClick={regenerate} disabled={busy}>New webhook secret</Button>
          <Button variant="ghost" onClick={() => setEditing(true)} disabled={busy}>Replace keys</Button>
        </div>
      )}
    </Card>
  );
}
