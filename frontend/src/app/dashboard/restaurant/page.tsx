'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Plus, UtensilsCrossed, Coffee, QrCode, Search, X } from 'lucide-react';
import { confirmDialog } from '@/components/ui/confirm';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@/hooks/use-query';
import type { MenuCategory, MenuItem, Table } from '@/components/restaurant/types';
import { MenuItemCard } from '@/components/restaurant/menu-item-card';
import { MenuItemModal } from '@/components/restaurant/menu-item-modal';
import { CategoryModal } from '@/components/restaurant/category-modal';
import { TableCard } from '@/components/restaurant/table-card';
import { TableModal } from '@/components/restaurant/table-modal';

export default function RestaurantPage() {
  const [activeTab, setActiveTab] = useState<'menu' | 'tables'>('menu');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Queries
  const { data: rawItems, isLoading: itemsLoading, refetch: refetchItems } = useQuery<MenuItem[]>('/api/menu');
  const { data: rawCategories, refetch: refetchCategories } = useQuery<MenuCategory[]>('/api/menu-categories');
  const { data: rawTables, refetch: refetchTables } = useQuery<Table[]>('/api/tables');

  const [items, setItems] = useState<MenuItem[]>([]);
  useEffect(() => {
    if (rawItems) setItems(rawItems);
  }, [rawItems]);

  const categories = Array.isArray(rawCategories) ? rawCategories : [];
  const tablesList = Array.isArray(rawTables) ? rawTables : [];

  // Modals
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showEditItem, setShowEditItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Forms
  const [itemForm, setItemForm] = useState({ name: '', description: '', price: '', categoryId: '', tags: '' });
  const [categoryName, setCategoryName] = useState('');
  const [lastCategoryId, setLastCategoryId] = useState('');
  const LAST_CATEGORY_KEY = 'kipd.menu.lastCategoryId';

  // Table management state
  const [showAddTable, setShowAddTable] = useState(false);
  const [showEditTable, setShowEditTable] = useState<Table | null>(null);
  const [tableForm, setTableForm] = useState({ tableNumber: '', capacity: '4', section: '', tags: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Table filtering state
  const [tableSearch, setTableSearch] = useState('');
  const [tableSectionFilter, setTableSectionFilter] = useState('all');
  const [tableCapacityFilter, setTableCapacityFilter] = useState('all');
  const [tableTagFilter, setTableTagFilter] = useState('all');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    try {
      setLastCategoryId(localStorage.getItem(LAST_CATEGORY_KEY) || '');
    } catch {
      // storage can be blocked; the form then just starts on the first category
    }
  }, []);

  const rememberCategory = (id: string) => {
    setLastCategoryId(id);
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, id);
    } catch {
      // ignore
    }
  };

  const startAddItem = () => {
    const categoryId = categories.some((c) => c.id === lastCategoryId) ? lastCategoryId : categories[0]?.id || '';
    setItemForm({ name: '', description: '', price: '', categoryId, tags: '' });
    setShowAddItem(true);
  };

  const handleCreateItem = async () => {
    if (!itemForm.name || !itemForm.price || !itemForm.categoryId) {
      showToast('Name, price, and category are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: itemForm.name,
          description: itemForm.description,
          price: parseFloat(itemForm.price),
          categoryId: itemForm.categoryId,
          tags: itemForm.tags ? itemForm.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      rememberCategory(itemForm.categoryId);
      setShowAddItem(false);
      setItemForm({ name: '', description: '', price: '', categoryId: itemForm.categoryId, tags: '' });
      refetchItems();
      showToast('Menu item created', 'success');
    } catch {
      showToast('Failed to create menu item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditItem = async () => {
    if (!showEditItem) return;
    setSaving(true);
    try {
      await fetch('/api/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: showEditItem.id,
          name: itemForm.name,
          description: itemForm.description,
          price: itemForm.price,
          categoryId: itemForm.categoryId,
          tags: itemForm.tags ? itemForm.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      setShowEditItem(null);
      refetchItems();
      showToast('Menu item updated', 'success');
    } catch {
      showToast('Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryName) {
      showToast('Category name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/menu-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryName }),
      });
      if (!res.ok) throw new Error('Failed');
      setCategoryName('');
      refetchCategories();
      showToast('Category created', 'success');
    } catch {
      showToast('Failed to create category', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      await fetch(`/api/menu-categories?id=${catId}`, { method: 'DELETE' });
      refetchCategories();
    } catch {
      showToast('Failed to delete category', 'error');
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await fetch('/api/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItemId: item.id, isAvailable: !item.isAvailable }),
      });
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, isAvailable: !item.isAvailable } : it))
      );
    } catch {
      showToast('Failed to update', 'error');
    }
  };

  const handleDeleteItem = async (item: MenuItem) => {
    if (!(await confirmDialog({ title: 'Delete this menu item?', confirmLabel: 'Delete item', danger: true }))) return;
    try {
      const res = await fetch(`/api/menu?id=${item.id}`, { method: 'DELETE' });
      if (res.status === 409) {
        if (await confirmDialog({ title: 'Hide it from the menu instead?', message: 'This item is on past orders, so it cannot be deleted.', confirmLabel: 'Hide item' })) {
          const patch = await fetch('/api/menu', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ menuItemId: item.id, isAvailable: false }),
          });
          if (!patch.ok) throw new Error('hide failed');
          refetchItems();
          showToast('Item hidden from the menu', 'success');
        }
        return;
      }
      if (!res.ok) throw new Error('delete failed');
      refetchItems();
      showToast('Item deleted', 'success');
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  // ===== TABLE CRUD =====
  const handleCreateTable = async () => {
    if (!tableForm.tableNumber) {
      showToast('Table number is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const parsedTags = tableForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableForm.tableNumber,
          capacity: parseInt(tableForm.capacity) || 4,
          section: tableForm.section.trim() || undefined,
          tags: parsedTags,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      setShowAddTable(false);
      setTableForm({ tableNumber: '', capacity: '4', section: '', tags: '' });
      refetchTables();
      showToast('Table created', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to create table', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditTable = async () => {
    if (!showEditTable) return;
    setSaving(true);
    try {
      const parsedTags = tableForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
      await fetch('/api/tables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: showEditTable.id,
          tableNumber: tableForm.tableNumber,
          capacity: parseInt(tableForm.capacity) || 4,
          section: tableForm.section.trim() || null,
          tags: parsedTags,
        }),
      });
      setShowEditTable(null);
      setTableForm({ tableNumber: '', capacity: '4', section: '', tags: '' });
      refetchTables();
      showToast('Table updated', 'success');
    } catch {
      showToast('Failed to update table', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTable = async (table: Table) => {
    if (
      !(await confirmDialog({
        title: 'Delete this table?',
        message: 'Its past orders are kept, but its QR code stops working.',
        confirmLabel: 'Delete table',
        danger: true,
      }))
    )
      return;
    try {
      await fetch(`/api/tables?id=${table.id}`, { method: 'DELETE' });
      refetchTables();
      showToast('Table deleted', 'success');
    } catch {
      showToast('Failed to delete table', 'error');
    }
  };

  const copyQrLink = (table: Table) => {
    const url = `${window.location.origin}${table.qrCode}`;
    navigator.clipboard.writeText(url);
    setCopiedId(table.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const availableTableSections = Array.from(
    new Set(tablesList.map((t) => t.section).filter((s): s is string => Boolean(s?.trim())))
  );

  const availableTableTags = Array.from(
    new Set(tablesList.flatMap((t) => t.tags || []).filter((tg): tg is string => Boolean(tg?.trim())))
  );

  const filteredTables = tablesList.filter((t) => {
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      const numMatch = t.tableNumber.toLowerCase().includes(q);
      const secMatch = t.section?.toLowerCase().includes(q) ?? false;
      const tagMatch = t.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false;
      if (!numMatch && !secMatch && !tagMatch) return false;
    }
    if (tableSectionFilter !== 'all' && t.section !== tableSectionFilter) return false;
    if (tableCapacityFilter === '2' && t.capacity !== 2) return false;
    if (tableCapacityFilter === '4' && t.capacity !== 4) return false;
    if (tableCapacityFilter === '6+' && t.capacity < 6) return false;
    if (tableTagFilter !== 'all' && !(t.tags || []).includes(tableTagFilter)) return false;
    return true;
  });

  if (itemsLoading && !rawItems) return <LoadingState />;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="section-title">Menu</h1>
          <p className="section-sub">Manage menu items, categories, and tables</p>
        </div>

        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
          {activeTab === 'menu' && (
            <>
              <Button variant="ghost" onClick={() => setShowAddCategory(true)}>
                <Coffee className="w-4 h-4" />
                Categories
              </Button>
              <Button
                onClick={() => {
                  if (categories.length === 0) {
                    showToast('Create a category first', 'error');
                    setShowAddCategory(true);
                    return;
                  }
                  startAddItem();
                }}
              >
                <Plus className="w-4 h-4" />
                Add Menu Item
              </Button>
            </>
          )}
          {activeTab === 'tables' && (
            <Button
              onClick={() => {
                setTableForm({ tableNumber: '', capacity: '4', section: '', tags: '' });
                setShowAddTable(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Table
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 mb-6 border-b border-stone-200">
        <button
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'menu' ? 'border-amber text-ink' : 'border-transparent text-ink-muted hover:text-ink'
          }`}
          onClick={() => setActiveTab('menu')}
        >
          <UtensilsCrossed className="w-4 h-4 inline mr-2" />
          Menu Items ({items.length})
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'tables' ? 'border-amber text-ink' : 'border-transparent text-ink-muted hover:text-ink'
          }`}
          onClick={() => setActiveTab('tables')}
        >
          <QrCode className="w-4 h-4 inline mr-2" />
          Tables ({tablesList.length})
        </button>
      </div>

      {/* ===== MENU TAB ===== */}
      {activeTab === 'menu' && (
        <>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Search menu items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-md"
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={categoryFilter === 'all' ? 'primary' : 'ghost'}
                onClick={() => setCategoryFilter('all')}
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat.id}
                  size="sm"
                  variant={categoryFilter === cat.id ? 'primary' : 'ghost'}
                  onClick={() => setCategoryFilter(cat.id)}
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Menu Items Grid */}
          {filteredItems.length === 0 ? (
            <EmptyState
              title={search || categoryFilter !== 'all' ? 'No Results Found' : 'No Menu Items Yet'}
              description={
                search || categoryFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Add your first menu item to get started.'
              }
              actionLabel={!search && categoryFilter === 'all' ? 'Add First Item' : undefined}
              onAction={
                !search && categoryFilter === 'all'
                  ? () => {
                      if (categories.length === 0) setShowAddCategory(true);
                      else startAddItem();
                    }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onToggleAvailability={toggleAvailability}
                  onEdit={(it) => {
                    setShowEditItem(it);
                    setItemForm({
                      name: it.name,
                      description: it.description || '',
                      price: it.price,
                      categoryId: it.categoryId,
                      tags: (it.tags || []).join(', '),
                    });
                  }}
                  onDelete={handleDeleteItem}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== TABLES TAB ===== */}
      {activeTab === 'tables' && (
        <>
          {tablesList.length === 0 ? (
            <EmptyState
              title="No Tables Yet"
              description="Add tables to enable QR code ordering for dine-in guests."
              actionLabel="Add First Table"
              onAction={() => {
                setTableForm({ tableNumber: '', capacity: '4', section: '', tags: '' });
                setShowAddTable(true);
              }}
            />
          ) : (
            <div className="space-y-6">
              {/* Tables Filter Bar */}
              <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200">
                {/* Search row */}
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
                  <span className="text-xs text-ink-muted self-end sm:self-center font-medium">
                    Showing {filteredTables.length} of {tablesList.length} tables
                  </span>
                </div>

                {/* Section & Capacity & Tag Filters */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-200/60 text-xs">
                  <span className="font-semibold text-ink-muted mr-1">Section:</span>
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
                  {availableTableSections.map((sec) => (
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

                  <span className="font-semibold text-ink-muted ml-3 mr-1">Seats:</span>
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

                  {availableTableTags.length > 0 && (
                    <>
                      <span className="font-semibold text-ink-muted ml-3 mr-1">Tag:</span>
                      <button
                        type="button"
                        onClick={() => setTableTagFilter('all')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          tableTagFilter === 'all'
                            ? 'bg-ink text-white font-semibold'
                            : 'bg-white text-ink-soft border border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        All
                      </button>
                      {availableTableTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setTableTagFilter(tag === tableTagFilter ? 'all' : tag)}
                          className={`px-2.5 py-1 rounded-md transition-colors ${
                            tableTagFilter === tag
                              ? 'bg-amber text-white font-semibold'
                              : 'bg-white text-ink-soft border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {filteredTables.length === 0 ? (
                <EmptyState
                  title="No Matching Tables"
                  description="Try adjusting your filters or search query."
                  actionLabel="Reset filters"
                  onAction={() => {
                    setTableSearch('');
                    setTableSectionFilter('all');
                    setTableCapacityFilter('all');
                    setTableTagFilter('all');
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTables.map((table) => (
                    <TableCard
                      key={table.id}
                      table={table}
                      isCopied={copiedId === table.id}
                      onCopyQrLink={copyQrLink}
                      onEdit={(tbl) => {
                        setShowEditTable(tbl);
                        setTableForm({
                          tableNumber: tbl.tableNumber,
                          capacity: String(tbl.capacity),
                          section: tbl.section || '',
                          tags: (tbl.tags || []).join(', '),
                        });
                      }}
                      onDelete={handleDeleteTable}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add / Edit Menu Item Modal */}
      <MenuItemModal
        open={showAddItem || !!showEditItem}
        onClose={() => {
          setShowAddItem(false);
          setShowEditItem(null);
        }}
        item={showEditItem}
        categories={categories}
        form={itemForm}
        onFormChange={setItemForm}
        saving={saving}
        onSubmit={showEditItem ? handleEditItem : handleCreateItem}
      />

      {/* Categories Modal */}
      <CategoryModal
        open={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        categories={categories}
        categoryName={categoryName}
        onCategoryNameChange={setCategoryName}
        saving={saving}
        onCreateCategory={handleCreateCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      {/* Add / Edit Table Modal */}
      <TableModal
        open={showAddTable || !!showEditTable}
        onClose={() => {
          setShowAddTable(false);
          setShowEditTable(null);
        }}
        table={showEditTable}
        form={tableForm}
        onFormChange={setTableForm}
        saving={saving}
        onSubmit={showEditTable ? handleEditTable : handleCreateTable}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-8 right-8 z-50 px-6 py-4 rounded-lg shadow-lg ${
              toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-900' : 'bg-red-50 border border-red-200 text-red-900'
            }`}
          >
            <span className="font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
