import { format, isSameDay, isValid, parseISO } from 'date-fns';
import type { FertilizerSeason, Plant, SunExposure } from '@/lib/plant-types';
import { normalizeFertilizerSeasons } from '@/lib/fertilizer-schedule';

const SUN_EXPOSURE_SET = new Set<string>(['full_sun', 'partial_sun', 'partial_shade', 'full_shade']);

/** UTC instant when the user taps “watered” (store in DB as timestamptz when supported). */
export function wateringLoggedAtIso(): string {
  return new Date().toISOString();
}

function isDateOnlyIsoString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

/**
 * Show last watered/fertilized: calendar-only values stay date-only; full ISO shows local time too.
 */
export function formatPlantCareInstant(iso: string | null, variant: 'card' | 'profile'): string {
  if (!iso?.trim()) return 'Never';
  const s = iso.trim();
  const d = parseISO(s);
  if (!isValid(d)) return 'Never';
  if (isDateOnlyIsoString(s)) {
    return variant === 'card' ? format(d, 'MMM d') : format(d, 'MMMM d, yyyy');
  }
  return variant === 'card' ? format(d, 'MMM d, h:mm a') : format(d, 'MMMM d, yyyy • h:mm a');
}

/** True when a stored care date/timestamp falls on the user's local current day. */
export function isPlantCareDateToday(iso: string | null | undefined): boolean {
  if (!iso?.trim()) return false;
  const parsed = parseISO(iso.trim());
  if (!isValid(parsed)) return false;
  return isSameDay(parsed, new Date());
}

/** `type="date"` input value from a stored date or ISO timestamp. */
export function isoOrDateToDateInputValue(s: string | null | undefined): string {
  if (!s?.trim()) return '';
  const t = s.trim();
  if (t.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return '';
}

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
/** Columns that exist on older schemas and are safe to update first. */
export function plantUpdateCorePayload(p: Plant) {
  return {
    name: p.name,
    container_type: p.container_type,
    pot_size: p.pot_size,
    watering_frequency_days: p.watering_frequency_days,
    last_watered: p.last_watered?.trim() || null,
    last_fertilized: p.last_fertilized?.trim() || null,
    photo_url: p.photo_url ?? null,
  };
}

/** Columns added by newer migrations; apply as best-effort patch after core update. */
export function plantUpdateExtendedPatch(p: Plant) {
  return {
    sun_exposure: normalizeSunExposure(p.sun_exposure),
    fertilizer_frequency_days: p.fertilizer_frequency_days,
    fertilizer_seasons: normalizeFertilizerSeasons(p.fertilizer_seasons),
    fertilizer_notes: p.fertilizer_notes ?? null,
  };
}

export function plantUpdatePayload(p: Plant) {
  return {
    ...plantUpdateCorePayload(p),
    ...plantUpdateExtendedPatch(p),
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
