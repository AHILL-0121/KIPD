'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLive } from '@/lib/use-live';
import { HoldButton } from '@/components/ui/hold-button';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, AlertCircle, Volume2, VolumeX, ChefHat } from 'lucide-react';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';

interface KDSOrder {
  id: string;
  type: 'dine_in' | 'room_service';
  tableNumber?: string;
  roomNumber?: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  status: 'new' | 'acknowledged' | 'preparing' | 'ready';
  specialInstructions?: string;
  createdAt: string;
}

export default function KDSPage({ params }: { params: { outletId: string } }) {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [userRole, setUserRole] = useState<string>('');
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Fetch User Role to determine if KDS is Read-Only
    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.role) setUserRole(data.role); })
      .catch(() => { });

  }, []);

  // Orders already on screen, so only genuinely new tickets make a sound.
  const seen = useRef<Set<string> | null>(null);
  // Browsers only allow sound after a tap on the page, so the kitchen turns it on once per visit.
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = soundOn;
  const chime = () => new Audio('/notification.mp3').play().then(() => true).catch(() => false);
  const toggleSound = async () => {
    if (soundOn) return setSoundOn(false);
    if (await chime()) setSoundOn(true); // the test chime doubles as the proof that sound works
  };
  const load = useCallback(() => {
    fetch(`/api/kds/${params.outletId}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: KDSOrder[]) => {
        if (!Array.isArray(data)) return;
        const known = seen.current;
        if (known && soundRef.current && data.some(o => !known.has(o.id))) chime();
        seen.current = new Set(data.map(o => o.id));
        setOrders(data);
      })
      .catch(console.error);
  }, [params.outletId]);

  useEffect(() => { load(); }, [load]);
  useLive(load, params.outletId);

  const send = async (orderId: string, status: KDSOrder['status']) => {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(res.status === 403 ? 'You are not allowed to change orders.' : 'Could not update the order. Please try again.');
  };

  const updateStatus = async (order: KDSOrder, newStatus: KDSOrder['status']) => {
    setProblem(null);
    // Show the change at once; if the server says no, put the real state back and tell the cook.
    setOrders(prev => (newStatus === 'ready' ? prev.filter(o => o.id !== order.id) : prev.map(o => (o.id === order.id ? { ...o, status: newStatus } : o))));
    try {
      await send(order.id, newStatus);
      if (newStatus === 'ready') {
        const label = order.type === 'dine_in' ? `Table ${order.tableNumber}` : `Room ${order.roomNumber}`;
        setUndo({ id: order.id, label });
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setUndo(null), 8000);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not update the order.');
      load();
    }
  };

  const undoReady = async () => {
    if (!undo) return;
    const { id } = undo;
    setUndo(null);
    try { await send(id, 'preparing'); } catch (e) { setProblem(e instanceof Error ? e.message : 'Could not undo.'); }
    load();
  };

  const canAct = ['owner', 'manager', 'waiter', 'kitchen'].includes(userRole);
  // Oldest first: the ticket that has waited longest is always top-left.
  const queue = [...orders].sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt));

  return (
    <div className="min-h-screen bg-ink p-4 md:p-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-500">
        <div>
          <h1 className="text-2xl font-semibold text-white">Kitchen</h1>
          <p className="text-stone-300 text-sm" aria-live="polite">{queue.length === 0 ? 'No open orders' : `${queue.length} open order${queue.length === 1 ? '' : 's'}, oldest first`}</p>
        </div>
        <button
          onClick={toggleSound}
          aria-pressed={soundOn}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${soundOn ? 'bg-stone-500/40 text-white' : 'bg-white text-ink'}`}
        >
          {soundOn ? <Volume2 className="w-4 h-4" aria-hidden="true" /> : <VolumeX className="w-4 h-4" aria-hidden="true" />}
          {soundOn ? 'Sound on' : 'Enable sound for new orders'}
        </button>
      </div>

      {problem && <p role="alert" className="mb-4 rounded-lg bg-terra-pale p-3 text-terra font-medium">{problem}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {queue.map((order) => {
          const minutesAgo = differenceInMinutes(new Date(), new Date(order.createdAt));
          const late = minutesAgo >= 15;
          const timeAgo = formatDistanceToNow(new Date(order.createdAt), { addSuffix: true });
          const where = order.type === 'dine_in' ? `Table ${order.tableNumber}` : `Room ${order.roomNumber}`;
          const isNew = order.status === 'new' || order.status === 'acknowledged';

          return (
            <article
              key={order.id}
              aria-label={`${where}, ${order.status}${late ? ', late' : ''}`}
              className={`bg-white rounded-xl p-5 border-2 ${late ? 'border-terra' : isNew ? 'border-amber' : 'border-stone-200'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <MapPin className="w-5 h-5 text-ink-muted" aria-hidden="true" />
                    <h2 className="font-bold text-2xl text-ink">{where}</h2>
                  </div>
                  <div className={`flex items-center gap-1.5 text-sm ${late ? 'text-terra font-semibold' : 'text-ink-muted'}`}>
                    {late ? <AlertCircle className="w-4 h-4" aria-hidden="true" /> : <Clock className="w-4 h-4" aria-hidden="true" />}
                    <span>{late ? 'Late: ' : ''}{timeAgo}</span>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isNew ? 'bg-amber-pale text-amber-deep' : 'bg-stone-100 text-ink-soft'}`}>
                  {isNew ? 'New' : order.status === 'preparing' ? 'Preparing' : order.status}
                </span>
              </div>

              <ul className="space-y-3 mb-5">
                {order.items.map((item, idx) => (
                  <li key={idx} className="border-l-4 border-amber pl-3">
                    <div className="font-bold text-xl text-ink">{item.quantity} × {item.name}</div>
                    {item.notes && <div className="mt-1 text-sm text-terra bg-terra-pale p-2 rounded"><span className="font-semibold">Note:</span> {item.notes}</div>}
                  </li>
                ))}
              </ul>

              {order.specialInstructions && (
                <div className="bg-amber-pale border border-amber-200 p-3 rounded-lg mb-4 text-ink">
                  <div className="font-semibold text-sm mb-0.5">Special instructions</div>
                  <div className="text-sm">{order.specialInstructions}</div>
                </div>
              )}

              {canAct ? (
                isNew ? (
                  <HoldButton className="w-full" onConfirm={() => updateStatus(order, 'preparing')}>Accept order</HoldButton>
                ) : order.status === 'preparing' ? (
                  <Button className="w-full text-lg py-4" variant="sage" onClick={() => updateStatus(order, 'ready')}>Mark ready</Button>
                ) : null
              ) : (
                <p className="text-center p-3 rounded-lg bg-stone-100 text-ink-soft text-sm">Your role can view this screen but not change orders.</p>
              )}
            </article>
          );
        })}
      </div>

      {queue.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ChefHat className="w-12 h-12 text-stone-300 mb-4" aria-hidden="true" />
          <p className="text-white text-xl font-semibold">All caught up</p>
          <p className="text-stone-300 mt-1">New orders appear here automatically.</p>
        </div>
      )}

      {undo && (
        <div role="status" className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-lg bg-white px-5 py-3 shadow-xl">
          <span className="text-ink font-medium">{undo.label} marked ready</span>
          <button onClick={undoReady} className="font-semibold text-amber underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">Undo</button>
        </div>
      )}
    </div>
  );
}
