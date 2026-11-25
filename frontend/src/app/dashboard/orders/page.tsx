'use client';

import { useState, useEffect, useRef } from 'react';
import { useLive } from '@/lib/use-live';
import { playChime } from '@/lib/chime';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { MapPin, Plus, Package, UtensilsCrossed, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenantInfo } from '@/contexts/tenant-context';
import { useQuery } from '@/hooks/use-query';
import { orderStatus } from '@/lib/order-status';
import type { Order, MenuItem, CartItem, TableOption, TableTab } from '@/components/orders/types';
import { TableFloorCard } from '@/components/orders/table-floor-card';
import { TableTabCard } from '@/components/orders/table-tab-card';
import { TakeawayCard } from '@/components/orders/takeaway-card';
import { FloorFilterBar } from '@/components/orders/floor-filter-bar';
import { NewOrderSheet } from '@/components/orders/new-order-sheet';
import { SettleTableDialog, SettleTakeawayDialog } from '@/components/orders/settle-tab-dialog';
import { TableDetailDrawer } from '@/components/orders/table-detail-drawer';

export default function OrdersPage() {
  const { info } = useTenantInfo();
  const outlets = info?.outlets ?? [];
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');
  const outletQs = selectedOutletId !== 'all' ? `?outletId=${selectedOutletId}` : '';

  const { data: rawOrders, error: ordersError, isLoading: ordersLoading, refetch: refetchOrders } = useQuery<Order[]>(`/api/orders${outletQs}`, [selectedOutletId]);
  const { data: rawMenu } = useQuery<MenuItem[]>(`/api/menu${outletQs}`, [selectedOutletId]);
  const { data: rawTables } = useQuery<TableOption[]>(`/api/tables${outletQs}`, [selectedOutletId]);
  const { data: rawCategories } = useQuery<{ name: string }[]>(`/api/menu-categories${outletQs}`, [selectedOutletId]);

  const [orders, setOrders] = useState<Order[]>([]);
  const seenOrderIds = useRef<Set<string> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = soundOn;

  const toggleSound = async () => {
    if (soundOn) return setSoundOn(false);
    if (await playChime()) setSoundOn(true);
  };

  useEffect(() => {
    if (rawOrders) {
      const nextIds = new Set(rawOrders.map((o) => o.id));
      if (seenOrderIds.current && soundRef.current && rawOrders.some((o) => !seenOrderIds.current!.has(o.id))) {
        playChime();
      }
      seenOrderIds.current = nextIds;
      setOrders(rawOrders);
    }
  }, [rawOrders]);

  const menuItems = Array.isArray(rawMenu) ? rawMenu.filter((i: MenuItem) => i.isAvailable) : [];
  const tableOptions = Array.isArray(rawTables) ? rawTables : [];
  const categoryOrder = Array.isArray(rawCategories) ? rawCategories.map((c: { name: string }) => c.name) : [];

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
  const [saving, setSaving] = useState(false);

  // Billing Modal State
  const [checkoutTable, setCheckoutTable] = useState<TableTab | null>(null);
  const [checkoutTakeaway, setCheckoutTakeaway] = useState<Order | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const channel = selectedOutletId !== 'all' ? selectedOutletId : (info?.id || null);

  useLive(() => {
    refetchOrders();
  }, channel);

  // If there are open takeaways and NO open tables on initial load, default to Takeaway view
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
      refetchOrders();
    }
  };

  // Group active orders heavily by table
  const activeTabs: TableTab[] = (() => {
    const tabs: Record<string, TableTab> = {};

    orders.forEach(o => {
      if (['closed', 'cancelled'].includes(o.status)) return;
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
  })();

  const activeTakeAways = orders.filter(
    o => o.type === 'take_away' && !['closed', 'cancelled'].includes(o.status),
  );

  const getFreeTables = () => {
    const activeTableIds = activeTabs.map(t => t.table.id);
    return tableOptions.filter(t => !activeTableIds.includes(t.id));
  };

  const selectableTables = selectedTableId
    ? tableOptions.filter(t => t.id === selectedTableId || !activeTabs.some(tab => tab.table.id === t.id))
    : getFreeTables();

  const availableSections = Array.from(
    new Set(tableOptions.map(t => t.section).filter((s): s is string => Boolean(s?.trim())))
  );

  const occupiedCount = activeTabs.length;
  const availableCount = Math.max(0, tableOptions.length - occupiedCount);

  // Filtered tables for the floor plan grid
  const filteredFloorTables = tableOptions.filter((t) => {
    const isOccupied = activeTabs.some((tab) => tab.table.id === t.id);

    if (tableStatusFilter === 'available' && isOccupied) return false;
    if (tableStatusFilter === 'occupied' && !isOccupied) return false;
    if (tableSectionFilter !== 'all' && t.section !== tableSectionFilter) return false;
    if (tableCapacityFilter === '2' && t.capacity !== 2) return false;
    if (tableCapacityFilter === '4' && t.capacity !== 4) return false;
    if (tableCapacityFilter === '6+' && t.capacity < 6) return false;

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

  const inMenu = new Set(menuItems.map(i => i.category?.name).filter((n): n is string => !!n));
  const menuCategoryNames = [
    ...categoryOrder.filter(n => inMenu.has(n)),
    ...Array.from(inMenu).filter(n => !categoryOrder.includes(n)),
  ];

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
        if (selectedOutletId !== 'all') payload.outletId = selectedOutletId;
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
      refetchOrders();
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
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/orders/settle-tab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: checkoutTable.table.id,
          paymentMethod,
        }),
      });
      if (!res.ok) throw new Error('Failed to settle');

      setCheckoutTable(null);
      refetchOrders();
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
      refetchOrders();
      showToast('Take-away bill sent to billing', 'success');
    } catch {
      showToast('Could not create bill. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (ordersLoading && !rawOrders && !ordersError) return <LoadingState />;

  const stale = Boolean(ordersError);

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3 mb-4 pr-1">
        <div>
          <h1 className="section-title">Active orders</h1>
          <p className="section-sub hidden sm:block">
            {activeSection === 'takeaway'
              ? 'Quick counter and takeaway orders. No table assignment needed.'
              : activeSection === 'tables'
                ? 'Running table sessions. Add items, send to the kitchen, and send the bill to the front desk.'
                : 'Running table tabs and takeaway orders.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {outlets.length > 1 && (
            <select
              aria-label="Select outlet"
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-ink"
            >
              <option value="all">All Outlets</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <Button
            variant="ghost"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Mute order chime' : 'Enable order chime'}
            title={soundOn ? 'Sound alerts on' : 'Enable sound alerts'}
            className={`min-h-[44px] min-w-[44px] p-2.5 ${soundOn ? 'bg-amber-pale text-amber-deep' : 'bg-stone-100 hover:bg-stone-200 text-ink'}`}
          >
            {soundOn ? <Volume2 className="w-5 h-5" aria-hidden="true" /> : <VolumeX className="w-5 h-5" aria-hidden="true" />}
          </Button>
          <Button
            variant="ghost"
            className="bg-stone-100 hover:bg-stone-200 min-h-[44px] min-w-[44px] p-2.5 sm:px-4"
            onClick={openNewTakeaway}
            title="New take-away"
            aria-label="New take-away"
          >
            <Package className="w-5 h-5 sm:w-4 sm:h-4 text-ink" aria-hidden="true" />
            <span className="hidden sm:inline ml-1.5">New take-away</span>
          </Button>
          <Button
            className="min-h-[44px] min-w-[44px] p-2.5 sm:px-4"
            onClick={() => openNewOrder()}
            title="Seat new table"
            aria-label="Seat new table"
          >
            <UtensilsCrossed className="w-5 h-5 sm:w-4 sm:h-4 sm:hidden" aria-hidden="true" />
            <Plus className="w-4 h-4 hidden sm:inline mr-1.5" aria-hidden="true" />
            <span className="hidden sm:inline">Seat new table</span>
          </Button>
        </div>
      </div>

      {/* Section Switcher Tabs */}
      <div role="tablist" aria-label="Order sections" className="inline-flex gap-1 p-1 rounded-xl bg-stone-100 mb-4 sm:mb-8 self-start flex-wrap">
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
          <FloorFilterBar
            search={tableSearch}
            onSearchChange={setTableSearch}
            statusFilter={tableStatusFilter}
            onStatusFilterChange={setTableStatusFilter}
            sectionFilter={tableSectionFilter}
            onSectionFilterChange={setTableSectionFilter}
            capacityFilter={tableCapacityFilter}
            onCapacityFilterChange={setTableCapacityFilter}
            availableSections={availableSections}
            totalCount={tableOptions.length}
            availableCount={availableCount}
            occupiedCount={occupiedCount}
          />

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
              {filteredFloorTables.map((table) => (
                <TableFloorCard
                  key={table.id}
                  table={table}
                  tab={activeTabs.find((t) => t.table.id === table.id)}
                  onSelect={(id) => setViewingTableId(id)}
                  onOpenNewOrder={openNewOrder}
                />
              ))}
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
                    <TableTabCard
                      tab={tab}
                      onAddMore={openNewOrder}
                      onSettle={setCheckoutTable}
                      onUpdateStatus={updateOrderStatus}
                    />
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
              <TakeawayCard
                key={order.id}
                order={order}
                index={i}
                onSettle={setCheckoutTakeaway}
                onUpdateStatus={updateOrderStatus}
              />
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
                    <TakeawayCard
                      key={order.id}
                      order={order}
                      index={i}
                      onSettle={setCheckoutTakeaway}
                      onUpdateStatus={updateOrderStatus}
                    />
                  ))}
                </div>
              </section>
            )}

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
                    <TableTabCard
                      key={tab.table.id}
                      tab={tab}
                      onAddMore={openNewOrder}
                      onSettle={setCheckoutTable}
                      onUpdateStatus={updateOrderStatus}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      )}

      {/* Fire Ticket (Create Order) Sheet */}
      <NewOrderSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        orderMode={orderMode}
        onOrderModeChange={setOrderMode}
        selectedTableId={selectedTableId}
        onSelectTableId={setSelectedTableId}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        specialInstructions={specialInstructions}
        onSpecialInstructionsChange={setSpecialInstructions}
        cart={cart}
        onAddToCart={addToCart}
        onRemoveFromCart={removeFromCart}
        menuSearch={menuSearch}
        onMenuSearchChange={setMenuSearch}
        menuCategory={menuCategory}
        onMenuCategoryChange={setMenuCategory}
        categoryNames={menuCategoryNames}
        menuItems={menuItems}
        selectableTables={selectableTables}
        tableOptions={tableOptions}
        activeTabs={activeTabs}
        saving={saving}
        onSubmit={handleFireTicket}
      />

      {/* Settle Table Modal */}
      <SettleTableDialog
        tab={checkoutTable}
        onClose={() => setCheckoutTable(null)}
        saving={saving}
        onSettle={handleSettleTab}
      />

      {/* Settle Takeaway Modal */}
      <SettleTakeawayDialog
        order={checkoutTakeaway}
        onClose={() => setCheckoutTakeaway(null)}
        saving={saving}
        onSettle={handleSettleTakeaway}
      />

      {/* Table Tab Detail Drawer */}
      <TableDetailDrawer
        tab={viewingTab}
        onClose={() => setViewingTableId(null)}
        onAddMore={openNewOrder}
        onSettle={setCheckoutTable}
        onUpdateStatus={updateOrderStatus}
      />

      {/* Toast Overlay */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role={toast.type === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-[env(safe-area-inset-top)] left-4 right-4 md:left-auto md:right-8 z-[200] p-4 rounded-xl shadow-2xl flex items-center gap-3 ${
              toast.type === 'success' ? 'bg-sage text-white' : 'bg-terra text-white'
            }`}
          >
            <span className="font-medium text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
