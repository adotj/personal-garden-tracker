'use client';

import { cn } from '@/lib/utils';
import type { PlantEnvironment } from '@/lib/plant-environment';
import { PLANT_ENVIRONMENTS, plantEnvironmentLabel } from '@/lib/plant-environment';
import { Home, TreePine } from 'lucide-react';

type PlantEnvironmentPickerProps = {
  value: PlantEnvironment;
  onChange: (environment: PlantEnvironment) => void;
  disabled?: boolean;
  id?: string;
};

export function PlantEnvironmentPicker({
  value,
  onChange,
  disabled = false,
  id = 'plant-environment',
}: PlantEnvironmentPickerProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-desert-dust dark:text-zinc-400">
        Garden zone
      </p>
      <div
        id={id}
        className={cn(
          'flex w-full rounded-xl border-2 border-desert-border bg-desert-dune/50 p-1 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/90',
          disabled && 'pointer-events-none opacity-60',
        )}
        role="tablist"
        aria-label="Garden zone"
      >
        {PLANT_ENVIRONMENTS.map((zone) => {
          const active = value === zone;
          return (
            <button
              key={zone}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => onChange(zone)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-oasis text-white shadow-sm'
                  : 'text-desert-sage hover:bg-desert-mist/80 dark:text-zinc-300 dark:hover:bg-zinc-800',
              )}
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
  );
}
