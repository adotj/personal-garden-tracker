'use client';

import type { FertilizerSeason } from '@/lib/plant-types';
import { ALL_FERTILIZER_SEASONS, seasonLabel } from '@/lib/fertilizer-schedule';
import { cn } from '@/lib/utils';

type Props = {
  value: FertilizerSeason[];
  onChange: (seasons: FertilizerSeason[]) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function FertilizerSeasonCheckboxes({ value, onChange, disabled, idPrefix = 'fert-season' }: Props) {
  const set = new Set(value);

  const toggle = (s: FertilizerSeason) => {
    if (disabled) return;
    const next = new Set(set);
    if (next.has(s)) {
      next.delete(s);
      if (next.size === 0) return;
    } else {
      next.add(s);
    }
    onChange(ALL_FERTILIZER_SEASONS.filter((x) => next.has(x)));
  };

  return (
    <div className="flex flex-wrap gap-3">
      {ALL_FERTILIZER_SEASONS.map((s) => {
        const checked = set.has(s);
        return (
          <label
            key={s}
            htmlFor={`${idPrefix}-${s}`}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              checked
                ? 'border-oasis bg-oasis/10 text-oasis dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'border-desert-border bg-white/40 text-desert-sage dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              id={`${idPrefix}-${s}`}
              type="checkbox"
              className="h-4 w-4 rounded border-desert-border text-oasis focus:ring-oasis/30"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(s)}
            />
            {seasonLabel(s)}
          </label>
        );
      })}
    </div>
  );
}
