import { addDays, isValid, parseISO, startOfDay } from 'date-fns';
import type { Plant } from '@/lib/plant-types';
import { baseWateringDueDate as wateringDueFromLastWatered } from '@/lib/watering-schedule';

/** Laveen, AZ — shared with dashboard weather in fetchWeatherAction */
export const LAVEEN_LATITUDE = 33.3625;
export const LAVEEN_LONGITUDE = -112.1695;

const FORECAST_CACHE_TTL_MS = 60 * 60 * 1000;
const FORECAST_CACHE_KEY = 'laveen-phoenix-forecast-v2';
const FORECAST_DAY_COUNT = 5;

/** ~0.04 in — model drizzle below this should not trigger a rain delay */
export const MEASURABLE_PRECIPITATION_MM = 1.0;

const OPEN_METEO_FORECAST_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAVEEN_LATITUDE}&longitude=${LAVEEN_LONGITUDE}&timezone=America/Phoenix&temperature_unit=fahrenheit&daily=temperature_2m_max,precipitation_sum`;

export type ForecastDay = {
  date: string;
  temperatureMax: number;
  precipitationSum: number;
};

export type Forecast = {
  fetchedAt: string;
  days: ForecastDay[];
};

type CachedForecastRecord = {
  expiresAt: number;
  forecast: Forecast;
};

let memoryCache: CachedForecastRecord | null = null;
let inFlightForecast: Promise<Forecast> | null = null;

function readLocalCacheRecord(): CachedForecastRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FORECAST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedForecastRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.expiresAt !== 'number') return null;
    if (!parsed.forecast || !Array.isArray(parsed.forecast.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalCacheRecord(record: CachedForecastRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage quota / private browsing failures.
  }
}

function parseForecast(payload: unknown): Forecast {
  const daily = (payload as {
    daily?: {
      time?: string[];
      temperature_2m_max?: number[];
      precipitation_sum?: number[];
    };
  })?.daily;

  const dates = daily?.time ?? [];
  const highs = daily?.temperature_2m_max ?? [];
  const precip = daily?.precipitation_sum ?? [];
  const count = Math.min(FORECAST_DAY_COUNT, dates.length, highs.length, precip.length);

  if (count < FORECAST_DAY_COUNT) {
    throw new Error('Incomplete weather forecast data');
  }

  return {
    fetchedAt: new Date().toISOString(),
    days: Array.from({ length: count }, (_, idx) => ({
      date: dates[idx],
      temperatureMax: Number(highs[idx]),
      precipitationSum: Number(precip[idx]),
    })),
  };
}

function isRecordFresh(record: CachedForecastRecord, now = Date.now()): boolean {
  return now < record.expiresAt;
}

export async function fetchPhoenixForecast(): Promise<Forecast> {
  const now = Date.now();
  if (memoryCache && isRecordFresh(memoryCache, now)) {
    return memoryCache.forecast;
  }

  const localRecord = readLocalCacheRecord();
  if (localRecord && isRecordFresh(localRecord, now)) {
    memoryCache = localRecord;
    return localRecord.forecast;
  }

  if (inFlightForecast) {
    return inFlightForecast;
  }

  inFlightForecast = (async () => {
    try {
      const response = await fetch(OPEN_METEO_FORECAST_URL, {
        next: { revalidate: 3600 },
      });
      if (!response.ok) {
        throw new Error(`Open-Meteo request failed (${response.status})`);
      }
      const payload = await response.json();
      const forecast = parseForecast(payload);
      const record: CachedForecastRecord = {
        expiresAt: Date.now() + FORECAST_CACHE_TTL_MS,
        forecast,
      };
      memoryCache = record;
      writeLocalCacheRecord(record);
      return forecast;
    } catch (error) {
      const fallback = readLocalCacheRecord();
      if (fallback) return fallback.forecast;
      if (memoryCache) return memoryCache.forecast;
      throw error;
    } finally {
      inFlightForecast = null;
    }
  })();

  return inFlightForecast;
}

function baseWateringDueDate(plant: Plant): Date {
  const due = wateringDueFromLastWatered(plant.last_watered, plant.watering_frequency_days);
  if (due) return due;
  return addDays(new Date(), Math.max(1, plant.watering_frequency_days || 1));
}

/** Rain delay only when measurable precip is forecast on or before the plant's due date */
export function hasMeasurableRainNearDueDate(forecast: Forecast, baseDueDate: Date): boolean {
  const today = startOfDay(new Date());
  const due = startOfDay(baseDueDate);
  const windowEnd = due < today ? today : due;

  return forecast.days.some((day) => {
    const dayDate = parseISO(day.date);
    if (!isValid(dayDate)) return false;
    const d = startOfDay(dayDate);
    if (d < today || d > windowEnd) return false;
    return day.precipitationSum >= MEASURABLE_PRECIPITATION_MM;
  });
}

/**
 * Peak high only on days that can affect this watering cycle:
 * from today through the base due date (inclusive). Looking at the full 5-day
 * forecast incorrectly pulled due dates forward when a distant heat spike
 * had nothing to do with the current interval.
 */
export function peakHighThroughDueDate(forecast: Forecast, baseDueDate: Date): number {
  const today = startOfDay(new Date());
  const due = startOfDay(baseDueDate);
  const windowEnd = due < today ? today : due;

  let hottest = -Infinity;
  for (const day of forecast.days) {
    const dayDate = parseISO(day.date);
    if (!isValid(dayDate)) continue;
    const d = startOfDay(dayDate);
    if (d < today || d > windowEnd) continue;
    if (Number.isFinite(day.temperatureMax)) {
      hottest = Math.max(hottest, day.temperatureMax);
    }
  }
  return hottest;
}

export function calculateWateringAdjustment(
  plant: Plant,
  forecast: Forecast,
): { adjustedDueDate: Date; reason: string; daysShift: number } {
  const baseDueDate = baseWateringDueDate(plant);
  const hottestDay = peakHighThroughDueDate(forecast, baseDueDate);
  const hasRain = hasMeasurableRainNearDueDate(forecast, baseDueDate);

  let heatShift = 0;
  if (Number.isFinite(hottestDay) && hottestDay >= 110) heatShift = -2;
  else if (Number.isFinite(hottestDay) && hottestDay >= 105) heatShift = -1;

  const rainShift = hasRain ? 1 : 0;
  const daysShift = heatShift + rainShift;
  const adjustedDueDate = addDays(baseDueDate, daysShift);

  let reason = 'No weather adjustment needed.';
  if (daysShift < 0 && rainShift === 0) {
    reason = `Heat spike before next watering (high near ${Math.round(hottestDay)}°F) — watering moved ${Math.abs(daysShift)} day earlier.`;
  } else if (daysShift > 0 && heatShift === 0) {
    reason = 'Rain delay — measurable precipitation is forecast, so watering moves 1 day later.';
  } else if (daysShift < 0 && rainShift > 0) {
    reason = `Heat spike and rain are both forecast — net result moves watering ${Math.abs(daysShift)} day earlier.`;
  } else if (daysShift === 0 && heatShift !== 0 && rainShift !== 0) {
    reason = 'Heat spike and rain delay cancel out, so next due date stays unchanged.';
  } else if (daysShift === 0) {
    reason = 'No heat spike (105°F+) or rain delay before the next watering due date.';
  }

  return { adjustedDueDate, reason, daysShift };
}
