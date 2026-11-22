'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuCategory, MenuItem } from './types';

interface MenuItemModalProps {
  open: boolean;
  onClose: () => void;
  item: MenuItem | null; // null means adding a new item
  categories: MenuCategory[];
  form: {
    name: string;
    description: string;
    price: string;
    categoryId: string;
    tags: string;
  };
  onFormChange: (form: {
    name: string;
    description: string;
    price: string;
    categoryId: string;
    tags: string;
  }) => void;
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
            className="bg-white rounded-2xl p-8 max-w-md w-full"
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
              <Input
                label="Price (₹)"
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
              <Input
                label="Tags (comma separated)"
                placeholder="veg, spicy, popular"
                value={form.tags}
                onChange={(e) => onFormChange({ ...form, tags: e.target.value })}
              />
              <div className="flex gap-3 pt-4">
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
