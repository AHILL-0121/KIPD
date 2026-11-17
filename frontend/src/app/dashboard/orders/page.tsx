'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLive } from '@/lib/use-live';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Clock, MapPin, Plus, Minus, X, ShoppingCart, Receipt, Package, Users, Check, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { orderStatus } from '@/lib/order-status';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog } from '@/components/ui/dialog';
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
  type: 'dine_in' | 'room_service' | 'take_away';
  tableId?: string;
  roomId?: string;
  table?: { tableNumber: string };
  status: 'new' | 'acknowledged' | 'preparing' | 'ready' | 'served' | 'closed' | 'cancelled';
  totalAmount: string;
  specialInstructions?: string;
  /** 'guest' when the guest ordered from the QR menu themselves */
  source?: 'staff' | 'guest';
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
  section?: string | null;
  tags?: string[] | null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tableOptions, setTableOptions] = useState<TableOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [activeSection, setActiveSection] = useState<'tables' | 'takeaway' | 'all'>('tables');
  const hasInitializedSection = useRef(false);

  // Table Floor Plan Filter & Detail States
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'available' | 'occupied'>('all');
  const [tableSectionFilter, setTableSectionFilter] = useState<string>('all');
  const [tableCapacityFilter, setTableCapacityFilter] = useState<string>('all');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [viewingTableId, setViewingTableId] = useState<string | null>(null);

  // Modal State
  const [showCreate, setShowCreate] = useState(false);
  const [orderMode, setOrderMode] = useState<'dine_in' | 'take_away'>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategory, setMenuCategory] = useState('all');
  // Category chips follow the order the categories were created in (same as the Menu page),
  // and only list categories that have something orderable.
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const inMenu = new Set(menuItems.map(i => i.category?.name).filter((n): n is string => !!n));
  const menuCategoryNames = [
    ...categoryOrder.filter(n => inMenu.has(n)),
    ...Array.from(inMenu).filter(n => !categoryOrder.includes(n)),
  ];
  const [saving, setSaving] = useState(false);

  // Billing Modal State
  const [checkoutTable, setCheckoutTable] = useState<{ table: TableOption; total: number; tickets: Order[] } | null>(null);
  const [checkoutTakeaway, setCheckoutTakeaway] = useState<Order | null>(null);

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

  const fetchCategoryOrder = () => {
    fetch('/api/menu-categories')
      .then(res => res.json())
      .then(data => setCategoryOrder(Array.isArray(data) ? data.map((c: { name: string }) => c.name) : []))
      .catch(console.error);
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
    fetchCategoryOrder();
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

  // If there are open takeaways and NO open tables on initial load, default to the Takeaway view
  useEffect(() => {
    if (!hasInitializedSection.current && orders.length > 0) {
      const hasTables = orders.some(o => o.tableId && !['closed', 'cancelled'].includes(o.status));
      const hasTakeaway = orders.some(o => o.type === 'take_away' && !['closed', 'cancelled'].includes(o.status));
      if (!hasTables && hasTakeaway) {
        setActiveSection('takeaway');
      }
      hasInitializedSection.current = true;
    }
  }, [orders]);

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

      const table = tableOptions.find(t => t.id === o.tableId) || (o.table ? { id: o.tableId, tableNumber: o.table.tableNumber, capacity: 4 } : undefined);
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

  // Active take-away orders (not tied to a table)
  const activeTakeAways = orders.filter(
    o => o.type === 'take_away' && !['closed', 'cancelled'].includes(o.status),
  );

  // Free tables to start a new tab
  const getFreeTables = () => {
    const activeTableIds = activeTabs.map(t => t.table.id);
    return tableOptions.filter(t => !activeTableIds.includes(t.id));
  };

  // When seating a new table, ONLY free tables are available.
  // When adding more items to an existing tab, that tab's table is kept.
  const selectableTables = selectedTableId
    ? tableOptions.filter(t => t.id === selectedTableId || !activeTabs.some(tab => tab.table.id === t.id))
    : getFreeTables();

  // Dynamic sections from registered tables
  const availableSections = Array.from(
    new Set(tableOptions.map(t => t.section).filter((s): s is string => Boolean(s?.trim())))
  );

  const occupiedCount = activeTabs.length;
  const availableCount = Math.max(0, tableOptions.length - occupiedCount);

  // Filtered tables for the floor plan grid
  const filteredFloorTables = tableOptions.filter((t) => {
    const isOccupied = activeTabs.some((tab) => tab.table.id === t.id);

    // Status filter
    if (tableStatusFilter === 'available' && isOccupied) return false;
    if (tableStatusFilter === 'occupied' && !isOccupied) return false;

    // Section filter
    if (tableSectionFilter !== 'all' && t.section !== tableSectionFilter) return false;

    // Capacity filter
    if (tableCapacityFilter === '2' && t.capacity !== 2) return false;
    if (tableCapacityFilter === '4' && t.capacity !== 4) return false;
    if (tableCapacityFilter === '6+' && t.capacity < 6) return false;

    // Search filter
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      const numMatch = t.tableNumber.toLowerCase().includes(q);
      const secMatch = t.section?.toLowerCase().includes(q) ?? false;
      const tagMatch = t.tags?.some(tag => tag.toLowerCase().includes(q)) ?? false;
      if (!numMatch && !secMatch && !tagMatch) return false;
    }

    return true;
  });

  const viewingTab = viewingTableId ? activeTabs.find(t => t.table.id === viewingTableId) || null : null;

  const openNewOrder = (tableId: string = '') => {
    setSelectedTableId(tableId);
    setOrderMode('dine_in');
    setCustomerName('');
    setCart([]);
    setSpecialInstructions('');
    setMenuSearch('');
    setMenuCategory('all');
    setShowCreate(true);
  };

  const openNewTakeaway = () => {
    setOrderMode('take_away');
    setSelectedTableId('');
    setCustomerName('');
    setCart([]);
    setSpecialInstructions('');
    setMenuSearch('');
    setMenuCategory('all');
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
    if (orderMode === 'dine_in' && !selectedTableId) {
      showToast('Select a table', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type: orderMode,
        items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, notes: c.notes || undefined })),
        specialInstructions: specialInstructions || undefined,
      };
      if (orderMode === 'dine_in') {
        payload.tableId = selectedTableId;
      } else {
        // take_away: pass optional customer name so it appears in special instructions on the KDS
        if (customerName.trim()) payload.customerName = customerName.trim();
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      setShowCreate(false);
      setCart([]);
      setSelectedTableId('');
      setCustomerName('');
      fetchOrders();
      setActiveSection(orderMode === 'take_away' ? 'takeaway' : 'tables');
      showToast(orderMode === 'take_away' ? 'Take-away order sent to kitchen' : 'Sent to the kitchen', 'success');
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

  const handleSettleTakeaway = async (paymentMethod: 'cash' | 'upi' = 'cash') => {
    if (!checkoutTakeaway) return;
    setSaving(true);
    try {
      const res = await fetch('/api/orders/settle-tab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: checkoutTakeaway.id,
          paymentMethod,
        }),
      });
      if (!res.ok) throw new Error('Failed to settle');

      setCheckoutTakeaway(null);
      fetchOrders();
      showToast('Take-away bill sent to billing', 'success');
    } catch {
      showToast('Could not create bill. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pr-2">
        <div>
          <h1 className="section-title">Active orders</h1>
          <p className="section-sub">
            {activeSection === 'takeaway'
              ? 'Quick counter and takeaway orders. No table assignment needed.'
              : activeSection === 'tables'
                ? 'Running table sessions. Add items, send to the kitchen, and send the bill to the front desk.'
                : 'Running table tabs and takeaway orders.'}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" className="bg-stone-100 hover:bg-stone-200" onClick={openNewTakeaway}>
            <Package className="w-4 h-4" />
            New take-away
          </Button>
          <Button onClick={() => openNewOrder()}>
            <Plus className="w-4 h-4" />
            Seat new table
          </Button>
        </div>
      </div>

      {/* Section Switcher Tabs */}
      <div role="tablist" aria-label="Order sections" className="inline-flex gap-1 p-1 rounded-xl bg-stone-100 mb-8 self-start flex-wrap">
        <button
          role="tab"
          aria-selected={activeSection === 'tables'}
          onClick={() => setActiveSection('tables')}
          className={`h-10 px-4 rounded-lg inline-flex items-center gap-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
            activeSection === 'tables' ? 'bg-white text-ink font-bold shadow-sm' : 'text-ink-soft font-medium hover:text-ink'
          }`}
        >
          <MapPin className="w-4 h-4 text-amber-deep" aria-hidden="true" />
          <span>Table tabs</span>
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${activeSection === 'tables' ? 'bg-amber-pale text-amber-deep' : 'bg-stone-200 text-ink-muted'}`}>
            {activeTabs.length}
          </span>
        </button>

        <button
          role="tab"
          aria-selected={activeSection === 'takeaway'}
          onClick={() => setActiveSection('takeaway')}
          className={`h-10 px-4 rounded-lg inline-flex items-center gap-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
            activeSection === 'takeaway' ? 'bg-white text-ink font-bold shadow-sm' : 'text-ink-soft font-medium hover:text-ink'
          }`}
        >
          <Package className="w-4 h-4 text-amber-deep" aria-hidden="true" />
          <span>Takeaways</span>
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${activeSection === 'takeaway' ? 'bg-amber-pale text-amber-deep' : 'bg-stone-200 text-ink-muted'}`}>
            {activeTakeAways.length}
          </span>
        </button>

        <button
          role="tab"
          aria-selected={activeSection === 'all'}
          onClick={() => setActiveSection('all')}
          className={`h-10 px-4 rounded-lg inline-flex items-center gap-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
            activeSection === 'all' ? 'bg-white text-ink font-bold shadow-sm' : 'text-ink-soft font-medium hover:text-ink'
          }`}
        >
          <span>All orders</span>
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${activeSection === 'all' ? 'bg-amber-pale text-amber-deep' : 'bg-stone-200 text-ink-muted'}`}>
            {activeTabs.length + activeTakeAways.length}
          </span>
        </button>
      </div>

      {stale && (
        <p role="status" className="mb-6 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">
          Couldn&apos;t refresh just now. What you see may be a little out of date, and we&apos;ll keep trying.
        </p>
      )}

      {/* --- TABLE TABS VIEW (FLOOR PLAN) --- */}
      {activeSection === 'tables' && (
        <div className="space-y-6">
          {/* Floor Plan Filter Bar */}
          <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200">
            {/* Top row: Search input & Status quick filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search table #, section, or tag..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-stone-200 rounded-xl text-ink placeholder:text-ink-muted focus:outline-none focus:border-amber"
                />
                {tableSearch && (
                  <button
                    onClick={() => setTableSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Pills */}
              <div role="tablist" aria-label="Table status filter" className="flex items-center gap-1.5 p-1 bg-stone-200/60 rounded-xl overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setTableStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    tableStatusFilter === 'all'
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  All ({tableOptions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTableStatusFilter('available')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    tableStatusFilter === 'available'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Available ({availableCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTableStatusFilter('occupied')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    tableStatusFilter === 'occupied'
                      ? 'bg-white text-amber-deep shadow-sm'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber" />
                  Occupied ({occupiedCount})
                </button>
              </div>
            </div>

            {/* Bottom row: Section and Capacity filter chips */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-200/60 text-xs">
              <span className="font-semibold text-ink-muted mr-1">Filter by:</span>

              {/* Section chips */}
              {availableSections.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTableSectionFilter('all')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      tableSectionFilter === 'all'
                        ? 'bg-ink text-white font-semibold'
                        : 'bg-white text-ink-soft border border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    All sections
                  </button>
                  {availableSections.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setTableSectionFilter(sec === tableSectionFilter ? 'all' : sec)}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        tableSectionFilter === sec
                          ? 'bg-amber text-white font-semibold'
                          : 'bg-white text-ink-soft border border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              )}

              {/* Capacity chips */}
              <div className="flex items-center gap-1.5 ml-auto">
                {['all', '2', '4', '6+'].map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => setTableCapacityFilter(cap)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      tableCapacityFilter === cap
                        ? 'bg-ink text-white font-semibold'
                        : 'bg-white text-ink-soft border border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {cap === 'all' ? 'Any size' : cap === '6+' ? '6+ seats' : `${cap} seats`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table Cards Floor Grid */}
          {tableOptions.length === 0 ? (
            <EmptyState
              title="No tables configured"
              description="Add tables in the Restaurant menu page to track live dining tabs."
              actionLabel="Go to restaurant settings"
              action="/dashboard/restaurant"
            />
          ) : filteredFloorTables.length === 0 ? (
            <EmptyState
              title="No matching tables"
              description="Try clearing your search or changing the filter options."
              actionLabel="Reset filters"
              onAction={() => {
                setTableStatusFilter('all');
                setTableSectionFilter('all');
                setTableCapacityFilter('all');
                setTableSearch('');
              }}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {filteredFloorTables.map((table) => {
                const tab = activeTabs.find((t) => t.table.id === table.id);
                const isOccupied = Boolean(tab);

                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => {
                      if (isOccupied && tab) {
                        const el = document.getElementById(`table-tab-${table.id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } else {
                          setViewingTableId(table.id);
                        }
                      } else {
                        openNewOrder(table.id);
                      }
                    }}
                    className={`group flex flex-col justify-between text-left min-h-[142px] p-4 bg-white border rounded-xl shadow-sm transition-all hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      isOccupied
                        ? 'border-amber/50 hover:border-amber focus-visible:outline-amber bg-amber-pale/10'
                        : 'border-stone-200 hover:border-emerald-600 focus-visible:outline-emerald-500'
                    }`}
                  >
                    {/* Header: Table Number & Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[1.375rem] font-bold leading-tight text-ink group-hover:text-amber-deep transition-colors">
                          Table {table.tableNumber}
                        </span>
                        {table.section && (
                          <span className="text-xs font-semibold text-ink-muted mt-0.5">
                            {table.section}
                          </span>
                        )}
                      </div>
                      <Badge variant={isOccupied ? 'amber' : 'sage'} dot>
                        {isOccupied ? 'Occupied' : 'Available'}
                      </Badge>
                    </div>

                    {/* Middle: Capacity & Tags */}
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <Users className="w-3.5 h-3.5 text-ink-soft shrink-0" aria-hidden="true" />
                        <span>Seats {table.capacity}</span>
                      </div>

                      {table.tags && table.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {table.tags.slice(0, 3).map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-ink-soft font-medium leading-none"
                            >
                              {tag}
                            </span>
                          ))}
                          {table.tags.length > 3 && (
                            <span className="text-[10px] px-1 rounded bg-stone-100 text-ink-muted font-medium leading-none">
                              +{table.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer / Status Note */}
                    <div className="mt-3 pt-2.5 border-t border-dashed border-stone-200 flex items-center justify-between text-xs">
                      {isOccupied && tab ? (
                        <>
                          <span className="font-semibold text-ink">
                            {tab.tickets.length} {tab.tickets.length === 1 ? 'ticket' : 'tickets'}
                          </span>
                          <span className="font-bold text-amber-deep">
                            {formatCurrency(tab.total)}
                          </span>
                        </>
                      ) : (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Ready to seat
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Active Table Tabs (Running Sessions) */}
          {activeTabs.length > 0 && (
            <div className="pt-6 border-t border-stone-200/80 space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-amber-deep" aria-hidden="true" />
                <h3 className="text-lg font-bold text-ink">Active Table Tabs</h3>
                <span className="text-xs font-semibold bg-stone-200 text-ink-muted rounded-full px-2 py-0.5">
                  {activeTabs.length}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeTabs.map((tab) => (
                  <div key={tab.table.id} id={`table-tab-${tab.table.id}`}>
                    <Card hover={false}>
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

                    <div className="space-y-4 mb-4">
                      {tab.tickets.map((ticket, i) => (
                        <div key={ticket.id} className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                          <div className="flex items-center justify-between mb-3 border-b border-stone-200 pb-2">
                            <span className="text-sm font-semibold text-ink-soft">
                              Ticket {i + 1} <span className="font-normal text-ink-muted">· {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                              {ticket.source === 'guest' && <span className="font-normal text-amber-deep"> · Ordered by guest (QR)</span>}
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

                    <div className="flex gap-3 pt-4 border-t border-stone-200">
                      <Button variant="ghost" className="flex-1 bg-stone-100 hover:bg-stone-200" onClick={() => openNewOrder(tab.table.id)}>
                        <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Add more items
                      </Button>
                      <Button className="flex-1" onClick={() => setCheckoutTable(tab)}>
                        <Receipt className="w-4 h-4 mr-2" aria-hidden="true" /> Settle bill
                      </Button>
                    </div>
                  </Card>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- TAKEAWAYS VIEW --- */}
      {activeSection === 'takeaway' && (
        activeTakeAways.length === 0 ? (
          <EmptyState
            title="No active takeaway orders"
            description="There are no takeaway orders in progress right now."
            actionLabel="New take-away"
            onAction={openNewTakeaway}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeTakeAways.map((order, i) => (
              <Card key={order.id} hover={false}>
                <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div aria-hidden="true" className="h-10 w-10 rounded-full bg-amber-pale text-amber-deep flex items-center justify-center font-bold">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-ink">Take-away #{i + 1}</h3>
                      {order.specialInstructions && order.specialInstructions.startsWith('Customer:') && (
                        <p className="text-xs font-semibold text-amber-deep">{order.specialInstructions.split(' · ')[0]}</p>
                      )}
                      <p className="text-xs text-ink-muted">{formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={orderStatus(order.status).tone} dot>{orderStatus(order.status).label}</Badge>
                    <span className="font-bold text-ink">{formatCurrency(Number(order.totalAmount))}</span>
                  </div>
                </div>
                <div className="space-y-1 mb-4">
                  {(order.orderItems || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-ink">
                        <span className="font-semibold text-amber-deep mr-2">{item.quantity}×</span>
                        {item.menuItem?.name || 'Item'}
                      </span>
                      <span className="text-ink-muted">{formatCurrency(Number(item.price) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-3 border-t border-stone-200 mt-auto">
                  {order.status === 'ready' && (
                    <Button size="sm" variant="sage" className="flex-1" onClick={() => updateOrderStatus(order.id, 'served')}>
                      Mark handed over
                    </Button>
                  )}
                  <Button size="sm" className="flex-1" onClick={() => setCheckoutTakeaway(order)}>
                    <Receipt className="w-4 h-4 mr-1.5" aria-hidden="true" /> Settle bill
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* --- ALL ORDERS VIEW --- */}
      {activeSection === 'all' && (
        activeTabs.length === 0 && activeTakeAways.length === 0 ? (
          <EmptyState
            title="No active orders"
            description="Every table is free and there are no open takeaway orders."
            actionLabel="Seat new table"
            onAction={() => openNewOrder()}
          />
        ) : (
          <div className="space-y-10">
            {/* Takeaways in All View */}
            {activeTakeAways.length > 0 && (
              <section aria-label="Take-away orders">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-5 h-5 text-amber-deep" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-ink">Take-away orders</h2>
                  <span className="text-xs font-semibold bg-stone-200 text-ink-muted rounded-full px-2 py-0.5">
                    {activeTakeAways.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {activeTakeAways.map((order, i) => (
                    <Card key={order.id} hover={false}>
                      <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-3">
                        <div className="flex items-center gap-3">
                          <div aria-hidden="true" className="h-10 w-10 rounded-full bg-amber-pale text-amber-deep flex items-center justify-center font-bold">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-ink">Take-away #{i + 1}</h3>
                            {order.specialInstructions && order.specialInstructions.startsWith('Customer:') && (
                              <p className="text-xs font-semibold text-amber-deep">{order.specialInstructions.split(' · ')[0]}</p>
                            )}
                            <p className="text-xs text-ink-muted">{formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={orderStatus(order.status).tone} dot>{orderStatus(order.status).label}</Badge>
                          <span className="font-bold text-ink">{formatCurrency(Number(order.totalAmount))}</span>
                        </div>
                      </div>
                      <div className="space-y-1 mb-4">
                        {(order.orderItems || []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-ink">
                              <span className="font-semibold text-amber-deep mr-2">{item.quantity}×</span>
                              {item.menuItem?.name || 'Item'}
                            </span>
                            <span className="text-ink-muted">{formatCurrency(Number(item.price) * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-stone-200 mt-auto">
                        {order.status === 'ready' && (
                          <Button size="sm" variant="sage" className="flex-1" onClick={() => updateOrderStatus(order.id, 'served')}>
                            Mark handed over
                          </Button>
                        )}
                        <Button size="sm" className="flex-1" onClick={() => setCheckoutTakeaway(order)}>
                          <Receipt className="w-4 h-4 mr-1.5" aria-hidden="true" /> Settle bill
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Table Tabs in All View */}
            {activeTabs.length > 0 && (
              <section aria-label="Table tabs">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-amber-deep" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-ink">Table tabs</h2>
                  <span className="text-xs font-semibold bg-stone-200 text-ink-muted rounded-full px-2 py-0.5">
                    {activeTabs.length}
                  </span>
                </div>
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

                      <div className="space-y-4 mb-4">
                        {tab.tickets.map((ticket, i) => (
                          <div key={ticket.id} className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                            <div className="flex items-center justify-between mb-3 border-b border-stone-200 pb-2">
                              <span className="text-sm font-semibold text-ink-soft">
                                Ticket {i + 1} <span className="font-normal text-ink-muted">· {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                                {ticket.source === 'guest' && <span className="font-normal text-amber-deep"> · Ordered by guest (QR)</span>}
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
              </section>
            )}
          </div>
        )
      )}

      {/* Fire Ticket (Create Order) Sheet/Modal */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} labelledBy="send-title" variant="sheet" dismissible={!saving}
        className="p-6 md:p-8 w-full max-w-2xl h-[90vh] md:h-auto md:max-h-[85vh] flex flex-col">

              <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                  <h2 id="send-title" className="text-2xl font-bold text-ink">
                    Send to kitchen
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {orderMode === 'take_away'
                      ? 'Take-away order — no table needed.'
                      : selectedTableId && activeTabs.some(t => t.table.id === selectedTableId)
                        ? `Add items to Table ${tableOptions.find(t => t.id === selectedTableId)?.tableNumber ?? ''}'s running tab.`
                        : 'Select an available table to open a new tab.'}
                  </p>
                </div>
                <button onClick={() => setShowCreate(false)} aria-label="Close" className="bg-stone-100 p-2 rounded-full hover:bg-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><X className="w-5 h-5" aria-hidden="true" /></button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-6 px-1 -mx-1 pb-20 md:pb-1">

                {/* Order Type Toggle */}
                <div className="bg-stone-50 p-1 rounded-xl border border-stone-200 flex gap-1" role="group" aria-label="Order type">
                  <button
                    onClick={() => setOrderMode('dine_in')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${orderMode === 'dine_in' ? 'bg-white shadow text-ink' : 'text-ink-muted hover:text-ink'}`}
                  >
                    <MapPin className="w-4 h-4" aria-hidden="true" /> Dine-in
                  </button>
                  <button
                    onClick={() => { setOrderMode('take_away'); setSelectedTableId(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${orderMode === 'take_away' ? 'bg-white shadow text-ink' : 'text-ink-muted hover:text-ink'}`}
                  >
                    <Package className="w-4 h-4" aria-hidden="true" /> Take-away
                  </button>
                </div>

                {/* Table Assignment — only for dine-in */}
                {orderMode === 'dine_in' && (
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                    <label className="block text-sm font-semibold text-ink mb-2">Table</label>
                    <Select
                      value={selectedTableId}
                      onChange={(e) => setSelectedTableId(e.target.value)}
                      disabled={Boolean(selectedTableId && activeTabs.some(t => t.table.id === selectedTableId))}
                      options={[
                        {
                          value: '',
                          label: selectableTables.length === 0 ? 'No free tables available' : 'Choose a table',
                        },
                        ...selectableTables.map(t => ({
                          value: t.id,
                          label: t.id === selectedTableId && activeTabs.some(tab => tab.table.id === t.id)
                            ? `Table ${t.tableNumber} (Active tab)`
                            : `Table ${t.tableNumber}`,
                        })),
                      ]}
                    />
                    {selectableTables.length === 0 && !selectedTableId && (
                      <p className="text-xs text-terra mt-2 font-medium">All tables currently have open tabs. Settle an existing tab first.</p>
                    )}
                    {selectedTableId && !activeTabs.find(t => t.table.id === selectedTableId) && (
                      <p className="text-xs text-amber mt-2 font-medium">A new tab will open for Table {tableOptions.find(t => t.id === selectedTableId)?.tableNumber}.</p>
                    )}
                  </div>
                )}

                {/* Customer name — only for take-away */}
                {orderMode === 'take_away' && (
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                    <Input
                      label="Customer name (optional)"
                      placeholder="e.g. Ravi, +91 98765…"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <p className="text-xs text-ink-muted mt-2">Shown on the kitchen display so the team knows whose order it is.</p>
                  </div>
                )}

                {/* Point of Sale Item Picker */}
                <div>
                  <Input placeholder="Search menu..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="mb-3" />
                  {menuCategoryNames.length > 1 && (
                    <div role="tablist" aria-label="Menu categories" className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
                      {['all', ...menuCategoryNames].map(name => {
                        const active = menuCategory === name;
                        return (
                          <button
                            key={name}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setMenuCategory(name)}
                            className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-full border text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${
                              active ? 'bg-amber text-white border-amber' : 'bg-white text-ink-soft border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {name === 'all' ? 'All' : name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="max-h-64 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-2 border border-stone-200 rounded-xl p-3 bg-stone-50/50">
                    {menuItems.filter(i => (menuCategory === 'all' || i.category?.name === menuCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map(item => {
                      const inCart = cart.find(c => c.menuItemId === item.id);
                      return (
                        <div key={item.id} className="aspect-square flex flex-col justify-between p-2 rounded-lg bg-white border border-stone-200 shadow-sm">
                          <div className="min-w-0">
                            <span className="font-semibold text-ink text-sm leading-tight block line-clamp-2">{item.name}</span>
                            <span className="text-xs text-ink-muted">{formatCurrency(Number(item.price))}</span>
                          </div>
                          {inCart ? (
                            <div className="flex items-center justify-between bg-stone-100 rounded-lg p-1">
                              <button onClick={() => removeFromCart(item.id)} aria-label={`Remove one ${item.name}`} className="p-1 rounded bg-white shadow-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><Minus className="w-3.5 h-3.5" aria-hidden="true" /></button>
                              <span className="font-bold text-sm text-center" aria-live="polite">{inCart.quantity}</span>
                              <button onClick={() => addToCart(item)} aria-label={`Add one more ${item.name}`} className="p-1 rounded bg-amber shadow-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"><Plus className="w-3.5 h-3.5" aria-hidden="true" /></button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => addToCart(item)} className="font-bold w-full">
                              <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Add<span className="sr-only"> {item.name}</span>
                            </Button>
                          )}
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
                <Button className="w-full text-lg py-6" onClick={handleFireTicket} disabled={saving || cart.length === 0 || (orderMode === 'dine_in' && !selectedTableId)}>
                  {saving ? 'Sending…' : `Send to kitchen (${formatCurrency(cartTotal)})`}
                </Button>
              </div>

      </Dialog>

      {/* Checkout / Settle Table Modal */}
      <Dialog open={!!checkoutTable} onClose={() => setCheckoutTable(null)} labelledBy="settle-title" dismissible={!saving} className="p-8 max-w-md w-full">
        {checkoutTable && (
          <>
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
          </>
        )}
      </Dialog>

      {/* Checkout / Settle Takeaway Modal */}
      <Dialog open={!!checkoutTakeaway} onClose={() => setCheckoutTakeaway(null)} labelledBy="settle-takeaway-title" dismissible={!saving} className="p-8 max-w-md w-full">
        {checkoutTakeaway && (
          <>
            <div className="text-center mb-6">
              <div aria-hidden="true" className="h-16 w-16 bg-amber-pale text-amber-deep rounded-full flex items-center justify-center font-bold text-3xl mx-auto mb-3">
                <Package className="w-8 h-8" />
              </div>
              <h2 id="settle-takeaway-title" className="text-2xl font-bold text-ink">Settle Take-away</h2>
              {checkoutTakeaway.specialInstructions && checkoutTakeaway.specialInstructions.startsWith('Customer:') && (
                <p className="text-sm font-semibold text-amber-deep mt-1">{checkoutTakeaway.specialInstructions.split(' · ')[0]}</p>
              )}
              <p className="text-2xl font-bold text-ink mt-3">{formatCurrency(Number(checkoutTakeaway.totalAmount))}</p>
              <p className="text-sm text-ink-muted mt-1">{checkoutTakeaway.orderItems?.length ?? 0} item{checkoutTakeaway.orderItems?.length === 1 ? '' : 's'} on this order</p>
            </div>

            <div className="space-y-3">
              <Button className="w-full py-6 text-lg" disabled={saving} onClick={() => handleSettleTakeaway('cash')}>
                <Receipt className="w-5 h-5 mr-2" aria-hidden="true" /> Send bill to billing
              </Button>
              <Button variant="ghost" className="w-full mt-2" onClick={() => setCheckoutTakeaway(null)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Dialog>

      {/* Table Tab Detail Drawer */}
      <Dialog
        open={Boolean(viewingTableId && viewingTab)}
        onClose={() => setViewingTableId(null)}
        labelledBy="table-tab-detail-title"
        variant="drawer"
      >
        {viewingTab && (
          <div className="flex flex-col h-full">
            <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-stone-200">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="table-tab-detail-title" className="text-2xl font-bold text-ink">
                    Table {viewingTab.table.tableNumber}
                  </h2>
                  <Badge variant="amber" dot>Occupied</Badge>
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-ink-muted">
                  {viewingTab.table.section && <span>{viewingTab.table.section} · </span>}
                  <span>Seats {viewingTab.table.capacity}</span>
                  <span>· {viewingTab.tickets.length} {viewingTab.tickets.length === 1 ? 'ticket' : 'tickets'} sent</span>
                </div>
              </div>
              <button
                onClick={() => setViewingTableId(null)}
                aria-label="Close"
                className="p-2 rounded-lg text-ink-muted hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Tab Summary Card */}
              <div className="flex items-center justify-between p-4 bg-amber-pale/40 border border-amber/30 rounded-xl">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-amber-deep">Running Tab Total</span>
                  <div className="text-2xl font-bold text-ink mt-0.5">{formatCurrency(viewingTab.total)}</div>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <span>{viewingTab.tickets.reduce((acc, tk) => acc + (tk.orderItems?.length || 0), 0)} items in total</span>
                </div>
              </div>

              {/* Tickets list */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Tickets Sent to Kitchen</h3>
                {viewingTab.tickets.map((ticket, i) => (
                  <div key={ticket.id} className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                    <div className="flex items-center justify-between mb-3 border-b border-stone-200 pb-2">
                      <span className="text-sm font-semibold text-ink-soft">
                        Ticket {i + 1} <span className="font-normal text-ink-muted">· {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                        {ticket.source === 'guest' && <span className="font-normal text-amber-deep"> · Ordered by guest (QR)</span>}
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
                    {ticket.specialInstructions && (
                      <p className="mt-2 text-xs italic text-ink-muted bg-stone-100 p-2 rounded">
                        Note: {ticket.specialInstructions}
                      </p>
                    )}
                    {ticket.status === 'ready' && (
                      <Button size="sm" variant="sage" className="w-full mt-3" onClick={() => updateOrderStatus(ticket.id, 'served')}>
                        Mark as served
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="p-4 border-t border-stone-200 bg-white flex gap-3">
              <Button
                variant="ghost"
                className="flex-1 bg-stone-100 hover:bg-stone-200"
                onClick={() => {
                  const tableId = viewingTab.table.id;
                  setViewingTableId(null);
                  openNewOrder(tableId);
                }}
              >
                <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Add more items
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  const tabToCheckout = viewingTab;
                  setViewingTableId(null);
                  setCheckoutTable(tabToCheckout);
                }}
              >
                <Receipt className="w-4 h-4 mr-2" aria-hidden="true" /> Settle bill
              </Button>
            </div>
          </div>
        )}
      </Dialog>

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
