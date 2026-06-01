import { addDays, format, isValid, parseISO, startOfDay } from 'date-fns';

export type ClientCareDay = {
  todayDateKey: string;
  startIso: string;
  endIso: string;
};

/** Client-local calendar day window for “watered today” checks on server actions. */
export function currentClientCareDay(now: Date = new Date()): ClientCareDay {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    todayDateKey: format(start, 'yyyy-MM-dd'),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function isDateOnlyIsoString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

/**
 * Calendar anchor for watering math. Date-only values use local noon so time zones
 * do not shift the day backward/forward; timestamps use local start-of-day.
 */
export function parseCareAnchorDate(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const trimmed = iso.trim();
  const parsed = isDateOnlyIsoString(trimmed) ? parseISO(`${trimmed}T12:00:00`) : parseISO(trimmed);
  if (!isValid(parsed)) return null;
  return startOfDay(parsed);
}

/** Next watering due date from last watered + frequency (before weather adjustments). */
export function baseWateringDueDate(
  lastWatered: string | null | undefined,
  frequencyDays: number,
): Date | null {
  const freq = Math.max(1, frequencyDays || 1);
  const anchor = parseCareAnchorDate(lastWatered);
  if (!anchor) return null;
  const due = addDays(anchor, freq);
  return isValid(due) ? due : null;
}
