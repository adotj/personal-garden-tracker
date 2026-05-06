'use client';

import { useCallback, useState } from 'react';
import { fetchPlantsAction } from '@/app/actions/garden';
import type { ActionResult } from '@/lib/garden-types';
import type { Plant } from '@/lib/plant-types';

export function usePlants() {
  const [plants, setPlants] = useState<Plant[]>([]);

  const fetchPlants = useCallback(async (): Promise<ActionResult<Plant[]>> => {
    const result = await fetchPlantsAction();
    if (result.ok) {
      setPlants(result.data);
    }
    return result;
  }, []);

  return {
    plants,
    setPlants,
    fetchPlants,
  };
}
