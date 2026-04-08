'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type GardenPlantsToolbarProps = {
  totalPlantCount: number;
  isDemoMode: boolean;
  plantSearch: string;
  onPlantSearchChange: (value: string) => void;
};

/**
 * Standalone toolbar using a native search input so filtering always works in the DOM
 * even if the design-system Input wrapper behaves differently in some environments.
 */
export function GardenPlantsToolbar({
  totalPlantCount,
  isDemoMode,
  plantSearch,
  onPlantSearchChange,
}: GardenPlantsToolbarProps) {
  return (
    <section
      className="mb-8 w-full rounded-2xl border-2 border-desert-border bg-desert-parchment p-4 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 sm:p-5"
      aria-label="Plant search and count"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-desert-dust dark:text-zinc-500">
            Plants in your garden
          </p>
          <p className="mt-1 text-3xl font-bold leading-none text-oasis dark:text-emerald-400" aria-live="polite">
            {totalPlantCount}
            <span className="text-lg font-semibold text-desert-sage dark:text-zinc-400">
              {' '}
              {totalPlantCount === 1 ? 'plant' : 'plants'}
              {isDemoMode ? ' (demo)' : ''}
            </span>
          </p>
        </div>

        <div className="relative min-h-[44px] w-full min-w-0 max-w-xl flex-1">
          <label htmlFor="garden-plant-search" className="sr-only">
            Search plants by name
          </label>
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-desert-dust dark:text-zinc-500">
            <Search className="h-5 w-5" aria-hidden />
          </span>
          <input
            id="garden-plant-search"
            type="search"
            name="garden-plant-search"
            value={plantSearch}
            onChange={(e) => onPlantSearchChange(e.target.value)}
            placeholder="Search plants by name..."
            autoComplete="off"
            spellCheck={false}
            className="box-border h-11 w-full min-h-[44px] rounded-lg border-2 border-desert-border bg-white pl-11 pr-12 text-base text-desert-ink shadow-inner outline-none placeholder:text-desert-dust focus:border-oasis focus:ring-2 focus:ring-oasis/30 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/30"
          />
          {plantSearch.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 z-[1] h-9 w-9 -translate-y-1/2"
              onClick={() => onPlantSearchChange('')}
              aria-label="Clear search"
            >
              <X className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
