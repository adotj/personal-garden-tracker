import { addDays, isValid } from 'date-fns';
import type { Plant } from '@/lib/plant-types';

const FORECAST_CACHE_TTL_MS = 60 * 60 * 1000;
const FORECAST_CACHE_KEY = 'laveen-phoenix-forecast-v1';
const FORECAST_DAY_COUNT = 5;

const OPEN_METEO_FORECAST_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=33.3776&longitude=-112.0838&timezone=America/Phoenix&temperature_unit=fahrenheit&daily=temperature_2m_max,precipitation_sum';

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
  const frequency = Math.max(1, plant.watering_frequency_days || 1);
  const lastWatered = plant.last_watered ? new Date(plant.last_watered) : null;
  if (lastWatered && isValid(lastWatered)) {
    return addDays(lastWatered, frequency);
  }
  return addDays(new Date(), frequency);
}

export function calculateWateringAdjustment(
  plant: Plant,
  forecast: Forecast,
): { adjustedDueDate: Date; reason: string; daysShift: number } {
  const baseDueDate = baseWateringDueDate(plant);
  const hottestDay = forecast.days.reduce((max, day) => Math.max(max, day.temperatureMax), -Infinity);
  const hasRain = forecast.days.some((day) => day.precipitationSum > 0);

  let heatShift = 0;
  if (hottestDay >= 110) heatShift = -2;
  else if (hottestDay >= 105) heatShift = -1;

  const rainShift = hasRain ? 1 : 0;
  const daysShift = heatShift + rainShift;
  const adjustedDueDate = addDays(baseDueDate, daysShift);

  let reason = 'No weather adjustment needed.';
  if (daysShift < 0 && rainShift === 0) {
    reason = `Heat spike forecast (high near ${Math.round(hottestDay)}°F) — watering moved ${Math.abs(daysShift)} day earlier.`;
  } else if (daysShift > 0 && heatShift === 0) {
    reason = 'Rain delay — measurable precipitation is forecast, so watering moves 1 day later.';
  } else if (daysShift < 0 && rainShift > 0) {
    reason = `Heat spike and rain are both forecast — net result moves watering ${Math.abs(daysShift)} day earlier.`;
  } else if (daysShift === 0 && heatShift !== 0 && rainShift !== 0) {
    reason = 'Heat spike and rain delay cancel out, so next due date stays unchanged.';
  } else if (daysShift === 0) {
    reason = 'No heat spike (105°F+) or rain delay signal in the 5-day forecast.';
  }

  return { adjustedDueDate, reason, daysShift };
}
