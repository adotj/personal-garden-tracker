import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlantCareDateToday, wateringLoggedAtIso } from '@/lib/plant-helpers';

type MarkPlantWateredInput = {
  supabase: SupabaseClient;
  plantId: string;
  plantName: string;
  lastWatered: string | null | undefined;
  when?: string;
};

type MarkPlantWateredResult =
  | { ok: true; alreadyToday: true; when: string }
  | { ok: true; alreadyToday: false; when: string }
  | { ok: false; error: string };

/**
 * Shared single-plant watering write path used by both profile and dashboard bulk actions.
 * Guarantees the same per-plant data updates and activity log shape.
 */
export async function markPlantWateredWithLog({
  supabase,
  plantId,
  plantName,
  lastWatered,
  when = wateringLoggedAtIso(),
}: MarkPlantWateredInput): Promise<MarkPlantWateredResult> {
  if (isPlantCareDateToday(lastWatered)) {
    return { ok: true, alreadyToday: true, when: lastWatered || when };
  }

  const { data: updated, error: updateError } = await supabase
    .from('plants')
    .update({ last_watered: when })
    .eq('id', plantId)
    .select('id')
    .limit(1);
  if (updateError) {
    return { ok: false, error: updateError.message || 'Could not update watering' };
  }
  if (!updated?.length) {
    return { ok: false, error: 'Plant not found' };
  }

  const { error: logError } = await supabase.from('activity_logs').insert({
    action: 'Plant Watered',
    plant_name: plantName,
    created_at: when,
  });
  if (logError) {
    return { ok: false, error: logError.message || 'Could not log watering activity' };
  }

  return { ok: true, alreadyToday: false, when };
}
