'use client';

import { MapPin, Package, X, ShoppingCart, Plus, Minus } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';
import type { CartItem, MenuItem, TableOption, TableTab } from './types';

interface NewOrderSheetProps {
  open: boolean;
  onClose: () => void;
  orderMode: 'dine_in' | 'take_away';
  onOrderModeChange: (mode: 'dine_in' | 'take_away') => void;
  selectedTableId: string;
  onSelectTableId: (id: string) => void;
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  specialInstructions: string;
  onSpecialInstructionsChange: (instructions: string) => void;
  cart: CartItem[];
  onAddToCart: (item: MenuItem) => void;
  onRemoveFromCart: (menuItemId: string) => void;
  menuSearch: string;
  onMenuSearchChange: (search: string) => void;
  menuCategory: string;
  onMenuCategoryChange: (category: string) => void;
  categoryNames: string[];
  menuItems: MenuItem[];
  selectableTables: TableOption[];
  tableOptions: TableOption[];
  activeTabs: TableTab[];
  saving: boolean;
  onSubmit: () => void;
}

export function NewOrderSheet({
  open,
  onClose,
  orderMode,
  onOrderModeChange,
  selectedTableId,
  onSelectTableId,
  customerName,
  onCustomerNameChange,
  specialInstructions,
  onSpecialInstructionsChange,
  cart,
  onAddToCart,
  onRemoveFromCart,
  menuSearch,
  onMenuSearchChange,
  menuCategory,
  onMenuCategoryChange,
  categoryNames,
  menuItems,
  selectableTables,
  tableOptions,
  activeTabs,
  saving,
  onSubmit,
}: NewOrderSheetProps) {
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="send-title"
      variant="sheet"
      dismissible={!saving}
      className="p-6 md:p-8 w-full max-w-2xl h-[90vh] md:h-auto md:max-h-[85vh] flex flex-col"
    >
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
        <button
          onClick={onClose}
          aria-label="Close"
          className="bg-stone-100 min-h-[44px] min-w-[44px] p-2.5 rounded-full hover:bg-stone-200 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6 px-1 -mx-1 pb-20 md:pb-1">
        {/* Order Type Toggle */}
        <div className="bg-stone-50 p-1 rounded-xl border border-stone-200 flex gap-1" role="group" aria-label="Order type">
          <button
            onClick={() => onOrderModeChange('dine_in')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
              orderMode === 'dine_in' ? 'bg-white shadow text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <MapPin className="w-4 h-4" aria-hidden="true" /> Dine-in
          </button>
          <button
            onClick={() => {
              onOrderModeChange('take_away');
              onSelectTableId('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
              orderMode === 'take_away' ? 'bg-white shadow text-ink' : 'text-ink-muted hover:text-ink'
            }`}
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
              onChange={(e) => onSelectTableId(e.target.value)}
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
              <p className="text-xs text-amber mt-2 font-medium">
                A new tab will open for Table {tableOptions.find(t => t.id === selectedTableId)?.tableNumber}.
              </p>
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
              onChange={(e) => onCustomerNameChange(e.target.value)}
            />
            <p className="text-xs text-ink-muted mt-2">Shown on the kitchen display so the team knows whose order it is.</p>
          </div>
        )}

        {/* Point of Sale Item Picker */}
        <div>
          <Input
            placeholder="Search menu..."
            value={menuSearch}
            onChange={(e) => onMenuSearchChange(e.target.value)}
            className="mb-3"
          />
          {categoryNames.length > 1 && (
            <div role="tablist" aria-label="Menu categories" className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
              {['all', ...categoryNames].map(name => {
                const active = menuCategory === name;
                return (
                  <button
                    key={name}
                    role="tab"
                    aria-selected={active}
                    onClick={() => onMenuCategoryChange(name)}
                    className={`shrink-0 whitespace-nowrap px-4 py-2.5 min-h-[44px] rounded-full border text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${
                      active ? 'bg-amber text-white border-amber' : 'bg-white text-ink-soft border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {name === 'all' ? 'All' : name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="max-h-72 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 border border-stone-200 rounded-xl p-2.5 bg-stone-50/50">
            {menuItems
              .filter(i => (menuCategory === 'all' || i.category?.name === menuCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase()))
              .map(item => {
                const inCart = cart.find(c => c.menuItemId === item.id);
                return (
                  <div key={item.id} className="min-h-[110px] flex flex-col justify-between p-3 rounded-xl bg-white border border-stone-200 shadow-sm">
                    <div className="min-w-0 mb-2">
                      <span className="font-semibold text-ink text-sm leading-tight block line-clamp-2" title={item.name}>{item.name}</span>
                      <span className="text-xs text-ink-muted font-medium mt-0.5 block">{formatCurrency(Number(item.price))}</span>
                    </div>
                    {inCart ? (
                      <div className="flex items-center justify-between bg-stone-100 rounded-lg p-0.5 w-full">
                        <button
                          onClick={() => onRemoveFromCart(item.id)}
                          aria-label={`Remove one ${item.name}`}
                          className="h-9 w-9 rounded-md bg-white shadow-sm text-ink-soft hover:text-ink flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                        >
                          <Minus className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <span className="font-bold text-sm text-center px-1 truncate" aria-live="polite">{inCart.quantity}</span>
                        <button
                          onClick={() => onAddToCart(item)}
                          aria-label={`Add one more ${item.name}`}
                          className="h-9 w-9 rounded-md bg-amber shadow-sm text-white hover:bg-amber-deep flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                        >
                          <Plus className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => onAddToCart(item)} className="font-bold w-full h-9 text-xs sm:text-sm border border-stone-200 bg-stone-50 hover:bg-amber-pale hover:text-amber-deep hover:border-amber/40">
                        <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Add<span className="sr-only"> {item.name}</span>
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
            <div className="font-semibold text-amber-deep mb-3 flex items-center">
              <ShoppingCart className="w-4 h-4 mr-2" aria-hidden="true" /> This ticket
            </div>
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

        <Input
          label="Notes for the kitchen (optional)"
          placeholder="e.g. extra spicy"
          value={specialInstructions}
          onChange={(e) => onSpecialInstructionsChange(e.target.value)}
        />
      </div>

      {/* Action Sheet Footer */}
      <div className="pt-4 border-t border-stone-200 mt-auto shrink-0 bg-white md:bg-transparent pb-safe md:pb-0">
        <Button
          className="w-full text-lg py-6"
          onClick={onSubmit}
          disabled={saving || cart.length === 0 || (orderMode === 'dine_in' && !selectedTableId)}
        >
          {saving ? 'Sending…' : `Send to kitchen (${formatCurrency(cartTotal)})`}
        </Button>
      </div>
    </Dialog>
  );
}
