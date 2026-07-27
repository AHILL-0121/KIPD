'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Clock, MapPin, Plus, Minus, X, ShoppingCart } from 'lucide-react';
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
  const [userRole, setUserRole] = useState<string>('owner');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Create order modal
  const [showCreate, setShowCreate] = useState(false);
  const [orderType, setOrderType] = useState<'dine_in' | 'room_service'>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchOrders = () => {
    fetch('/api/orders')
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
    // Fetch tables for order creation
    fetch('/api/tables')
      .then(res => res.json())
      .then(data => setTableOptions(Array.isArray(data) ? data : []))
      .catch(() => {});
    // Fetch user role
    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.role) setUserRole(data.role); })
      .catch(() => {});
    // Poll for updates every 30s
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusConfig: Record<string, { badge: string; label: string; action: string | null; nextStatus: string | null }> = {
    new: { badge: 'amber', label: 'New', action: 'Acknowledge', nextStatus: 'acknowledged' },
    acknowledged: { badge: 'terra', label: 'Acknowledged', action: 'Start Preparing', nextStatus: 'preparing' },
    preparing: { badge: 'terra', label: 'Preparing', action: 'Mark Ready', nextStatus: 'ready' },
    ready: { badge: 'sage', label: 'Ready', action: 'Mark Served', nextStatus: 'served' },
    served: { badge: 'stone', label: 'Served', action: null, nextStatus: null },
    cancelled: { badge: 'stone', label: 'Cancelled', action: null, nextStatus: null },
  };

  const filteredOrders = orders.filter(o => {
    if (filter === 'active') return ['new', 'acknowledged', 'preparing', 'ready'].includes(o.status);
    if (filter === 'completed') return ['served', 'cancelled'].includes(o.status);
    return true;
  });

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o));
      showToast(`Order updated to ${newStatus}`, 'success');
    } catch {
      showToast('Failed to update order', 'error');
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!confirm('Cancel this order?')) return;
    await updateOrderStatus(orderId, 'cancelled');
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

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      showToast('Add at least one item', 'error');
      return;
    }
    if (orderType === 'dine_in' && !selectedTableId) {
      showToast('Select a table for dine-in orders', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: orderType,
          tableId: orderType === 'dine_in' ? selectedTableId : undefined,
          items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, notes: c.notes || undefined })),
          specialInstructions: specialInstructions || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setShowCreate(false);
      setCart([]);
      setSpecialInstructions('');
      setSelectedTableId('');
      setRoomNumber('');
      fetchOrders();
      showToast('Order created', 'success');
    } catch {
      showToast('Failed to create order', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredMenu = menuItems.filter(item =>
    item.name.toLowerCase().includes(menuSearch.toLowerCase())
  );

  if (loading) return <LoadingState />;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Orders</h1>
          <p className="section-sub">Monitor and manage all incoming orders</p>
        </div>

        <Button onClick={() => {
          setCart([]);
          setSpecialInstructions('');
          setMenuSearch('');
          setOrderType('dine_in');
          setSelectedTableId('');
          setShowCreate(true);
        }}>
          <Plus className="w-4 h-4" />
          New Order
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <Button variant={filter === 'all' ? 'primary' : 'ghost'} onClick={() => setFilter('all')}>
          All Orders ({orders.length})
        </Button>
        <Button variant={filter === 'active' ? 'primary' : 'ghost'} onClick={() => setFilter('active')}>
          Active ({orders.filter(o => ['new', 'acknowledged', 'preparing', 'ready'].includes(o.status)).length})
        </Button>
        <Button variant={filter === 'completed' ? 'primary' : 'ghost'} onClick={() => setFilter('completed')}>
          Completed ({orders.filter(o => ['served', 'cancelled'].includes(o.status)).length})
        </Button>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          title={filter !== 'all' ? 'No Orders Found' : 'No Orders Yet'}
          description={filter !== 'all' ? 'Try a different filter.' : 'Create your first order to get started.'}
          actionLabel={filter === 'all' ? 'Create Order' : undefined}
          onAction={filter === 'all' ? () => setShowCreate(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOrders.map((order) => {
            const config = statusConfig[order.status];
            const minutesAgo = formatDistanceToNow(new Date(order.createdAt), { addSuffix: true });

            return (
              <Card key={order.id} hover={false} className="border-2">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-ink-muted" />
                      <span className="font-bold text-lg text-ink">
                        {order.type === 'dine_in'
                          ? `Table ${order.table?.tableNumber || '—'}`
                          : 'Room Service'
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      <Clock className="w-3 h-3" />
                      <span>{minutesAgo}</span>
                    </div>
                  </div>

                  <Badge variant={config.badge as 'amber' | 'terra' | 'sage' | 'stone'} dot>
                    {config.label}
                  </Badge>
                </div>

                {/* Order Items */}
                <div className="space-y-2 mb-4">
                  {(order.orderItems || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-ink">
                        <span className="font-medium">{item.quantity}x</span> {item.menuItem?.name || 'Item'}
                      </span>
                      {item.notes && (
                        <span className="text-xs text-amber italic">{item.notes}</span>
                      )}
                    </div>
                  ))}
                </div>

                {order.specialInstructions && (
                  <div className="bg-amber-pale p-3 rounded-lg mb-4 text-sm text-ink">
                    <span className="font-medium">Note:</span> {order.specialInstructions}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-stone-200">
                  <div className="font-bold text-lg text-ink">{formatCurrency(Number(order.totalAmount))}</div>

                  <div className="flex gap-2">
                    {config.action && config.nextStatus && (
                      <Button
                        size="sm"
                        variant="sage"
                        onClick={() => updateOrderStatus(order.id, config.nextStatus!)}
                      >
                        {config.action}
                      </Button>
                    )}
                    {['new', 'acknowledged'].includes(order.status) && (
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => cancelOrder(order.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Order Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">New Order</h2>
                <button onClick={() => setShowCreate(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>

              {/* Order Type */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button className={`p-4 rounded-xl border-2 text-center ${orderType === 'dine_in' ? 'border-amber bg-amber-pale' : 'border-stone-200'}`} onClick={() => setOrderType('dine_in')}>
                  <div className="font-semibold">🍽️ Dine In</div>
                </button>
                <button className={`p-4 rounded-xl border-2 text-center ${orderType === 'room_service' ? 'border-amber bg-amber-pale' : 'border-stone-200'}`} onClick={() => setOrderType('room_service')}>
                  <div className="font-semibold">🛎️ Room Service</div>
                </button>
              </div>

              {/* Table Selection for Dine In */}
              {orderType === 'dine_in' && (
                <div className="mb-6">
                  <Select
                    label="Select Table"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    options={[
                      { value: '', label: 'Choose a table...' },
                      ...tableOptions.map(t => ({ value: t.id, label: `Table ${t.tableNumber} (${t.capacity} seats)` }))
                    ]}
                  />
                  {tableOptions.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">No tables configured. Ask your manager to add tables in Restaurant settings.</p>
                  )}
                </div>
              )}

              {/* Menu Items */}
              <div className="mb-6">
                <Input placeholder="Search menu items..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="mb-3" />
                <div className="max-h-48 overflow-y-auto space-y-2 border border-stone-200 rounded-xl p-3">
                  {filteredMenu.length === 0 ? (
                    <p className="text-sm text-ink-muted text-center py-4">No menu items available</p>
                  ) : (
                    filteredMenu.map(item => {
                      const inCart = cart.find(c => c.menuItemId === item.id);
                      return (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-stone-50">
                          <div>
                            <span className="font-medium text-sm">{item.name}</span>
                            {item.category && <span className="text-xs text-ink-muted ml-2">{item.category.name}</span>}
                            <span className="text-sm text-amber ml-2">{formatCurrency(Number(item.price))}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {inCart ? (
                              <>
                                <button onClick={() => removeFromCart(item.id)} className="p-1 rounded bg-stone-100 hover:bg-stone-200"><Minus className="w-3 h-3" /></button>
                                <span className="text-sm font-semibold w-6 text-center">{inCart.quantity}</span>
                                <button onClick={() => addToCart(item)} className="p-1 rounded bg-amber text-white hover:bg-amber/90"><Plus className="w-3 h-3" /></button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => addToCart(item)}>
                                <Plus className="w-3 h-3" /> Add
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Cart */}
              {cart.length > 0 && (
                <div className="mb-6 p-4 bg-stone-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="w-4 h-4" />
                    <span className="font-semibold">Order Items ({cart.reduce((s, c) => s + c.quantity, 0)})</span>
                  </div>
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div key={item.menuItemId} className="flex items-center justify-between text-sm">
                        <span>{item.quantity}x {item.name}</span>
                        <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-stone-200 font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(cartTotal)}</span>
                    </div>
                  </div>
                </div>
              )}

              <Input label="Special Instructions" placeholder="Any special requests..." value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className="mb-4" />

              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
                <Button variant="terra" className="flex-1" onClick={handleCreateOrder} disabled={saving || cart.length === 0}>
                  {saving ? 'Placing...' : `Place Order (${formatCurrency(cartTotal)})`}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }}
            className={`fixed top-8 right-8 z-50 px-6 py-4 rounded-lg shadow-lg ${toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-900' : 'bg-red-50 border border-red-200 text-red-900'}`}>
            <span className="font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
