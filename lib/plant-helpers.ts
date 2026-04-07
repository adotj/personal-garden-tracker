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
