import type { Plant } from '@/lib/plant-types';

export function normalizePlantRow(row: Plant): Plant {
  return {
    ...row,
    watering_frequency_days: Number(row.watering_frequency_days) || 7,
    fertilizer_frequency_days: Number(row.fertilizer_frequency_days) || 30,
    last_watered: row.last_watered ?? null,
    last_fertilized: row.last_fertilized ?? null,
  };
}

/**
 * Only columns the edit flow actually persists — do not spread select('*') rows into .update()
 * (avoids `id`, `created_at`, etc.) and omit optional columns your DB may not have yet (`species`,
 * `notes`, `location_in_garden`) so PostgREST does not return 400 for unknown columns.
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
    photo_url: p.photo_url ?? null,
  };
}
