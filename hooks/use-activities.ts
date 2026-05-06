'use client';

import { useCallback, useState } from 'react';
import { fetchActivitiesAction } from '@/app/actions/garden';
import type { ActionResult, Activity } from '@/lib/garden-types';

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);

  const fetchActivities = useCallback(async (): Promise<ActionResult<Activity[]>> => {
    const result = await fetchActivitiesAction();
    if (result.ok) {
      setActivities(result.data);
    }
    return result;
  }, []);

  return {
    activities,
    setActivities,
    fetchActivities,
  };
}
