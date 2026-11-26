'use client';

import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Package, Plus, Minus, Trash2, ChefHat, X } from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { toast } from '@/components/ui/toaster';
import { confirmDialog } from '@/components/ui/confirm';
import { useTenantInfo } from '@/contexts/tenant-context';
import { useQuery } from '@/hooks/use-query';
import { useAppMessages } from '@/components/ui/i18n-provider';
import { formatCurrency } from '@/lib/currency';

interface IngredientRow {
  id: string;
  outletId: string;
  name: string;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'unit' | 'dozen';
  stockQty: number;
  lowStockThreshold: number;
  costPerUnit: number | null;
  lowStock: boolean;
  stockValue: number;
}

interface RecipeCostRow {
  menuItemId: string;
  menuItemName: string;
  outletId: string;
  sellingPrice: number;
  unitCost: number;
  foodCostPct: number | null;
  margin: number;
  ingredients: Array<{
    ingredientId: string;
    ingredientName: string;
    unit: string;
    quantityPerUnit: number;
    costPerUnit: number | null;
  }>;
}

interface InventoryPayload {
  ingredients: IngredientRow[];
  lowStockCount: number;
  recipes: RecipeCostRow[];
}

export default function InventoryPage() {
  const m = useAppMessages();
  const { info } = useTenantInfo();
  const outlets = useMemo(() => info?.outlets ?? [], [info?.outlets]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');

  useEffect(() => {
    if (outlets.length === 1) setSelectedOutletId(outlets[0].id);
  }, [outlets]);

  const qs = selectedOutletId !== 'all' ? `?outletId=${selectedOutletId}` : '';
  const { data, isLoading, error, refetch } = useQuery<InventoryPayload>(`/api/inventory${qs}`, [selectedOutletId]);

  const [tab, setTab] = useState<'stock' | 'recipes'>('stock');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    unit: 'kg' as IngredientRow['unit'],
    stockQty: '10',
    lowStockThreshold: '3',
    costPerUnit: '',
    outletId: '',
  });

  // Recipe editor modal
  const [editingRecipe, setEditingRecipe] = useState<RecipeCostRow | null>(null);
  const [recipeLines, setRecipeLines] = useState<Array<{ ingredientId: string; quantityPerUnit: string }>>([]);

  const openAdd = () => {
    setForm({
      name: '',
      unit: 'kg',
      stockQty: '10',
      lowStockThreshold: '3',
      costPerUnit: '',
      outletId: selectedOutletId !== 'all' ? selectedOutletId : (outlets[0]?.id ?? ''),
    });
    setShowAddModal(true);
  };

  const handleCreateIngredient = async () => {
    if (!form.name.trim()) {
      toast('error', 'Enter an ingredient name');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletId: form.outletId || undefined,
          name: form.name.trim(),
          unit: form.unit,
          stockQty: Number(form.stockQty) || 0,
          lowStockThreshold: Number(form.lowStockThreshold) || 0,
          costPerUnit: form.costPerUnit.trim() ? Number(form.costPerUnit) : null,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not add ingredient');
      setShowAddModal(false);
      toast('success', 'Ingredient added');
      refetch();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create ingredient');
    } finally {
      setSaving(false);
    }
  };

  const adjustStock = async (ing: IngredientRow, delta: number) => {
    try {
      const res = await fetch(`/api/inventory/${ing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaQty: delta }),
      });
      if (!res.ok) throw new Error('Update failed');
      refetch();
    } catch {
      toast('error', 'Could not update stock quantity');
    }
  };

  const handleDelete = async (ing: IngredientRow) => {
    if (!(await confirmDialog({
      title: `Remove ${ing.name}?`,
      message: 'This also removes it from any linked menu recipes.',
      confirmLabel: 'Remove',
      danger: true,
    }))) return;

    try {
      const res = await fetch(`/api/inventory/${ing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast('success', `${ing.name} removed`);
      refetch();
    } catch {
      toast('error', 'Could not delete ingredient');
    }
  };

  const openRecipeModal = (recipe: RecipeCostRow) => {
    setEditingRecipe(recipe);
    setRecipeLines(
      recipe.ingredients.map((l) => ({
        ingredientId: l.ingredientId,
        quantityPerUnit: String(l.quantityPerUnit),
      })),
    );
  };

  const saveRecipe = async () => {
    if (!editingRecipe) return;
    setSaving(true);
    try {
      const clean = recipeLines
        .filter((l) => l.ingredientId && Number(l.quantityPerUnit) > 0)
        .map((l) => ({ ingredientId: l.ingredientId, quantityPerUnit: Number(l.quantityPerUnit) }));
      const res = await fetch('/api/inventory/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItemId: editingRecipe.menuItemId, items: clean }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save recipe');
      setEditingRecipe(null);
      toast('success', 'Recipe costing updated');
      refetch();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !data) return <LoadingState message={m.common.loading} />;
  if (error || !data) return <ErrorState message={error || m.common.error} reset={refetch} />;

  const { ingredients, lowStockCount, recipes } = data;
  const totalValue = ingredients.reduce((s, i) => s + i.stockValue, 0);

  return (
    <div className="p-4 md:p-8 overflow-x-hidden space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="section-title">{m.inventory.title}</h1>
          <p className="section-sub">{m.inventory.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {outlets.length > 1 && (
            <select
              aria-label="Filter inventory by outlet"
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-ink"
            >
              <option value="all">{m.common.allOutlets}</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {m.inventory.addIngredient}
          </Button>
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockCount > 0 && (
        <div role="status" className="rounded-xl border border-terra/30 bg-terra-pale px-4 py-3.5 flex items-center gap-3 text-terra">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <div className="text-sm font-medium">
            <strong>{lowStockCount} {lowStockCount === 1 ? 'ingredient is' : 'ingredients are'} low on stock</strong> — restock items highlighted below.
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card hover={false}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{m.inventory.trackedIngredients}</div>
          <div className="text-2xl font-bold text-ink mt-1">{ingredients.length}</div>
        </Card>
        <Card hover={false}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{m.inventory.lowStockAlerts}</div>
          <div className={`text-2xl font-bold mt-1 ${lowStockCount > 0 ? 'text-terra' : 'text-sage-deep'}`}>{lowStockCount}</div>
        </Card>
        <Card hover={false}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{m.inventory.stockOnHandValue}</div>
          <div className="text-2xl font-bold text-ink mt-1">{formatCurrency(totalValue)}</div>
        </Card>
      </div>

      {/* Tabs */}
      <div role="tablist" className="inline-flex gap-1 p-1 rounded-xl bg-stone-100">
        <button
          role="tab"
          aria-selected={tab === 'stock'}
          onClick={() => setTab('stock')}
          className={`h-10 px-4 rounded-lg inline-flex items-center gap-2 text-sm ${
            tab === 'stock' ? 'bg-white text-ink font-semibold shadow-sm' : 'text-ink-soft font-medium'
          }`}
        >
          <Package className="w-4 h-4 text-amber-deep" aria-hidden="true" />
          {m.inventory.tabStock} ({ingredients.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === 'recipes'}
          onClick={() => setTab('recipes')}
          className={`h-10 px-4 rounded-lg inline-flex items-center gap-2 text-sm ${
            tab === 'recipes' ? 'bg-white text-ink font-semibold shadow-sm' : 'text-ink-soft font-medium'
          }`}
        >
          <ChefHat className="w-4 h-4 text-amber-deep" aria-hidden="true" />
          {m.inventory.tabRecipes} ({recipes.length})
        </button>
      </div>

      {tab === 'stock' ? (
        ingredients.length === 0 ? (
          <Card hover={false} className="text-center py-12">
            <p className="text-ink-muted mb-4">{m.inventory.noIngredients}</p>
            <Button onClick={openAdd}>{m.inventory.addFirstIngredient}</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ingredients.map((ing) => (
              <Card key={ing.id} hover={false} className={ing.lowStock ? 'border-terra/50 bg-terra-pale/20' : ''}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-semibold text-ink text-lg">{ing.name}</h3>
                    <p className="text-xs text-ink-muted">
                      {m.inventory.alertBelow} {ing.lowStockThreshold} {ing.unit}
                      {ing.costPerUnit !== null ? ` · ${formatCurrency(ing.costPerUnit)}/${ing.unit}` : ''}
                    </p>
                  </div>
                  <Badge variant={ing.lowStock ? 'terra' : 'sage'} dot>
                    {ing.lowStock ? m.inventory.lowStock : m.inventory.inStock}
                  </Badge>
                </div>

                <div className="flex items-center justify-between py-3 border-y border-stone-200/70 mb-3">
                  <div>
                    <div className="text-2xl font-bold text-ink">
                      {ing.stockQty} <span className="text-sm font-normal text-ink-muted">{ing.unit}</span>
                    </div>
                    {ing.stockValue > 0 && (
                      <div className="text-xs text-ink-muted">{m.inventory.value}: {formatCurrency(ing.stockValue)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => adjustStock(ing, -1)}
                      aria-label={`Decrease stock of ${ing.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-ink"
                    >
                      <Minus className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustStock(ing, 1)}
                      aria-label={`Increase stock of ${ing.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-lg bg-amber text-white hover:bg-amber-deep flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleDelete(ing)}
                    aria-label={`Delete ${ing.name}`}
                    className="text-xs text-terra hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    {m.common.remove}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card hover={false}>
          <CardTitle className="mb-1">{m.inventory.recipesTitle}</CardTitle>
          <CardDescription className="mb-4">{m.inventory.recipesSub}</CardDescription>
          {recipes.length === 0 ? (
            <p className="text-sm text-ink-muted py-8 text-center">Add menu items in Menu Management first.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {recipes.map((r) => (
                <div key={r.menuItemId} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{r.menuItemName}</div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      {r.ingredients.length === 0
                        ? m.inventory.noRecipesYet
                        : r.ingredients.map((l) => `${l.quantityPerUnit} ${l.unit} ${l.ingredientName}`).join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-ink font-medium">{m.inventory.price} {formatCurrency(r.sellingPrice)}</div>
                      <div className="text-xs text-ink-muted">
                        {m.inventory.cost} {formatCurrency(r.unitCost)}
                        {r.foodCostPct !== null ? ` (${r.foodCostPct}%)` : ''}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openRecipeModal(r)}>
                      {m.inventory.editRecipe}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Add Ingredient Dialog */}
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} labelledBy="add-ing-title" className="p-6 md:p-8 max-w-md w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 id="add-ing-title" className="text-xl font-bold text-ink">Add Ingredient</h2>
          <button onClick={() => setShowAddModal(false)} aria-label="Close" className="p-1.5 rounded text-ink-muted hover:text-ink">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4">
          {outlets.length > 1 && (
            <Select
              label="Outlet"
              value={form.outletId}
              onChange={(e) => setForm({ ...form, outletId: e.target.value })}
              options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            />
          )}
          <Input label="Ingredient Name" placeholder="e.g. Basmati Rice" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value as IngredientRow['unit'] })}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'g', label: 'g' },
                { value: 'l', label: 'litre' },
                { value: 'ml', label: 'ml' },
                { value: 'unit', label: 'unit' },
                { value: 'dozen', label: 'dozen' },
              ]}
            />
            <Input label="Cost per unit (₹)" type="number" step="0.01" min="0" placeholder="120" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Opening Stock" type="number" step="0.01" min="0" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} />
            <Input label="Low-Stock Alert At" type="number" step="0.01" min="0" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowAddModal(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1" onClick={handleCreateIngredient} disabled={saving} isLoading={saving}>Save</Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Recipe Dialog */}
      <Dialog open={!!editingRecipe} onClose={() => setEditingRecipe(null)} labelledBy="recipe-title" className="p-6 md:p-8 max-w-lg w-full">
        {editingRecipe && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 id="recipe-title" className="text-xl font-bold text-ink">{editingRecipe.menuItemName}</h2>
                <p className="text-xs text-ink-muted">Selling price: {formatCurrency(editingRecipe.sellingPrice)}</p>
              </div>
              <button onClick={() => setEditingRecipe(null)} aria-label="Close" className="p-1.5 rounded text-ink-muted hover:text-ink">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {recipeLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    aria-label={`Ingredient ${idx + 1}`}
                    value={line.ingredientId}
                    onChange={(e) => setRecipeLines((prev) => prev.map((r, i) => (i === idx ? { ...r, ingredientId: e.target.value } : r)))}
                    className="flex-1 min-h-[44px] rounded-xl border border-stone-300 bg-white px-3 text-sm text-ink"
                  >
                    <option value="">Select ingredient...</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Quantity ${idx + 1}`}
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="Qty"
                    value={line.quantityPerUnit}
                    onChange={(e) => setRecipeLines((prev) => prev.map((r, i) => (i === idx ? { ...r, quantityPerUnit: e.target.value } : r)))}
                    className="w-24"
                  />
                  <button
                    type="button"
                    aria-label="Remove recipe line"
                    onClick={() => setRecipeLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-ink-muted hover:text-terra"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRecipeLines((prev) => [...prev, { ingredientId: ingredients[0]?.id ?? '', quantityPerUnit: '1' }])}
                disabled={ingredients.length === 0}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add ingredient to recipe
              </Button>
            </div>
            <div className="flex gap-3 pt-5">
              <Button variant="ghost" className="flex-1" onClick={() => setEditingRecipe(null)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={saveRecipe} disabled={saving} isLoading={saving}>Save Recipe</Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
