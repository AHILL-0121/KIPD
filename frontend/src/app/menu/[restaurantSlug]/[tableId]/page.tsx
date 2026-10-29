'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Minus, Plus, Send, ShoppingCart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { KipdMascot } from '@/components/mascot/KipdMascot';
import { formatCurrency } from '@/lib/currency';

interface MenuItem { id: string; name: string; description: string; price: number; tags: string[]; imageUrl: string | null }
interface Category { id: string; name: string; items: MenuItem[] }
interface MenuResponse { restaurant: { name: string }; table: { number: string } | null; categories: Category[] }
interface Tracked { status: string; items: { name: string; quantity: number }[]; total: number }

// What the guest sees for each kitchen status.
const STATUS_TEXT: Record<string, { title: string; detail: string; done?: boolean }> = {
  new: { title: 'Order sent', detail: 'Waiting for the kitchen to pick it up.' },
  acknowledged: { title: 'The kitchen has your order', detail: 'They are getting started.' },
  preparing: { title: 'Being prepared', detail: 'It will be with you shortly.' },
  ready: { title: 'Ready', detail: 'Your food is on its way to the table.' },
  served: { title: 'Enjoy your meal', detail: 'Ask a member of staff if you need anything else.', done: true },
  closed: { title: 'Enjoy your meal', detail: 'Ask a member of staff if you need anything else.', done: true },
  cancelled: { title: 'Order cancelled', detail: 'Please speak to a member of staff.', done: true },
};

const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode: fine */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

