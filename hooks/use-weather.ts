'use client';

import { useCallback, useState } from 'react';
import { fetchWeatherAction } from '@/app/actions/garden';
import type { ActionResult, GardenWeather } from '@/lib/garden-types';

export function useWeather() {
  const [weather, setWeather] = useState<GardenWeather | null>(null);

  const loadWeather = useCallback(async (): Promise<ActionResult<GardenWeather | null>> => {
    const result = await fetchWeatherAction();
    if (result.ok) {
      setWeather(result.data);
    }
    return result;
  }, []);

  return {
    weather,
    setWeather,
    loadWeather,
  };
}
