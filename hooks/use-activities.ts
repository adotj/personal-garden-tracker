'use client';

import { useCallback, useState } from 'react';
import type { ActionResult, Activity } from '@/lib/garden-types';
import { supabase } from '@/lib/supabase';

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);

  const fetchActivities = useCallback(async (): Promise<ActionResult<Activity[]>> => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      return { ok: false, error: error.message || 'Could not load activity log' };
    }
    const rows = (data || []) as Activity[];
    setActivities(rows);
    return { ok: true, data: rows };
  }, []);

  return {
    activities,
    setActivities,
    fetchActivities,
  };
}
