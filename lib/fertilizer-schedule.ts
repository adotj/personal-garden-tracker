import { addDays, format, isSameMonth, isValid, parseISO, startOfDay } from 'date-fns';
import type { FertilizerSeason, Plant } from '@/lib/plant-types';

/** Northern hemisphere month groups (calendar month 1–12) */
export const SEASON_MONTHS: Record<FertilizerSeason, readonly number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  fall: [9, 10, 11],
};

export const FERTILIZER_SEASON_ORDER: FertilizerSeason[] = ['winter', 'spring', 'summer', 'fall'];

export const ALL_FERTILIZER_SEASONS: FertilizerSeason[] = [...FERTILIZER_SEASON_ORDER];

const SEASON_SET = new Set<string>(FERTILIZER_SEASON_ORDER);

export function normalizeFertilizerSeasons(raw: unknown): FertilizerSeason[] {
  let arr: string[] = [];
  if (raw == null) return [...ALL_FERTILIZER_SEASONS];
  if (Array.isArray(raw)) arr = raw.map((x) => String(x).toLowerCase().trim());
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      arr = Array.isArray(p) ? p.map((x) => String(x).toLowerCase().trim()) : [];
    } catch {
      arr = [];
    }
  }
  const out: FertilizerSeason[] = [];
  for (const s of arr) {
    if (SEASON_SET.has(s)) out.push(s as FertilizerSeason);
  }
  if (out.length === 0) return [...ALL_FERTILIZER_SEASONS];
  return [...new Set(out)].sort(
    (a, b) => FERTILIZER_SEASON_ORDER.indexOf(a) - FERTILIZER_SEASON_ORDER.indexOf(b),
  );
}

export function allowedFertilizerMonths(seasons: FertilizerSeason[]): Set<number> {
  const months = new Set<number>();
  for (const se of seasons) {
    for (const m of SEASON_MONTHS[se]) months.add(m);
  }
  return months;
}

export function dateInFertilizerSeasons(d: Date, seasons: FertilizerSeason[]): boolean {
  return allowedFertilizerMonths(seasons).has(d.getMonth() + 1);
}

/** Earliest calendar day on or after `from` that lies in an allowed fertilizer month */
export function snapToAllowedFertilizerDay(from: Date, seasons: FertilizerSeason[]): Date {
  const months = allowedFertilizerMonths(seasons);
  const x = startOfDay(from);
  for (let i = 0; i < 800; i++) {
    if (months.has(x.getMonth() + 1)) return new Date(x);
    x.setDate(x.getDate() + 1);
  }
  return startOfDay(from);
}

/**
 * Next suggested application date: last_fertilized + interval, snapped into an allowed season.
 * Computed on the fly (not stored).
 */
export function computeNextFertilizationDue(plant: Plant, now: Date = new Date()): Date | null {
  const seasons = normalizeFertilizerSeasons(plant.fertilizer_seasons);
  if (seasons.length === 0) return null;
  const freq = Math.max(1, plant.fertilizer_frequency_days || 30);
  const today = startOfDay(now);
  let candidate: Date;
  if (plant.last_fertilized) {
    const last = parseISO(plant.last_fertilized);
    if (!isValid(last)) {
      candidate = snapToAllowedFertilizerDay(today, seasons);
    } else {
      candidate = addDays(startOfDay(last), freq);
    }
  } else {
    candidate = snapToAllowedFertilizerDay(today, seasons);
  }
  return snapToAllowedFertilizerDay(candidate, seasons);
}

export function formatNextFertilizationDue(plant: Plant, now = new Date()): string {
  const d = computeNextFertilizationDue(plant, now);
  if (!d) return '—';
  return format(d, 'MMM d, yyyy');
}

export type FertilizerUrgency = 'overdue' | 'due_soon' | 'due_month' | 'later' | 'off_season';

export function fertilizerUrgency(plant: Plant, now: Date = new Date()): FertilizerUrgency {
  const seasons = normalizeFertilizerSeasons(plant.fertilizer_seasons);
  if (!dateInFertilizerSeasons(now, seasons)) return 'off_season';
  const next = computeNextFertilizationDue(plant, now);
  if (!next) return 'later';
  const today = startOfDay(now);
  const nextDay = startOfDay(next);
  const diffDays = Math.ceil((nextDay.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return 'overdue';
  if (diffDays <= 7) return 'due_soon';
  if (isSameMonth(next, now)) return 'due_month';
  return 'later';
}

/** Home filter: in-season plant with next due in this calendar month or already overdue while in-season */
export function needsFertilizerThisMonth(plant: Plant, now: Date = new Date()): boolean {
  const seasons = normalizeFertilizerSeasons(plant.fertilizer_seasons);
  if (!dateInFertilizerSeasons(now, seasons)) return false;
  const next = computeNextFertilizationDue(plant, now);
  if (!next) return false;
  const today = startOfDay(now);
  const nextDay = startOfDay(next);
  if (today.getTime() >= nextDay.getTime()) return true;
  return isSameMonth(next, now);
}

export function fertilizerDueSoonOrOverdue(plant: Plant, now = new Date()): boolean {
  const u = fertilizerUrgency(plant, now);
  return u === 'overdue' || u === 'due_soon';
}

export function currentFertilizerSeason(now: Date = new Date()): FertilizerSeason {
  const m = now.getMonth() + 1;
  for (const s of FERTILIZER_SEASON_ORDER) {
    if (SEASON_MONTHS[s].includes(m)) return s;
  }
  return 'spring';
}

export function seasonLabel(s: FertilizerSeason): string {
  const map: Record<FertilizerSeason, string> = {
    winter: 'Winter',
    spring: 'Spring',
    summer: 'Summer',
    fall: 'Fall',
  };
  return map[s];
}
