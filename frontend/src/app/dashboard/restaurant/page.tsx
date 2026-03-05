'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Plus, UtensilsCrossed, Coffee, Edit, Eye, EyeOff, Trash2, X, QrCode, Users, Copy, Check } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';
import { motion, AnimatePresence } from 'framer-motion';

interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  category?: MenuCategory;
  tags: string[];
  isAvailable: boolean;
  imageUrl?: string;
}

interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  qrCode?: string;
  outlet?: { name: string; slug: string };
}

export default function RestaurantPage() {
  const [activeTab, setActiveTab] = useState<'menu' | 'tables'>('menu');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showEditItem, setShowEditItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Forms
  const [itemForm, setItemForm] = useState({ name: '', description: '', price: '', categoryId: '', tags: '' });
  const [categoryName, setCategoryName] = useState('');

  // Table management state
  const [tablesList, setTablesList] = useState<Table[]>([]);
  const [showAddTable, setShowAddTable] = useState(false);
  const [showEditTable, setShowEditTable] = useState<Table | null>(null);
  const [tableForm, setTableForm] = useState({ tableNumber: '', capacity: '4' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchItems = () => {
    fetch('/api/menu')
      .then(res => res.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchCategories = () => {
    fetch('/api/menu-categories')
      .then(res => res.json())
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(console.error);
  };

  const fetchTables = () => {
    fetch('/api/tables')
      .then(res => res.json())
      .then(data => setTablesList(Array.isArray(data) ? data : []))
      .catch(console.error);
  };

  useEffect(() => {
    fetchItems();
    fetchCategories();
    fetchTables();
  }, []);

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
          tags: itemForm.tags ? itemForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setShowAddItem(false);
      setItemForm({ name: '', description: '', price: '', categoryId: '', tags: '' });
      fetchItems();
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
          tags: itemForm.tags ? itemForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      setShowEditItem(null);
      fetchItems();
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
      fetchCategories();
      showToast('Category created', 'success');
    } catch {
      showToast('Failed to create category', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (itemId: string, currentStatus: boolean) => {
    try {
      await fetch('/api/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItemId: itemId, isAvailable: !currentStatus }),
      });
      setItems(items.map(item => item.id === itemId ? { ...item, isAvailable: !currentStatus } : item));
    } catch {
      showToast('Failed to update', 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Delete this menu item?')) return;
    try {
      await fetch(`/api/menu?id=${itemId}`, { method: 'DELETE' });
      fetchItems();
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
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber: tableForm.tableNumber, capacity: parseInt(tableForm.capacity) || 4 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      setShowAddTable(false);
      setTableForm({ tableNumber: '', capacity: '4' });
      fetchTables();
      showToast('Table created', 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to create table', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditTable = async () => {
    if (!showEditTable) return;
    setSaving(true);
    try {
      await fetch('/api/tables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: showEditTable.id, tableNumber: tableForm.tableNumber, capacity: parseInt(tableForm.capacity) || 4 }),
      });
      setShowEditTable(null);
      fetchTables();
      showToast('Table updated', 'success');
    } catch {
      showToast('Failed to update table', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!confirm('Delete this table? Active orders on this table may be affected.')) return;
    try {
      await fetch(`/api/tables?id=${tableId}`, { method: 'DELETE' });
      fetchTables();
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

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) return <LoadingState />;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Restaurant & Menu</h1>
          <p className="section-sub">Manage menu items, categories, and tables</p>
        </div>
        
        <div className="flex gap-3">
          {activeTab === 'menu' && (
            <>
              <Button variant="ghost" onClick={() => setShowAddCategory(true)}>
                <Coffee className="w-4 h-4" />
                Categories
              </Button>
              <Button onClick={() => {
                if (categories.length === 0) {
                  showToast('Create a category first', 'error');
                  setShowAddCategory(true);
                  return;
                }
                setItemForm({ name: '', description: '', price: '', categoryId: categories[0]?.id || '', tags: '' });
                setShowAddItem(true);
              }}>
                <Plus className="w-4 h-4" />
                Add Menu Item
              </Button>
            </>
          )}
          {activeTab === 'tables' && (
            <Button onClick={() => {
              setTableForm({ tableNumber: '', capacity: '4' });
              setShowAddTable(true);
            }}>
              <Plus className="w-4 h-4" />
              Add Table
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 mb-6 border-b border-stone-200">
        <button
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'menu' ? 'border-amber text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          onClick={() => setActiveTab('menu')}
        >
          <UtensilsCrossed className="w-4 h-4 inline mr-2" />
          Menu Items ({items.length})
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tables' ? 'border-amber text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          onClick={() => setActiveTab('tables')}
        >
          <QrCode className="w-4 h-4 inline mr-2" />
          Tables ({tablesList.length})
        </button>
      </div>

      {/* ===== MENU TAB ===== */}
      {activeTab === 'menu' && (<>
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
          <Button size="sm" variant={categoryFilter === 'all' ? 'primary' : 'ghost'} onClick={() => setCategoryFilter('all')}>
            All
          </Button>
          {categories.map(cat => (
            <Button key={cat.id} size="sm" variant={categoryFilter === cat.id ? 'primary' : 'ghost'} onClick={() => setCategoryFilter(cat.id)}>
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Menu Items Grid */}
      {filteredItems.length === 0 ? (
        <EmptyState
          title={search || categoryFilter !== 'all' ? "No Results Found" : "No Menu Items Yet"}
          description={
            search || categoryFilter !== 'all'
              ? "Try adjusting your filters."
              : "Add your first menu item to get started."
          }
          actionLabel={!search && categoryFilter === 'all' ? "Add First Item" : undefined}
          onAction={!search && categoryFilter === 'all' ? () => {
            if (categories.length === 0) setShowAddCategory(true);
            else { setItemForm({ name: '', description: '', price: '', categoryId: categories[0]?.id || '', tags: '' }); setShowAddItem(true); }
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <Card key={item.id} hover className="overflow-hidden">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-ink mb-1">{item.name}</h3>
                  <p className="text-sm text-ink-muted line-clamp-2">{item.description}</p>
                </div>
                <div className="ml-3">
                  <div className="font-bold text-xl text-amber">{formatCurrency(Number(item.price))}</div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-1.5 mb-4">
                <Badge variant="stone" className="text-xs">
                  {item.category?.name || 'Uncategorized'}
                </Badge>
                {(item.tags || []).map(tag => (
                  <Badge key={tag} variant="amber" className="text-xs">{tag}</Badge>
                ))}
                <Badge variant={item.isAvailable ? 'sage' : 'stone'} className="text-xs">
                  {item.isAvailable ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
              
              <div className="flex gap-2 pt-3 border-t border-stone-200">
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => toggleAvailability(item.id, item.isAvailable)}>
                  {item.isAvailable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {item.isAvailable ? 'Hide' : 'Show'}
                </Button>
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => {
                  setShowEditItem(item);
                  setItemForm({
                    name: item.name,
                    description: item.description || '',
                    price: item.price,
                    categoryId: item.categoryId,
                    tags: (item.tags || []).join(', '),
                  });
                }}>
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDeleteItem(item.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      </>)}

      {/* ===== TABLES TAB ===== */}
      {activeTab === 'tables' && (
        <>
          {tablesList.length === 0 ? (
            <EmptyState
              title="No Tables Yet"
              description="Add tables to enable QR code ordering for dine-in guests."
              actionLabel="Add First Table"
              onAction={() => {
                setTableForm({ tableNumber: '', capacity: '4' });
                setShowAddTable(true);
              }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tablesList.map((table) => (
                <Card key={table.id} hover className="overflow-hidden">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg text-ink">Table {table.tableNumber}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-ink-muted">
                        <Users className="w-3.5 h-3.5" />
                        <span>Seats {table.capacity}</span>
                      </div>
                    </div>
                    <Badge variant="sage" className="text-xs">
                      <QrCode className="w-3 h-3 mr-1" />
                      QR Ready
                    </Badge>
                  </div>

                  {table.qrCode && (
                    <div className="bg-stone-50 rounded-lg p-3 mb-4">
                      <p className="text-xs text-ink-muted mb-1">QR Menu Link</p>
                      <p className="text-sm text-ink font-mono truncate">{table.qrCode}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-3 border-t border-stone-200">
                    {table.qrCode && (
                      <Button size="sm" variant="ghost" className="flex-1" onClick={() => copyQrLink(table)}>
                        {copiedId === table.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        {copiedId === table.id ? 'Copied!' : 'Copy Link'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => {
                      setShowEditTable(table);
                      setTableForm({ tableNumber: table.tableNumber, capacity: String(table.capacity) });
                    }}>
                      <Edit className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDeleteTable(table.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add Menu Item Modal */}
      <AnimatePresence>
        {showAddItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddItem(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Add Menu Item</h2>
                <button onClick={() => setShowAddItem(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <Input label="Item Name" placeholder="Butter Chicken" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
                <Input label="Description" placeholder="Creamy north Indian curry..." value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
                <Input label="Price (₹)" type="number" placeholder="350" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} />
                <Select label="Category" value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })} options={categories.map(c => ({ value: c.id, label: c.name }))} />
                <Input label="Tags (comma separated)" placeholder="veg, spicy, popular" value={itemForm.tags} onChange={(e) => setItemForm({ ...itemForm, tags: e.target.value })} />
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowAddItem(false)} disabled={saving}>Cancel</Button>
                  <Button variant="terra" className="flex-1" onClick={handleCreateItem} disabled={saving}>{saving ? 'Creating...' : 'Add Item'}</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Menu Item Modal */}
      <AnimatePresence>
        {showEditItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditItem(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Edit Menu Item</h2>
                <button onClick={() => setShowEditItem(null)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <Input label="Item Name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
                <Input label="Description" value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
                <Input label="Price (₹)" type="number" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} />
                <Select label="Category" value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })} options={categories.map(c => ({ value: c.id, label: c.name }))} />
                <Input label="Tags (comma separated)" value={itemForm.tags} onChange={(e) => setItemForm({ ...itemForm, tags: e.target.value })} />
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowEditItem(null)} disabled={saving}>Cancel</Button>
                  <Button variant="terra" className="flex-1" onClick={handleEditItem} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Category Modal */}
      <AnimatePresence>
        {showAddCategory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddCategory(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Menu Categories</h2>
                <button onClick={() => setShowAddCategory(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                {categories.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {categories.map(cat => (
                      <div key={cat.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-sm">
                        <span className="font-medium">{cat.name}</span>
                        <Button size="sm" variant="ghost" className="text-red-500 h-7" onClick={async () => {
                          await fetch(`/api/menu-categories?id=${cat.id}`, { method: 'DELETE' });
                          fetchCategories();
                        }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <hr />
                <Input label="New Category Name" placeholder="Starters, Mains, Desserts..." value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowAddCategory(false)}>Close</Button>
                  <Button variant="terra" className="flex-1" onClick={handleCreateCategory} disabled={saving}>{saving ? 'Creating...' : 'Add Category'}</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Table Modal */}
      <AnimatePresence>
        {showAddTable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddTable(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Add Table</h2>
                <button onClick={() => setShowAddTable(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <Input label="Table Number" placeholder="1, 2, A1..." value={tableForm.tableNumber} onChange={(e) => setTableForm({ ...tableForm, tableNumber: e.target.value })} />
                <Input label="Seating Capacity" type="number" placeholder="4" value={tableForm.capacity} onChange={(e) => setTableForm({ ...tableForm, capacity: e.target.value })} />
                <p className="text-xs text-ink-muted">A QR code link will be automatically generated for this table, allowing guests to scan and order directly.</p>
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowAddTable(false)} disabled={saving}>Cancel</Button>
                  <Button variant="terra" className="flex-1" onClick={handleCreateTable} disabled={saving}>{saving ? 'Creating...' : 'Add Table'}</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Table Modal */}
      <AnimatePresence>
        {showEditTable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditTable(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Edit Table</h2>
                <button onClick={() => setShowEditTable(null)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <Input label="Table Number" value={tableForm.tableNumber} onChange={(e) => setTableForm({ ...tableForm, tableNumber: e.target.value })} />
                <Input label="Seating Capacity" type="number" value={tableForm.capacity} onChange={(e) => setTableForm({ ...tableForm, capacity: e.target.value })} />
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowEditTable(null)} disabled={saving}>Cancel</Button>
                  <Button variant="terra" className="flex-1" onClick={handleEditTable} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
                </div>
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
