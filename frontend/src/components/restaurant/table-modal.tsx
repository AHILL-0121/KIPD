'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import type { Table } from './types';

interface TableModalProps {
  open: boolean;
  onClose: () => void;
  table: Table | null; // null means adding a new table
  form: {
    tableNumber: string;
    capacity: string;
    section: string;
    tags: string;
  };
  onFormChange: (form: {
    tableNumber: string;
    capacity: string;
    section: string;
    tags: string;
  }) => void;
  saving: boolean;
  onSubmit: () => void;
}

export function TableModal({
  open,
  onClose,
  table,
  form,
  onFormChange,
  saving,
  onSubmit,
}: TableModalProps) {
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
                {table ? 'Edit Table' : 'Add Table'}
              </h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Input
                label="Table Number"
                placeholder="1, 2, A1..."
                value={form.tableNumber}
                onChange={(e) => onFormChange({ ...form, tableNumber: e.target.value })}
              />
              <Input
                label="Seating Capacity"
                type="number"
                placeholder="4"
                value={form.capacity}
                onChange={(e) => onFormChange({ ...form, capacity: e.target.value })}
              />
              <Input
                label="Section / Area (optional)"
                placeholder="e.g. AC Dine-in, Outdoor Patio, Main Hall"
                value={form.section}
                onChange={(e) => onFormChange({ ...form, section: e.target.value })}
              />
              <Input
                label="Tags (comma-separated, optional)"
                placeholder="e.g. Window, Booth, Garden View"
                value={form.tags}
                onChange={(e) => onFormChange({ ...form, tags: e.target.value })}
              />
              {!table && (
                <p className="text-xs text-ink-muted">
                  A QR code link will be automatically generated for this table, allowing guests to scan and order directly.
                </p>
              )}
              <div className="flex gap-3 pt-4">
                <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="terra" className="flex-1" onClick={onSubmit} disabled={saving}>
                  {saving ? (table ? 'Saving...' : 'Creating...') : table ? 'Save Changes' : 'Add Table'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
