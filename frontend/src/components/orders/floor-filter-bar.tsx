'use client';

import { Search, X } from 'lucide-react';

interface FloorFilterBarProps {
  search: string;
  onSearchChange: (search: string) => void;
  statusFilter: 'all' | 'available' | 'occupied';
  onStatusFilterChange: (status: 'all' | 'available' | 'occupied') => void;
  sectionFilter: string;
  onSectionFilterChange: (section: string) => void;
  capacityFilter: string;
  onCapacityFilterChange: (capacity: string) => void;
  availableSections: string[];
  totalCount: number;
  availableCount: number;
  occupiedCount: number;
}

export function FloorFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sectionFilter,
  onSectionFilterChange,
  capacityFilter,
  onCapacityFilterChange,
  availableSections,
  totalCount,
  availableCount,
  occupiedCount,
}: FloorFilterBarProps) {
  return (
    <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200">
      {/* Top row: Search input & Status quick filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search table #, section, or tag..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-stone-200 rounded-xl text-ink placeholder:text-ink-muted focus:outline-none focus:border-amber"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
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
            onClick={() => onStatusFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('available')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              statusFilter === 'available'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Available ({availableCount})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('occupied')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              statusFilter === 'occupied'
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
              onClick={() => onSectionFilterChange('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                sectionFilter === 'all'
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
                onClick={() => onSectionFilterChange(sec === sectionFilter ? 'all' : sec)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  sectionFilter === sec
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
              onClick={() => onCapacityFilterChange(cap)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                capacityFilter === cap
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
  );
}
