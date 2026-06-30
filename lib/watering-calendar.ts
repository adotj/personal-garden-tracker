import { addDays, format, isSameDay, parseISO, startOfDay } from 'date-fns';
import type { Plant } from '@/lib/plant-types';
import { parseCareAnchorDate } from '@/lib/watering-schedule';
import type { Forecast } from '@/lib/weather';
import { calculateWateringAdjustment } from '@/lib/weather';

const DAY_KEY = 'yyyy-MM-dd';

export type WateringCalendarDay = {
  dateKey: string;
  at: Date;
  plants: Plant[];
};

/** All calendar days on which `plant` should be watered, within [rangeStart, rangeEnd] inclusive. */
export function wateringDueDateKeysForPlant(
  plant: Plant,
  rangeStart: Date,
  rangeEnd: Date,
  forecast?: Forecast | null,
): Set<string> {
  const freq = Math.max(1, plant.watering_frequency_days || 7);
  const keys = new Set<string>();
  const rs = startOfDay(rangeStart);
  const re = startOfDay(rangeEnd);

  if (!plant.last_watered) {
    keys.add(format(rs, DAY_KEY));
    return keys;
  }

  const last = parseCareAnchorDate(plant.last_watered);
  if (!last) {
    keys.add(format(rs, DAY_KEY));
    return keys;
  }

  const baseFirstDue = addDays(last, freq);
  const effectiveFirstDue = forecast
    ? calculateWateringAdjustment(plant, forecast).adjustedDueDate
    : baseFirstDue;

  const firstKey =
    effectiveFirstDue < rs
      ? format(rs, DAY_KEY)
      : effectiveFirstDue <= re
        ? format(effectiveFirstDue, DAY_KEY)
        : null;
  if (firstKey) keys.add(firstKey);

  let next = addDays(last, freq);
  while (next <= re) {
    if (next >= rs) {
      const key = format(next, DAY_KEY);
      const replacedBaseFirst =
        !isSameDay(effectiveFirstDue, baseFirstDue) && isSameDay(next, baseFirstDue);
      if (!replacedBaseFirst && key !== firstKey) keys.add(key);
    }
    next = addDays(next, freq);
  }

  return keys;
}

/** Next 14 days (by default) with plants due for water each day. */
export function buildWateringCalendar(
  plants: Plant[],
  numDays: number,
  now: Date = new Date(),
  forecast?: Forecast | null,
): WateringCalendarDay[] {
  const start = startOfDay(now);
  const end = startOfDay(addDays(start, numDays - 1));
  const bucket = new Map<string, Plant[]>();

  for (let i = 0; i < numDays; i++) {
    bucket.set(format(addDays(start, i), DAY_KEY), []);
  }

  for (const plant of plants) {
    const dueKeys = wateringDueDateKeysForPlant(plant, start, end, forecast);
    for (const key of dueKeys) {
      const list = bucket.get(key);
      if (list) list.push(plant);
    }
  }

  return Array.from(bucket.entries())
    .map(([dateKey, p]) => ({
      dateKey,
      at: parseISO(dateKey + 'T12:00:00'),
      plants: [...p].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
