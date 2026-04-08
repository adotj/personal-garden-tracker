import type { Plant } from '@/lib/plant-types';
import { normalizeFertilizerSeasons } from '@/lib/fertilizer-schedule';

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
    watering_frequency_days: p.watering_frequency_days,
    last_watered: p.last_watered,
    fertilizer_frequency_days: p.fertilizer_frequency_days,
    last_fertilized: p.last_fertilized,
    fertilizer_seasons: normalizeFertilizerSeasons(p.fertilizer_seasons),
    fertilizer_notes: p.fertilizer_notes ?? null,
    notes: p.notes?.trim() ? p.notes.trim() : null,
    photo_url: p.photo_url ?? null,
  };
}
