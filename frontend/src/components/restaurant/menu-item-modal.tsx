'use client';

import { useState } from 'react';
import { X, Upload, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuCategory, MenuItem, MenuItemVariant } from './types';

export interface MenuItemFormData {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  tags: string;
  imageUrl?: string;
  variants?: MenuItemVariant[];
}

interface MenuItemModalProps {
  open: boolean;
  onClose: () => void;
  item: MenuItem | null; // null means adding a new item
  categories: MenuCategory[];
  form: MenuItemFormData;
  onFormChange: (form: MenuItemFormData) => void;
  saving: boolean;
  onSubmit: () => void;
}

export function MenuItemModal({
  open,
  onClose,
  item,
  categories,
  form,
  onFormChange,
  saving,
  onSubmit,
}: MenuItemModalProps) {
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState('');

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Please select an image smaller than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      onFormChange({ ...form, imageUrl: result });
    };
    reader.readAsDataURL(file);
  };

  const handleAddVariant = () => {
    if (!newVariantName.trim() || !newVariantPrice || Number(newVariantPrice) <= 0) return;
    const variants = [...(form.variants || []), { name: newVariantName.trim(), price: parseFloat(newVariantPrice) }];
    onFormChange({ ...form, variants });
    setNewVariantName('');
    setNewVariantPrice('');
  };

  const handleRemoveVariant = (index: number) => {
    const variants = (form.variants || []).filter((_, i) => i !== index);
    onFormChange({ ...form, variants });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl p-6 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-2xl font-bold">
                {item ? 'Edit Menu Item' : 'Add Menu Item'}
              </h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Dish Photo Upload / Preview */}
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                  Dish Image
                </label>
                {form.imageUrl ? (
                  <div className="relative w-full h-36 bg-stone-100 rounded-xl overflow-hidden border border-stone-200 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.imageUrl}
                      alt="Menu item preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => onFormChange({ ...form, imageUrl: '' })}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
                      aria-label="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-stone-200 hover:border-amber rounded-xl cursor-pointer bg-stone-50/50 hover:bg-stone-50 transition-colors">
                    <div className="flex flex-col items-center justify-center py-3 text-ink-muted">
                      <Upload className="w-6 h-6 mb-1 text-amber" />
                      <p className="text-xs font-semibold">Upload photo or drag & drop</p>
                      <p className="text-[11px] text-stone-400">PNG, JPG, WEBP up to 2MB</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageFileChange}
                    />
                  </label>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    placeholder="Or paste image URL (e.g. https://...)"
                    value={form.imageUrl?.startsWith('data:') ? '' : form.imageUrl || ''}
                    onChange={(e) => onFormChange({ ...form, imageUrl: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              <Input
                label="Item Name"
                placeholder="Butter Chicken"
                value={form.name}
                onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              />
              <Input
                label="Description"
                placeholder="Creamy north Indian curry..."
                value={form.description}
                onChange={(e) => onFormChange({ ...form, description: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Base Price (₹)"
                  type="number"
                  placeholder="350"
                  value={form.price}
                  onChange={(e) => onFormChange({ ...form, price: e.target.value })}
                />
                <Select
                  label="Category"
                  value={form.categoryId}
                  onChange={(e) => onFormChange({ ...form, categoryId: e.target.value })}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>

              <Input
                label="Tags (comma separated)"
                placeholder="veg, spicy, popular"
                value={form.tags}
                onChange={(e) => onFormChange({ ...form, tags: e.target.value })}
              />

              {/* Variants Section */}
              <div className="border-t border-stone-100 pt-4">
                <label className="block text-xs font-semibold text-ink-muted mb-2">
                  Portion Sizes / Variants (Optional)
                </label>

                {form.variants && form.variants.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {form.variants.map((v, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-sm"
                      >
                        <span className="font-medium text-ink">{v.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber">₹{v.price}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(idx)}
                            className="text-stone-400 hover:text-terra p-1"
                            aria-label={`Remove ${v.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Variant (e.g. Half / Large)"
                    value={newVariantName}
                    onChange={(e) => setNewVariantName(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber"
                  />
                  <input
                    type="number"
                    placeholder="Price (₹)"
                    value={newVariantPrice}
                    onChange={(e) => setNewVariantPrice(e.target.value)}
                    className="w-24 px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-amber"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleAddVariant}
                    className="text-xs h-8 px-2.5 bg-stone-100 hover:bg-stone-200"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-stone-100">
                <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="terra" className="flex-1" onClick={onSubmit} disabled={saving}>
                  {saving ? (item ? 'Saving...' : 'Creating...') : item ? 'Save Changes' : 'Add Item'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
