'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Clock, MapPin, Plus, Minus, X, ShoppingCart, Receipt } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
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
  status: 'new' | 'acknowledged' | 'preparing' | 'ready' | 'served' | 'cancelled';
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
    setTimeout(() => setToast(null), 3000);
  };

  const fetchOrders = () => {
    fetch('/api/orders', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .then(res => res.json())
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

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

    // Establish Real-Time WebSocket link with Kitchen!
    let eventSource: EventSource | null = null;
    let isMounted = true;

    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!isMounted) return; // Prevent zombie sockets if unmounted before HTTP request finishes

        if (data?.id) {
          eventSource = new EventSource(`/api/sse/kds/${data.id}`);
          eventSource.onmessage = (event) => {
            const ticket = JSON.parse(event.data);
            if (ticket.type !== 'connected') {
              fetchOrders(); // Kitchen did something! Sync instantly!
            }
          };
        }
      });

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o));
      showToast(`Ticket updated to ${newStatus}`, 'success');
    } catch {
      showToast('Failed to update ticket', 'error');
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
      showToast('KDS Ticket Fired!', 'success');
    } catch {
      showToast('Failed to fire ticket', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSettleTab = async (paymentMethod: 'cash' | 'upi') => {
    if (!checkoutTable) return;

    if (paymentMethod === 'upi') {
      showToast('Waiting for Android UPI Plugin detection...', 'error');
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
      showToast(`Table ${checkoutTable.table.tableNumber} Bill Sent to Front Desk!`, 'success');
    } catch {
      showToast('Failed to settle tab.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pr-2">
        <div>
          <h1 className="section-title">Active Tabs</h1>
          <p className="section-sub">Manage running table sessions and fire tickets to kitchen.</p>
        </div>

        <Button onClick={() => openNewOrder()}>
          <Plus className="w-4 h-4" />
          Seat New Table
        </Button>
      </div>

      {activeTabs.length === 0 ? (
        <EmptyState
          title="No Active Tables"
          description="All tables are empty. Seat a new guest to open a tab."
          actionLabel="Seat New Guest"
          onAction={() => openNewOrder()}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {activeTabs.map((tab) => (
            <Card key={tab.table.id} hover={false} className="border-2 border-stone-200">
              <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-amber-pale text-amber flex items-center justify-center font-bold text-xl">
                    {tab.table.tableNumber}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold font-serif text-ink">Table Tab Opened</h2>
                    <p className="text-sm text-ink-muted">{tab.tickets.length} Ticket(s) Fired to KDS</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-ink-muted uppercase tracking-wider">Tab Total</div>
                  <div className="text-2xl font-bold text-terra">{formatCurrency(tab.total)}</div>
                </div>
              </div>

              {/* Tickets Section within Tab */}
              <div className="space-y-4 mb-4">
                {tab.tickets.map((ticket, i) => (
                  <div key={ticket.id} className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                    <div className="flex items-center justify-between mb-3 border-b border-stone-200 pb-2">
                      <span className="font-mono text-sm font-semibold text-stone-500">
                        Ticket #{i + 1} ({formatDistanceToNow(new Date(ticket.createdAt))} ago)
                      </span>
                      <Badge variant={ticket.status === 'new' ? 'amber' : ticket.status === 'preparing' ? 'terra' : 'sage'} dot>
                        {ticket.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {(ticket.orderItems || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-ink">
                            <span className="font-semibold text-amber mr-2">{item.quantity}x</span>
                            {item.menuItem?.name || 'Item'}
                          </span>
                          <span className="text-stone-500">{formatCurrency(Number(item.price) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {ticket.status === 'ready' && (
                      <Button size="sm" variant="sage" className="w-full mt-3" onClick={() => updateOrderStatus(ticket.id, 'served')}>
                        Mark Sent to Table
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Tab Action Footer */}
              <div className="flex gap-3 pt-4 border-t border-stone-200">
                <Button variant="ghost" className="flex-1 bg-stone-100 hover:bg-stone-200" onClick={() => openNewOrder(tab.table.id)}>
                  <Plus className="w-4 h-4 mr-2" /> Fire More Items
                </Button>
                <Button variant="terra" className="flex-1" onClick={() => setCheckoutTable(tab)}>
                  <Receipt className="w-4 h-4 mr-2" /> Settle Bill
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
              className="bg-white rounded-t-3xl md:rounded-2xl p-6 md:p-8 w-full max-w-2xl h-[90vh] md:h-auto md:max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

              <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                  <h2 className="font-serif text-2xl font-bold">Fire Ticket to KDS</h2>
                  <p className="text-sm text-ink-muted">Add items to a table's running tab.</p>
                </div>
                <button onClick={() => setShowCreate(false)} className="bg-stone-100 p-2 rounded-full hover:bg-stone-200"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pb-20 md:pb-0">
                {/* Table Assignment Component */}
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <label className="block text-sm font-semibold text-ink mb-2">Select Table for this Ticket</label>
                  <Select
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    options={[
                      { value: '', label: 'Select a Table...' },
                      ...tableOptions.map(t => ({ value: t.id, label: `Table ${t.tableNumber}` }))
                    ]}
                  />
                  {selectedTableId && !activeTabs.find(t => t.table.id === selectedTableId) && (
                    <p className="text-xs text-amber mt-2 font-medium">New Tab will be opened for Table {tableOptions.find(t => t.id === selectedTableId)?.tableNumber}.</p>
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
                            <span className="font-bold text-ink block">{item.name}</span>
                            <span className="text-sm font-mono text-ink-muted">{formatCurrency(Number(item.price))}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {inCart ? (
                              <div className="flex items-center bg-stone-100 rounded-lg p-1">
                                <button onClick={() => removeFromCart(item.id)} className="p-2 rounded bg-white shadow-sm text-terra"><Minus className="w-4 h-4" /></button>
                                <span className="font-bold text-lg w-10 text-center">{inCart.quantity}</span>
                                <button onClick={() => addToCart(item)} className="p-2 rounded bg-amber shadow-sm text-white"><Plus className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => addToCart(item)} className="font-bold">
                                <Plus className="w-4 h-4 mr-1" /> Add
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
                  <div className="bg-amber-pale p-4 rounded-xl border border-amber">
                    <div className="font-bold text-amber mb-3 flex items-center"><ShoppingCart className="w-4 h-4 mr-2" /> Ticket Queue</div>
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

                <Input label="Kitchen Notes (Optional)" placeholder="e.g. Extra spicy..." value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} />
              </div>

              {/* Action Sheet Footer */}
              <div className="pt-4 border-t border-stone-200 mt-auto shrink-0 bg-white md:bg-transparent pb-safe md:pb-0">
                <Button className="w-full text-lg py-6" variant="terra" onClick={handleFireTicket} disabled={saving || cart.length === 0 || !selectedTableId}>
                  {saving ? 'Firing Ticket...' : `FIRE TO KITCHEN (${formatCurrency(cartTotal)})`}
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
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-6">
                <div className="h-16 w-16 bg-amber-pale text-amber rounded-full flex items-center justify-center font-bold text-3xl mx-auto mb-3">
                  {checkoutTable.table.tableNumber}
                </div>
                <h2 className="font-serif text-2xl font-bold">Settle Table Tab</h2>
                <p className="text-lg text-ink font-bold mt-2">Grand Total: <span className="text-terra">{formatCurrency(checkoutTable.total)}</span></p>
                <p className="text-sm text-ink-muted">{checkoutTable.tickets.length} Ticket(s) Fired</p>
              </div>

              <div className="space-y-3">
                <Button className="w-full py-6 text-lg bg-terra hover:bg-terra-dark text-white" disabled={saving} onClick={() => handleSettleTab('cash')}>
                  <Receipt className="w-5 h-5 mr-2" /> Forward Bill to Front Desk
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
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }}
            className={`fixed top-[env(safe-area-inset-top)] left-4 right-4 md:left-auto md:right-8 z-[200] p-4 rounded-xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-sage text-white' : 'bg-terra text-white'}`}>
            <span className="font-medium text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
