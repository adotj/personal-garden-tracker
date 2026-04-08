import { addDays, format, isValid, parseISO, startOfDay } from 'date-fns';
import type { Plant } from '@/lib/plant-types';

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
): Set<string> {
  const freq = Math.max(1, plant.watering_frequency_days || 7);
  const keys = new Set<string>();
  const rs = startOfDay(rangeStart);
  const re = startOfDay(rangeEnd);

  if (!plant.last_watered) {
    keys.add(format(rs, DAY_KEY));
    return keys;
  }

  const last = startOfDay(parseISO(plant.last_watered));
  if (!isValid(last)) {
    keys.add(format(rs, DAY_KEY));
    return keys;
  }

  let next = addDays(last, freq);
  while (next <= re) {
    if (next >= rs) keys.add(format(next, DAY_KEY));
    next = addDays(next, freq);
  }

  const firstDue = addDays(last, freq);
  if (keys.size === 0 && firstDue < rs) {
    keys.add(format(rs, DAY_KEY));
  }

  return keys;
}

/** Next 14 days (by default) with plants due for water each day. */
export function buildWateringCalendar(
  plants: Plant[],
  numDays: number,
  now: Date = new Date(),
): WateringCalendarDay[] {
  const start = startOfDay(now);
  const end = startOfDay(addDays(start, numDays - 1));
  const bucket = new Map<string, Plant[]>();

  for (let i = 0; i < numDays; i++) {
    bucket.set(format(addDays(start, i), DAY_KEY), []);
  }

  for (const plant of plants) {
    const dueKeys = wateringDueDateKeysForPlant(plant, start, end);
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
