import React from 'react';
import { RefreshCw, Menu, Plus } from 'lucide-react';

const DATE_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
];

const SOURCE_LABELS = {
  ALL: 'All sources',
  DEMO_ONLY: 'Seed demo data only',
  IMPORTED_ONLY: 'Uploaded datasets only',
};

const selectClass =
  'h-9 rounded-lg border border-edge bg-black/[0.04] px-2.5 text-sm text-fg transition-colors duration-150 hover:border-black/25 [color-scheme:light]';

export default function Header({
  pageTitle = 'Overview',
  pageSubtitle = '',
  stores = [],
  selectedStore = 'ALL',
  onSelectStore,
  selectedDateRange = 'last30',
  onSelectDateRange,
  batches = [],
  selectedBatch = 'ALL',
  onSelectBatch,
  onRefresh,
  isRefreshing = false,
  onOpenMobileMenu,
  onOpenSubmit,
  hideFilters = false,
}) {
  return (
    <header className="z-30 lg:sticky lg:top-0 border-b border-edge bg-white/80 px-4 py-4 backdrop-blur lg:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-dim hover:bg-black/[0.07] lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 mr-auto">
          <h1 className="truncate text-[22px] font-semibold leading-7 tracking-tight text-fg">{pageTitle}</h1>
          {pageSubtitle && <p className="truncate text-[14px] text-dim">{pageSubtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!hideFilters && (
            <>
              <label className="sr-only" htmlFor="filter-store">
                Store
              </label>
              <select
                id="filter-store"
                className={`${selectClass} max-w-56`}
                value={selectedStore}
                onChange={(e) => onSelectStore(e.target.value)}
              >
                <option value="ALL">All stores ({stores.length})</option>
                {(stores || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="filter-period">
                Period
              </label>
              <select
                id="filter-period"
                className={selectClass}
                value={selectedDateRange}
                onChange={(e) => onSelectDateRange(e.target.value)}
              >
                {DATE_RANGES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="filter-source">
                Data source
              </label>
              <select
                id="filter-source"
                className={`${selectClass} max-w-48`}
                value={selectedBatch}
                onChange={(e) => onSelectBatch(e.target.value)}
              >
                {Object.entries(SOURCE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.filename}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-edge bg-black/[0.04] px-3 text-sm font-medium text-fg transition-colors duration-150 hover:border-black/25 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onOpenSubmit}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan px-3.5 text-sm font-semibold text-white transition duration-150 hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Add a comment
          </button>
        </div>
      </div>
    </header>
  );
}
