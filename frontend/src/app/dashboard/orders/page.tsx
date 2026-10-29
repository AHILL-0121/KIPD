'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLive } from '@/lib/use-live';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Clock, MapPin, Plus, Minus, X, ShoppingCart, Receipt } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { orderStatus } from '@/lib/order-status';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '@/components/ui/select';

interface OrderItem {
  id: string;
  quantity: number;
  price: string;
  notes?: string;
  menuItem?: { id: string; name: string; price: string };
}

interface Order {
  id: string;
  type: 'dine_in' | 'room_service';
  tableId?: string;
  roomId?: string;
  table?: { tableNumber: string };
  status: 'new' | 'acknowledged' | 'preparing' | 'ready' | 'served' | 'closed' | 'cancelled';
  totalAmount: string;
  specialInstructions?: string;
  orderItems: OrderItem[];
  createdAt: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: string;
  isAvailable: boolean;
  category?: { name: string };
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

interface TableOption {
  id: string;
  tableNumber: string;
  capacity: number;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tableOptions, setTableOptions] = useState<TableOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal State
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Billing Modal State
  const [checkoutTable, setCheckoutTable] = useState<{ table: TableOption; total: number; tickets: Order[] } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  const [stale, setStale] = useState(false);

  const [channel, setChannel] = useState<string | null>(null);

