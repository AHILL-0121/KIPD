'use client';

import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuCategory } from './types';

interface CategoryModalProps {
  open: boolean;
  onClose: () => void;
  categories: MenuCategory[];
  categoryName: string;
  onCategoryNameChange: (name: string) => void;
  saving: boolean;
  onCreateCategory: () => void;
  onDeleteCategory: (id: string) => void;
}

export function CategoryModal({
  open,
  onClose,
  categories,
  categoryName,
  onCategoryNameChange,
  saving,
  onCreateCategory,
  onDeleteCategory,
}: CategoryModalProps) {
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
              <h2 className="font-serif text-2xl font-bold">Menu Categories</h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {categories.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-sm"
                    >
                      <span className="font-medium">{cat.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 h-7"
                        onClick={() => onDeleteCategory(cat.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <hr />
              <Input
                label="New Category Name"
                placeholder="Starters, Mains, Desserts..."
                value={categoryName}
                onChange={(e) => onCategoryNameChange(e.target.value)}
              />
              <div className="flex gap-3 pt-2">
                <Button variant="ghost" className="flex-1" onClick={onClose}>
                  Close
                </Button>
                <Button
                  variant="terra"
                  className="flex-1"
                  onClick={onCreateCategory}
                  disabled={saving}
                >
                  {saving ? 'Creating...' : 'Add Category'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
