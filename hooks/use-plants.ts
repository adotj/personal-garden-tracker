'use client';

import { useCallback, useState } from 'react';
import type { ActionResult } from '@/lib/garden-types';
import type { Plant } from '@/lib/plant-types';
import { normalizePlantRow } from '@/lib/plant-helpers';
import { supabase } from '@/lib/supabase';

export function usePlants() {
  const [plants, setPlants] = useState<Plant[]>([]);

  const fetchPlants = useCallback(async (): Promise<ActionResult<Plant[]>> => {
    const { data, error } = await supabase.from('plants').select('*').order('created_at', { ascending: false });
    if (error) {
      return { ok: false, error: error.message || 'Could not load plants' };
    }
    const rows = (data || []).map((row) => normalizePlantRow(row as Plant));
    setPlants(rows);
    return { ok: true, data: rows };
  }, []);

  return {
    plants,
    setPlants,
    fetchPlants,
  };
}
