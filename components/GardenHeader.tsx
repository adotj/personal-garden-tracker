'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { GardenWeather } from '@/lib/garden-types';
import { usdaHardinessZoneLabel } from '@/lib/garden-site';
import { Button } from '@/components/ui/button';
import type { PlantEnvironment } from '@/lib/plant-environment';
import { plantEnvironmentEmoji, plantEnvironmentLabel } from '@/lib/plant-environment';
import { CalendarRange, Copy, Droplet, Home, Moon, Search, Sun, Sun as SunIcon, TreePine, X } from 'lucide-react';

type GardenHeaderProps = {
  activeEnvironment: PlantEnvironment;
  onEnvironmentChange: (environment: PlantEnvironment) => void;
  darkMode: boolean;
  isDemoMode: boolean;
  isGardenHeaderCollapsed: boolean;
  totalPlantCount: number;
  fertDueThisMonthOnly: boolean;
  onToggleFertDueThisMonthOnly: () => void;
  onCopyAllPlantNames: () => void;
  copyNamesDisabled: boolean;
  plantSearch: string;
  onPlantSearchChange: (value: string) => void;
  onClearPlantSearch: () => void;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  addPlantDialog: ReactNode;
};

type GardenWeatherProps = {
  weather: GardenWeather | null;
  showRainyDayButton: boolean;
  onMarkAllWateredToday: () => void;
  rainyDayDisabled: boolean;
};