  const fetchOrders = useCallback(() => {
    fetch('/api/orders', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .then(res => { if (!res.ok) throw new Error(`Orders failed: ${res.status}`); return res.json(); })
      .then(data => { setOrders(Array.isArray(data) ? data : []); setStale(false); })
      .catch((err) => { console.error(err); setStale(true); }) // keep what is on screen, but say it may be out of date
      .finally(() => setLoading(false));
  }, []);

  const fetchMenuItems = () => {
    fetch('/api/menu')
      .then(res => res.json())
      .then(data => setMenuItems(Array.isArray(data) ? data.filter((i: MenuItem) => i.isAvailable) : []))
      .catch(console.error);
  };

  useEffect(() => {
    fetchOrders();
    fetchMenuItems();
    fetch('/api/tables')
      .then(res => res.json())
      .then(data => setTableOptions(Array.isArray(data) ? data : []))
      .catch(() => { });

    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.id) setChannel(data.id); })
      .catch(() => { });
  }, [fetchOrders]);

  useLive(fetchOrders, channel);

  useEffect(() => {
    if (!showCreate && !checkoutTable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowCreate(false);
      if (!saving) setCheckoutTable(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, checkoutTable, saving]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o));
      showToast(`Marked ${orderStatus(newStatus).label.toLowerCase()}`, 'success');
    } catch {
      showToast('Could not update the order. Please try again.', 'error');
      fetchOrders();
    }
  };

  // Group active orders heavily by table
  const getActiveTabs = () => {
    const tabs: Record<string, { table: TableOption; total: number; tickets: Order[] }> = {};

    orders.forEach(o => {
      if (['closed', 'cancelled'].includes(o.status)) return; // Only ignore physically paid/settled tickets
      if (!o.tableId) return;

      const table = tableOptions.find(t => t.id === o.tableId);
      if (!table) return;

      if (!tabs[o.tableId]) {
        tabs[o.tableId] = { table, total: 0, tickets: [] };
      }
      tabs[o.tableId].tickets.push(o);
      tabs[o.tableId].total += Number(o.totalAmount);
    });
    return Object.values(tabs);
  };

  const activeTabs = getActiveTabs();

  // Free tables to start a new tab
  const getFreeTables = () => {
    const activeTableIds = activeTabs.map(t => t.table.id);
    return tableOptions.filter(t => !activeTableIds.includes(t.id));
  };

  const openNewOrder = (tableId: string = '') => {
    setSelectedTableId(tableId);
    setCart([]);
    setSpecialInstructions('');
    setMenuSearch('');
    setShowCreate(true);
  };

  const addToCart = (item: MenuItem) => {
    const existing = cart.find(c => c.menuItemId === item.id);
    if (existing) {
      setCart(cart.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1, notes: '' }]);
    }
  };

  const removeFromCart = (menuItemId: string) => {
    const existing = cart.find(c => c.menuItemId === menuItemId);
    if (existing && existing.quantity > 1) {
      setCart(cart.map(c => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity - 1 } : c));
    } else {
      setCart(cart.filter(c => c.menuItemId !== menuItemId));
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleFireTicket = async () => {
    if (cart.length === 0) {
      showToast('Add at least one item', 'error');
      return;
    }
    if (!selectedTableId) {
      showToast('Select a table', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dine_in',
          tableId: selectedTableId,
          items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, notes: c.notes || undefined })),
          specialInstructions: specialInstructions || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setShowCreate(false);
      setCart([]);
      setSelectedTableId('');
      fetchOrders();
      showToast('Sent to the kitchen', 'success');
    } catch {
      showToast('Could not send to the kitchen. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSettleTab = async (paymentMethod: 'cash' | 'upi') => {
    if (!checkoutTable) return;

    if (paymentMethod === 'upi') {
      showToast('UPI payment is not available yet.', 'error');
      // Here is where we'd bridge Capacitor background listener status
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/orders/settle-tab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: checkoutTable.table.id,
          paymentMethod
        }),
      });
      if (!res.ok) throw new Error('Failed to settle');

      setCheckoutTable(null);
      fetchOrders();
      showToast(`Table ${checkoutTable.table.tableNumber}: bill sent to the front desk`, 'success');
    } catch {
      showToast('Could not send the bill. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pr-2">
        <div>
          <h1 className="section-title">Active tabs</h1>
          <p className="section-sub">Running table sessions. Add items, send them to the kitchen, and send the bill to the front desk.</p>
        </div>

        <Button onClick={() => openNewOrder()}>
          <Plus className="w-4 h-4" />
          Seat new table
        </Button>
      </div>

      {stale && (
        <p role="status" className="mb-6 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">
          Couldn&apos;t refresh just now. What you see may be a little out of date, and we&apos;ll keep trying.
        </p>
      )}

      {activeTabs.length === 0 ? (
        <EmptyState
          title="No active tables"
          description="Every table is empty. Seat a guest to open a tab."
          actionLabel="Seat new table"
          onAction={() => openNewOrder()}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {activeTabs.map((tab) => (
            <Card key={tab.table.id} hover={false}>
              <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <div aria-hidden="true" className="h-12 w-12 rounded-full bg-amber-pale text-amber-deep flex items-center justify-center font-bold text-xl">
                    {tab.table.tableNumber}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-ink">Table {tab.table.tableNumber}</h2>
                    <p className="text-sm text-ink-muted">{tab.tickets.length} {tab.tickets.length === 1 ? 'ticket' : 'tickets'} sent to the kitchen</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-ink-muted">Tab total</div>
                  <div className="text-2xl font-bold text-ink">{formatCurrency(tab.total)}</div>
                </div>
              </div>

              {/* Tickets Section within Tab */}
              <div className="space-y-4 mb-4">
                {tab.tickets.map((ticket, i) => (
                  <div key={ticket.id} className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                    <div className="flex items-center justify-between mb-3 border-b border-stone-200 pb-2">
                      <span className="text-sm font-semibold text-ink-soft">
                        Ticket {i + 1} <span className="font-normal text-ink-muted">· {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                      </span>
                      <Badge variant={orderStatus(ticket.status).tone} dot>
                        {orderStatus(ticket.status).label}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {(ticket.orderItems || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-ink">
                            <span className="font-semibold text-amber-deep mr-2">{item.quantity}×</span>
                            {item.menuItem?.name || 'Item'}
                          </span>
                          <span className="text-ink-muted">{formatCurrency(Number(item.price) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {ticket.status === 'ready' && (
                      <Button size="sm" variant="sage" className="w-full mt-3" onClick={() => updateOrderStatus(ticket.id, 'served')}>
                        Mark as served
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Tab Action Footer */}
              <div className="flex gap-3 pt-4 border-t border-stone-200">
                <Button variant="ghost" className="flex-1 bg-stone-100 hover:bg-stone-200" onClick={() => openNewOrder(tab.table.id)}>
                  <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Add more items
                </Button>
                <Button className="flex-1" onClick={() => setCheckoutTable(tab)}>
                  <Receipt className="w-4 h-4 mr-2" aria-hidden="true" /> Settle bill
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Fire Ticket (Create Order) Sheet/Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-[100] md:p-4" onClick={() => setShowCreate(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              role="dialog" aria-modal="true" aria-labelledby="send-title" className="bg-white rounded-t-3xl md:rounded-2xl p-6 md:p-8 w-full max-w-2xl h-[90vh] md:h-auto md:max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

              <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                  <h2 id="send-title" className="text-2xl font-bold text-ink">Send to kitchen</h2>
                  <p className="text-sm text-ink-muted">Add items to a table&apos;s running tab.</p>
                </div>
                <button onClick={() => setShowCreate(false)} aria-label="Close" className="bg-stone-100 p-2 rounded-full hover:bg-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><X className="w-5 h-5" aria-hidden="true" /></button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pb-20 md:pb-0">
                {/* Table Assignment Component */}
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <label className="block text-sm font-semibold text-ink mb-2">Table</label>
                  <Select
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    options={[
                      { value: '', label: 'Choose a table' },
                      ...tableOptions.map(t => ({ value: t.id, label: `Table ${t.tableNumber}` }))
                    ]}
                  />
                  {selectedTableId && !activeTabs.find(t => t.table.id === selectedTableId) && (
                    <p className="text-xs text-amber mt-2 font-medium">A new tab will open for Table {tableOptions.find(t => t.id === selectedTableId)?.tableNumber}.</p>
                  )}
                </div>

                {/* Point of Sale Item Picker */}
                <div>
                  <Input placeholder="Search menu..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="mb-3" />
                  <div className="max-h-64 overflow-y-auto space-y-2 border border-stone-200 rounded-xl p-3 bg-stone-50/50">
                    {menuItems.filter(i => i.name.toLowerCase().includes(menuSearch.toLowerCase())).map(item => {
                      const inCart = cart.find(c => c.menuItemId === item.id);
                      return (
                        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-white border border-stone-200 shadow-sm">
                          <div>
                            <span className="font-semibold text-ink block">{item.name}</span>
                            <span className="text-sm text-ink-muted">{formatCurrency(Number(item.price))}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {inCart ? (
                              <div className="flex items-center bg-stone-100 rounded-lg p-1">
                                <button onClick={() => removeFromCart(item.id)} aria-label={`Remove one ${item.name}`} className="p-2 rounded bg-white shadow-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><Minus className="w-4 h-4" aria-hidden="true" /></button>
                                <span className="font-bold text-lg w-10 text-center" aria-live="polite">{inCart.quantity}</span>
                                <button onClick={() => addToCart(item)} aria-label={`Add one more ${item.name}`} className="p-2 rounded bg-amber shadow-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"><Plus className="w-4 h-4" aria-hidden="true" /></button>
                              </div>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => addToCart(item)} className="font-bold">
                                <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Add<span className="sr-only"> {item.name}</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cart Preview */}
                {cart.length > 0 && (
                  <div className="bg-amber-pale p-4 rounded-xl border border-amber/40">
                    <div className="font-semibold text-amber-deep mb-3 flex items-center"><ShoppingCart className="w-4 h-4 mr-2" aria-hidden="true" /> This ticket</div>
                    {cart.map(c => (
                      <div key={c.menuItemId} className="flex justify-between text-sm mb-2 text-ink/80 font-medium">
                        <span>{c.quantity}x {c.name}</span>
                        <span>{formatCurrency(c.price * c.quantity)}</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-amber/30 flex justify-between font-bold text-lg text-ink">
                      <span>Total</span>
                      <span>{formatCurrency(cartTotal)}</span>
                    </div>
                  </div>
                )}

                <Input label="Notes for the kitchen (optional)" placeholder="e.g. extra spicy" value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} />
              </div>

              {/* Action Sheet Footer */}
              <div className="pt-4 border-t border-stone-200 mt-auto shrink-0 bg-white md:bg-transparent pb-safe md:pb-0">
                <Button className="w-full text-lg py-6" onClick={handleFireTicket} disabled={saving || cart.length === 0 || !selectedTableId}>
                  {saving ? 'Sending…' : `Send to kitchen (${formatCurrency(cartTotal)})`}
                </Button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout / Settle Modal */}
      <AnimatePresence>
        {checkoutTable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4" onClick={() => setCheckoutTable(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="settle-title" className="bg-white rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-6">
                <div aria-hidden="true" className="h-16 w-16 bg-amber-pale text-amber-deep rounded-full flex items-center justify-center font-bold text-3xl mx-auto mb-3">
                  {checkoutTable.table.tableNumber}
                </div>
                <h2 id="settle-title" className="text-2xl font-bold text-ink">Settle table {checkoutTable.table.tableNumber}</h2>
                <p className="text-lg text-ink font-bold mt-2">Total: {formatCurrency(checkoutTable.total)}</p>
                <p className="text-sm text-ink-muted">{checkoutTable.tickets.length} {checkoutTable.tickets.length === 1 ? 'ticket' : 'tickets'} on this tab</p>
              </div>

              <div className="space-y-3">
                <Button className="w-full py-6 text-lg" disabled={saving} onClick={() => handleSettleTab('cash')}>
                  <Receipt className="w-5 h-5 mr-2" aria-hidden="true" /> Send bill to front desk
                </Button>
                <Button variant="ghost" className="w-full mt-2" onClick={() => setCheckoutTable(null)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Overlay */}
      <AnimatePresence>
        {toast && (
          <motion.div role={toast.type === 'error' ? 'alert' : 'status'} initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }}
            className={`fixed top-[env(safe-area-inset-top)] left-4 right-4 md:left-auto md:right-8 z-[200] p-4 rounded-xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-sage text-white' : 'bg-terra text-white'}`}>
            <span className="font-medium text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
