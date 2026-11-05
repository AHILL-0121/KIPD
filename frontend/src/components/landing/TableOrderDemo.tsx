'use client';

import { useState } from 'react';
import { Minus, Plus, QrCode } from 'lucide-react';
import { orderStatus } from '@/lib/order-status';
import { formatCurrency } from '@/lib/currency';

const MENU = [
  { id: 'dosa', name: 'Masala dosa', price: 120 },
  { id: 'coffee', name: 'Filter coffee', price: 60 },
  { id: 'tikka', name: 'Paneer tikka', price: 280 },
  { id: 'lime', name: 'Fresh lime soda', price: 90 },
];

const FLOW = ['new', 'preparing', 'ready', 'served'] as const;
type Step = (typeof FLOW)[number];
type Ticket = { no: number; lines: { name: string; qty: number }[]; total: number; step: Step };

const PILL: Record<string, string> = {
  amber: 'bg-amber-pale text-amber-deep',
  stone: 'bg-stone-100 text-ink-soft',
  sage: 'bg-sage-pale text-sage',
  terra: 'bg-terra-pale text-terra',
};
const ACTION: Record<string, string> = { new: 'Start preparing', preparing: 'Mark ready', ready: 'Mark served' };

export function TableOrderDemo() {
  const [cart, setCart] = useState<Record<string, number>>({ dosa: 2 });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = MENU.reduce((s, m) => s + m.price * (cart[m.id] ?? 0), 0);

  const change = (id: string, d: number) => setCart(c => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));

  const send = () => {
    if (!count) return;
    const lines = MENU.filter(m => cart[m.id]).map(m => ({ name: m.name, qty: cart[m.id] }));
    setTickets(t => [{ no: 41 + t.length, lines, total, step: 'new' }, ...t]);
    setCart({});
  };
  const advance = (no: number) =>
    setTickets(t => t.map(x => (x.no === no ? { ...x, step: FLOW[Math.min(FLOW.indexOf(x.step) + 1, FLOW.length - 1)] } : x)));

  return (
    <div className="grid gap-6 md:grid-cols-[300px_1fr] items-start">
      {/* Guest phone */}
      <div className="mx-auto w-full max-w-[300px] rounded-[28px] border-[6px] border-ink bg-white shadow-xl overflow-hidden">
        <div className="bg-amber text-white px-4 py-3 flex items-center gap-2">
          <QrCode className="w-4 h-4" aria-hidden />
          <div className="leading-tight">
            <p className="text-sm font-medium">Table 4</p>
            <p className="text-[11px] text-white/75">Scanned from the table card</p>
          </div>
        </div>
        <ul className="divide-y divide-stone-100">
          {MENU.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{m.name}</p>
                <p className="text-xs text-ink-muted">{formatCurrency(m.price)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button aria-label={`Remove one ${m.name}`} onClick={() => change(m.id, -1)} disabled={!cart[m.id]}
                  className="w-7 h-7 rounded-full border border-stone-300 grid place-items-center text-ink-soft disabled:opacity-30 hover:bg-stone-100">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-4 text-center text-sm tabular-nums" aria-live="polite">{cart[m.id] ?? 0}</span>
                <button aria-label={`Add one ${m.name}`} onClick={() => change(m.id, 1)}
                  className="w-7 h-7 rounded-full bg-amber text-white grid place-items-center hover:bg-amber-deep">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="p-3 border-t border-stone-200">
          <button onClick={send} disabled={!count}
            className="w-full rounded-lg bg-ink text-white py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-ink-soft transition-colors">
            {count ? `Send to kitchen · ${formatCurrency(total)}` : 'Add something to order'}
          </button>
        </div>
      </div>

      {/* Kitchen screen */}
      <div className="rounded-xl border border-stone-200 bg-ink text-white overflow-hidden min-h-[260px]">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/60">Kitchen display</span>
          <span className="text-xs text-white/60">{tickets.filter(t => t.step !== 'served').length} open</span>
        </div>
        {tickets.length === 0 ? (
          <p className="px-4 py-10 text-sm text-white/55 text-center">
            Orders land here the moment a guest sends them. Try it on the phone.
          </p>
        ) : (
          <ul className="p-3 grid gap-3 sm:grid-cols-2" aria-live="polite">
            {tickets.map(t => {
              const st = orderStatus(t.step);
              return (
                <li key={t.no} className="rounded-lg bg-white text-ink p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-muted">#{t.no} · Table 4</span>
                    <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${PILL[st.tone]}`}>{st.label}</span>
                  </div>
                  <ul className="text-sm">
                    {t.lines.map(l => <li key={l.name}>{l.qty} × {l.name}</li>)}
                  </ul>
                  {ACTION[t.step] ? (
                    <button onClick={() => advance(t.no)}
                      className="mt-auto rounded-md border border-stone-300 py-1.5 text-xs font-medium text-ink-soft hover:bg-stone-100">
                      {ACTION[t.step]}
                    </button>
                  ) : (
                    <p className="mt-auto text-xs text-ink-muted">On the table bill · {formatCurrency(t.total)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