export default function GuestMenuPage({ params }: { params: { restaurantSlug: string; tableId: string } }) {
  const { restaurantSlug: slug, tableId } = params;
  const orderKey = `kipd-order:${tableId}`;

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const loadMenu = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/public/menu/${slug}?table=${tableId}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 404 ? 'This menu is not available. Please ask a member of staff.' : data.error || 'Could not load the menu.');
      setMenu(data);
      setCategory((c) => c || data.categories[0]?.id || '');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the menu.');
    }
  }, [slug, tableId]);

  useEffect(() => { loadMenu(); setOrderId(store.get(orderKey)); }, [loadMenu, orderKey]);

  // Follow the order until the guest is done. Stops when the order is finished or the page closes.
  useEffect(() => {
    if (!orderId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/public/orders/${orderId}?table=${tableId}`, { cache: 'no-store' });
        if (res.status === 404) { store.del(orderKey); if (!stopped) { setOrderId(null); setTracked(null); } return; }
        if (res.ok && !stopped) setTracked(await res.json());
      } catch { /* offline for a moment: try again next time */ }
    };
    poll();
    const timer = setInterval(poll, 8000);
    return () => { stopped = true; clearInterval(timer); };
  }, [orderId, tableId, orderKey]);

  const itemsById = useMemo(() => new Map((menu?.categories ?? []).flatMap((c) => c.items).map((i) => [i.id, i])), [menu]);
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => ({ item: itemsById.get(id)!, quantity })).filter((l) => l.item);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const total = lines.reduce((n, l) => n + l.item.price * l.quantity, 0);
  const change = (id: string, delta: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, (c[id] ?? 0) + delta)) }));

  async function placeOrder() {
    setSending(true); setSendError(null);
    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug, tableId, note: note.trim() || undefined, website: honeypot.current?.value ?? '',
          items: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Your order could not be sent. Please try again or ask a member of staff.');
      store.set(orderKey, data.orderId);
      setOrderId(data.orderId); setTracked(null); setCart({}); setNote(''); setShowCart(false);
    } catch (e) {
      // The cart is kept, so the guest never has to start again.
      setSendError(e instanceof Error ? e.message : 'Your order could not be sent.');
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <KipdMascot size="lg" animated={false} />
          <p className="mt-6 text-lg text-ink" role="alert">{loadError}</p>
          <Button className="mt-6" onClick={loadMenu}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!menu) return <div className="min-h-screen bg-cream flex items-center justify-center text-ink-muted" role="status">Loading the menu…</div>;

  const current = menu.categories.find((c) => c.id === category) ?? menu.categories[0];
  const status = tracked ? STATUS_TEXT[tracked.status] ?? { title: tracked.status, detail: '' } : null;

  return (
    <div className="min-h-screen bg-cream pb-28">
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-xl font-bold text-ink truncate">{menu.restaurant.name}</h1>
            {menu.table && <p className="text-sm text-ink-muted">Table {menu.table.number}</p>}
          </div>
          <button onClick={() => setShowCart(true)} className="relative p-3 bg-amber rounded-xl" aria-label={`Open your order, ${count} items`}>
            <ShoppingCart className="w-6 h-6 text-ink" />
            {count > 0 && <span className="absolute -top-2 -right-2 min-w-6 h-6 px-1 bg-terra text-white rounded-full text-xs flex items-center justify-center font-bold">{count}</span>}
          </button>
        </div>
        {menu.categories.length > 1 && (
          <nav className="max-w-3xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto" aria-label="Menu sections">
            {menu.categories.map((c) => (
              <Button key={c.id} size="sm" variant={c.id === current?.id ? 'primary' : 'ghost'} onClick={() => setCategory(c.id)} className="whitespace-nowrap">{c.name}</Button>
            ))}
          </nav>
        )}
      </header>

      {status && (
        <div className="max-w-3xl mx-auto px-4 pt-4" role="status" aria-live="polite">
          <Card hover={false} className="p-4 border-2 border-sage">
            <div className="flex items-start gap-3">
              <Check className="w-6 h-6 text-sage flex-none mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-ink">{status.title}</div>
                <div className="text-sm text-ink-muted">{status.detail}</div>
                {tracked && <div className="text-sm text-ink-muted mt-2">{tracked.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')} · {formatCurrency(tracked.total)}</div>}
              </div>
              {STATUS_TEXT[tracked!.status]?.done && <button className="text-sm underline text-ink-muted" onClick={() => { store.del(orderKey); setOrderId(null); setTracked(null); }}>Dismiss</button>}
            </div>
          </Card>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {menu.categories.length === 0 && <p className="text-center text-ink-muted py-16">The menu is empty right now. Please ask a member of staff.</p>}
        {current?.items.map((item) => {
          const qty = cart[item.id] ?? 0;
          return (
            <Card key={item.id} hover={false} className="p-4 flex gap-4">
              {item.imageUrl && (
                <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                  <Image src={item.imageUrl} alt="" fill sizes="96px" className="object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg text-ink">{item.name}</h2>
                {item.description && <p className="text-sm text-ink-muted mt-1">{item.description}</p>}
                {item.tags.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{item.tags.map((t) => <Badge key={t} variant="stone" className="text-xs">{t}</Badge>)}</div>}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-lg font-bold text-ink">{formatCurrency(item.price)}</span>
                  {qty === 0 ? (
                    <Button size="sm" onClick={() => change(item.id, 1)} aria-label={`Add ${item.name}`}><Plus className="w-4 h-4" /> Add</Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => change(item.id, -1)} className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center" aria-label={`Remove one ${item.name}`}><Minus className="w-4 h-4" /></button>
                      <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
                      <button onClick={() => change(item.id, 1)} className="w-10 h-10 rounded-lg bg-amber flex items-center justify-center" aria-label={`Add one more ${item.name}`}><Plus className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </main>

      {count > 0 && !showCart && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-cream via-cream to-transparent">
          <Button className="w-full max-w-3xl mx-auto flex justify-between text-lg py-4" onClick={() => setShowCart(true)}>
            <span>View order ({count})</span><span>{formatCurrency(total)}</span>
          </Button>
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your order">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="p-5 border-b border-stone-200 flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-ink">Your order</h2>
              <button onClick={() => setShowCart(false)} aria-label="Close" className="p-2"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {lines.length === 0 && <p className="text-center py-16 text-ink-muted">Your order is empty.</p>}
              {lines.map(({ item, quantity }) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <div className="flex-1 min-w-0"><div className="font-medium text-ink">{item.name}</div><div className="text-sm text-ink-muted">{formatCurrency(item.price)} each</div></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => change(item.id, -1)} className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center" aria-label={`Remove one ${item.name}`}><Minus className="w-4 h-4" /></button>
                    <span className="w-6 text-center font-medium">{quantity}</span>
                    <button onClick={() => change(item.id, 1)} className="w-9 h-9 rounded-lg bg-amber flex items-center justify-center" aria-label={`Add one more ${item.name}`}><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {lines.length > 0 && (
                <label className="block pt-2">
                  <span className="text-sm text-ink-muted">Anything we should know? (allergies, no onions…)</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} className="mt-1 w-full rounded-lg border border-stone-300 p-3 text-ink" />
                </label>
              )}
              {/* Invisible to people. Bots tend to fill every field; the server refuses those. */}
              <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            </div>
            {lines.length > 0 && (
              <div className="p-5 border-t border-stone-200 space-y-3">
                {sendError && <p className="text-sm text-terra bg-terra-pale rounded-lg p-3" role="alert">{sendError}</p>}
                <div className="flex justify-between text-2xl font-bold text-ink"><span>Total</span><span>{formatCurrency(total)}</span></div>
                <p className="text-xs text-ink-muted">Taxes are added to your bill at the end.</p>
                <Button variant="terra" className="w-full text-lg py-4" onClick={placeOrder} disabled={sending}>
                  <Send className="w-5 h-5" /> {sending ? 'Sending…' : 'Place order'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