export function GardenHeader({
  activeEnvironment,
  onEnvironmentChange,
  darkMode,
  isDemoMode,
  isGardenHeaderCollapsed,
  totalPlantCount,
  fertDueThisMonthOnly,
  onToggleFertDueThisMonthOnly,
  onCopyAllPlantNames,
  copyNamesDisabled,
  plantSearch,
  onPlantSearchChange,
  onClearPlantSearch,
  onToggleDarkMode,
  onLogout,
  addPlantDialog,
}: GardenHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-desert-parchment/95 backdrop-blur border-b border-desert-border">
      <div
        className={cn(
          'max-w-7xl mx-auto px-6 flex flex-wrap justify-between items-center gap-3 transition-[padding] duration-300',
          isGardenHeaderCollapsed ? 'py-2' : 'py-4',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn(
              'shrink-0 transition-[font-size] duration-300',
              isGardenHeaderCollapsed ? 'text-2xl' : 'text-4xl',
            )}
          >
            {plantEnvironmentEmoji(activeEnvironment)}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <div
              className={cn(
                'font-bold tracking-tighter text-oasis transition-[font-size] duration-300',
                isGardenHeaderCollapsed ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl',
              )}
            >
              Laveen Garden
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full border border-desert-border/50 bg-desert-dune/40 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-oasis transition-all duration-300',
                isGardenHeaderCollapsed && 'max-w-0 overflow-hidden border-transparent px-0 py-0 opacity-0',
              )}
              aria-label={`${totalPlantCount} plants in your garden`}
            >
              {totalPlantCount} {totalPlantCount === 1 ? 'plant' : 'plants'}
              {isDemoMode ? ' · demo' : ''}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full border border-desert-border/50 bg-desert-dune/40 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-oasis transition-all duration-300',
                isGardenHeaderCollapsed && 'max-w-0 overflow-hidden border-transparent px-0 py-0 opacity-0',
              )}
              title="USDA Plant Hardiness Zone"
            >
              {usdaHardinessZoneLabel()}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" onClick={onToggleDarkMode}>
            {darkMode ? <SunIcon className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button variant="outline" size="sm" onClick={onLogout}>Logout</Button>
          {addPlantDialog}
        </div>
      </div>

      <div className="max-w-7xl mx-auto border-t border-desert-border/40 px-4 pb-3 pt-3 sm:px-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-desert-dust dark:text-zinc-400">
          Garden zone
        </p>
        <div
          className="flex w-full rounded-xl border-2 border-desert-border bg-desert-dune/50 p-1 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/90"
          role="tablist"
          aria-label="Garden zone"
        >
          {(['outdoor', 'indoor'] as const).map((zone) => {
            const active = activeEnvironment === zone;
            return (
              <button
                key={zone}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-oasis text-white shadow-md ring-1 ring-oasis/40'
                    : 'text-desert-ink/80 hover:bg-desert-mist/50 dark:text-zinc-200 dark:hover:bg-zinc-800',
                )}
                onClick={() => onEnvironmentChange(zone)}
              >
                {zone === 'outdoor' ? (
                  <TreePine className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Home className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {plantEnvironmentLabel(zone)}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          'max-w-7xl mx-auto bg-gradient-to-b from-desert-dune/35 to-desert-dune/10 px-4 dark:from-desert-dune/80 dark:to-desert-page/50 sm:px-6 transition-all duration-300 overflow-hidden',
          isGardenHeaderCollapsed
            ? 'max-h-0 border-t-0 pb-0 pt-0 opacity-0'
            : 'max-h-[320px] border-t border-desert-border/30 pb-3 pt-3 opacity-100',
        )}
        aria-hidden={isGardenHeaderCollapsed}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" role="status" aria-live="polite">
            <span className="text-xl font-semibold tabular-nums text-oasis sm:text-2xl">
              {totalPlantCount}
            </span>
            <span className="text-sm text-desert-sage">
              {totalPlantCount === 1 ? 'plant' : 'plants'} in your {activeEnvironment === 'indoor' ? 'indoor' : 'outdoor'}{' '}
              garden
              {isDemoMode ? ' · demo' : ''}
            </span>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-2xl sm:flex-row sm:items-center">
            <Button
              type="button"
              variant={fertDueThisMonthOnly ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-10 shrink-0 rounded-full px-3 text-xs sm:text-sm',
                fertDueThisMonthOnly && 'bg-amber-600 text-white hover:bg-amber-700',
              )}
              onClick={onToggleFertDueThisMonthOnly}
            >
              <CalendarRange className="mr-1.5 h-4 w-4" />
              Due this month
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0 rounded-full px-3 text-xs sm:text-sm"
              onClick={onCopyAllPlantNames}
              disabled={copyNamesDisabled}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Copy names
            </Button>
            <div className="relative min-w-0 flex-1">
              <label htmlFor="garden-plant-filter" className="sr-only">
                Search plants by name
              </label>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-desert-dust opacity-80"
                aria-hidden
              />
              <input
                id="garden-plant-filter"
                name="garden-plant-filter"
                type="search"
                value={plantSearch}
                onChange={(e) => onPlantSearchChange(e.target.value)}
                placeholder="Search plants by name…"
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  'h-10 w-full rounded-full border border-desert-border/50 bg-desert-parchment/70 pl-10 text-sm text-desert-ink shadow-sm',
                  'placeholder:text-desert-dust/65',
                  'transition-[box-shadow,border-color] duration-200',
                  'focus:border-oasis focus:outline-none focus:ring-2 focus:ring-oasis/25',
                  'dark:border-desert-border dark:bg-desert-page/55 dark:text-desert-ink dark:placeholder:text-desert-dust/70',
                  'dark:focus:border-oasis dark:focus:ring-oasis/25',
                  plantSearch.length > 0 ? 'pr-11' : 'pr-4',
                )}
              />
              {plantSearch.length > 0 ? (
                <button
                  type="button"
                  onClick={onClearPlantSearch}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-desert-dust transition-colors hover:bg-desert-mist/60 hover:text-desert-ink dark:hover:bg-desert-mist/40 dark:hover:text-desert-ink"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function GardenWeather({
  weather,
  showRainyDayButton,
  onMarkAllWateredToday,
  rainyDayDisabled,
}: GardenWeatherProps) {
  if (!weather) return null;
  const isHot = weather.temperature >= 105;
  const isVeryHot = weather.temperature >= 110;
  return (
    <section
      className={cn(
        'mb-10 overflow-hidden rounded-3xl border border-desert-border/80 shadow-sm',
        'bg-gradient-to-br from-desert-parchment via-desert-parchment to-desert-dune/60',
        isVeryHot && 'ring-1 ring-orange-500/40',
      )}
      aria-label="Laveen weather"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-desert-border/40 px-5 py-3 sm:px-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-desert-dust">Laveen · America/Phoenix</p>
          <p className="text-sm text-desert-sage">3-day outlook for watering adjustments</p>
        </div>
        {showRainyDayButton ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 rounded-xl px-3 text-xs sm:text-sm"
            onClick={onMarkAllWateredToday}
            disabled={rainyDayDisabled}
          >
            <Droplet className="mr-1.5 h-4 w-4" />
            Rainy Day
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-5 py-6 sm:px-7">
        <div className="flex items-end gap-4">
          <Sun
            className={cn(
              'mb-1 h-10 w-10 shrink-0 sm:h-12 sm:w-12',
              isVeryHot ? 'text-orange-600' : isHot ? 'text-amber-500' : 'text-amber-400',
            )}
            aria-hidden
          />
          <div>
            <div className="font-heading text-5xl font-light tracking-tight text-desert-ink sm:text-6xl">
              {weather.temperature}
              <span className="text-3xl text-desert-dust">°F</span>
            </div>
            <div className="text-lg text-desert-sage sm:text-xl">{weather.condition}</div>
          </div>
        </div>
        <div className="space-y-1 text-sm text-desert-dust">
          <p>Wind {weather.windSpeed} mph</p>
          {isHot ? (
            <p className={cn('font-medium', isVeryHot ? 'text-orange-700 dark:text-orange-300' : 'text-amber-800 dark:text-amber-300')}>
              {isVeryHot ? 'Extreme heat — containers dry fast' : 'Heat advisory range — check thirsty pots'}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-desert-border/40 bg-desert-dune/25 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
        {weather.forecast?.map((day, index) => (
          <div
            key={`${day.date}-${index}`}
            className="rounded-2xl border border-desert-border/50 bg-desert-parchment/80 px-2 py-3 text-center sm:px-3 sm:py-4"
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-desert-dust">{day.date}</div>
            <div className="mb-2 text-2xl sm:text-3xl" aria-hidden>
              {day.icon}
            </div>
            <div className="font-heading text-xl font-light text-desert-ink sm:text-2xl">{day.high}°</div>
            <div className="text-xs text-desert-dust sm:text-sm">{day.low}°</div>
            <div className="mt-1 text-[10px] text-desert-sage sm:text-xs">{day.condition}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
