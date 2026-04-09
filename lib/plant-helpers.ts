import type { FertilizerSeason, Plant, SunExposure } from '@/lib/plant-types';
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
 * Writable columns present in a typical `plants` table after repo migrations.
 * Does not include `species` / `location_in_garden` until you run
 * `20260415120000_plants_species_location.sql` and add those keys here.
 */
export function plantUpdatePayload(p: Plant) {
  return {
    name: p.name,
    container_type: p.container_type,
    pot_size: p.pot_size,
    sun_exposure: normalizeSunExposure(p.sun_exposure),
    watering_frequency_days: p.watering_frequency_days,
    last_watered: p.last_watered?.trim() || null,
    fertilizer_frequency_days: p.fertilizer_frequency_days,
    last_fertilized: p.last_fertilized?.trim() || null,
    fertilizer_seasons: normalizeFertilizerSeasons(p.fertilizer_seasons),
    fertilizer_notes: p.fertilizer_notes ?? null,
    photo_url: p.photo_url ?? null,
  };
}

/**
 * Minimal insert: columns that exist on older `plants` tables before sun/fertilizer migrations.
 * Extended fields are applied in a second `.update()` via {@link plantInsertExtendedPatch}.
 */
export function plantInsertCorePayload(input: {
  name: string;
  container_type: string;
  pot_size: string;
  watering_frequency_days: number;
  last_watered: string;
  last_fertilized: string;
  photo_url: string | null;
}) {
  const today = new Date().toISOString().split('T')[0];
  return {
    name: input.name.trim(),
    container_type: input.container_type,
    pot_size: input.pot_size,
    watering_frequency_days: input.watering_frequency_days,
    // Older schemas often use NOT NULL dates without defaults; avoid null on insert.
    last_watered: input.last_watered.trim() || today,
    last_fertilized: input.last_fertilized.trim() || today,
    photo_url: input.photo_url ?? null,
  };
}

/** Sun + fertilizer columns from later migrations — best-effort `.update()` after insert. */
export function plantInsertExtendedPatch(input: {
  sun_exposure: SunExposure | null | undefined;
  fertilizer_frequency_days: number;
  fertilizer_seasons: FertilizerSeason[] | null | undefined;
  fertilizer_notes: string;
}) {
  return {
    sun_exposure: normalizeSunExposure(input.sun_exposure),
    fertilizer_frequency_days: input.fertilizer_frequency_days,
    fertilizer_seasons: normalizeFertilizerSeasons(input.fertilizer_seasons),
    fertilizer_notes: input.fertilizer_notes.trim() || null,
  };
}
