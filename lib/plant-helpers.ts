import type { Plant, SunExposure } from '@/lib/plant-types';
import { normalizeFertilizerSeasons } from '@/lib/fertilizer-schedule';

const SUN_EXPOSURE_SET = new Set<string>(['full_sun', 'partial_sun', 'partial_shade', 'full_shade']);

export function normalizeSunExposure(raw: unknown): SunExposure {
  const s = typeof raw === 'string' ? raw : '';
  if (SUN_EXPOSURE_SET.has(s)) return s as SunExposure;
  return 'full_sun';
}

export function normalizePlantRow(row: Plant): Plant {
  return {
    ...row,
    watering_frequency_days: Number(row.watering_frequency_days) || 7,
    fertilizer_frequency_days: Number(row.fertilizer_frequency_days) || 30,
    last_watered: row.last_watered ?? null,
    last_fertilized: row.last_fertilized ?? null,
    fertilizer_seasons: normalizeFertilizerSeasons(row.fertilizer_seasons),
    fertilizer_notes: row.fertilizer_notes ?? null,
    notes: row.notes ?? null,
    sun_exposure: normalizeSunExposure(row.sun_exposure),
  };
}

/**
 * Only columns the edit flow actually persists — do not spread select('*') rows into .update()
 * (avoids `id`, `created_at`, etc.). Omit columns your DB may not have yet (`species`,
 * `location_in_garden`) if needed.
 */
export function plantUpdatePayload(p: Plant) {
  return {
    name: p.name,
    container_type: p.container_type,
    pot_size: p.pot_size,
    sun_exposure: normalizeSunExposure(p.sun_exposure),
    watering_frequency_days: p.watering_frequency_days,
    last_watered: p.last_watered,
    fertilizer_frequency_days: p.fertilizer_frequency_days,
    last_fertilized: p.last_fertilized,
    fertilizer_seasons: normalizeFertilizerSeasons(p.fertilizer_seasons),
    fertilizer_notes: p.fertilizer_notes ?? null,
    photo_url: p.photo_url ?? null,
  };
}
