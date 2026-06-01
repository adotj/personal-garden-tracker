import type { SupabaseClient } from '@supabase/supabase-js';
import { formatPlantCareInstant, isPlantCareDateToday, wateringLoggedAtIso } from '@/lib/plant-helpers';

export type MarkPlantWateredResult =
  | { ok: true; alreadyToday: boolean; when: string }
  | { ok: false; error: string };

export function plantWateredActivityDetails(when: string): string {
  return `Last watered on this plant’s record is now ${formatPlantCareInstant(when, 'profile')}.`;
}

/**
 * Mark a plant watered using the browser Supabase client (user session cookies).
 * Use on the plant profile where reads already go through the same client.
 */
export async function markPlantWateredClient(
  supabase: SupabaseClient,
  plantId: string,
  plantName: string,
): Promise<MarkPlantWateredResult> {
  const { data: row, error: fetchErr } = await supabase
    .from('plants')
    .select('last_watered')
    .eq('id', plantId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message || 'Plant not found' };
  }

  const alreadyToday = isPlantCareDateToday(row.last_watered);
  const when = wateringLoggedAtIso();

  let storedWhen = when;
  const { error: updateErr } = await supabase.from('plants').update({ last_watered: when }).eq('id', plantId);

  if (updateErr) {
    const dateOnly = when.slice(0, 10);
    const { error: retryErr } = await supabase
      .from('plants')
      .update({ last_watered: dateOnly })
      .eq('id', plantId);
    if (retryErr) {
      return { ok: false, error: retryErr.message || updateErr.message || 'Could not mark watered' };
    }
    storedWhen = dateOnly;
  }

  if (!alreadyToday) {
    const { error: logErr } = await supabase.from('activity_logs').insert({
      action: 'Plant Watered',
      plant_name: plantName,
      details: plantWateredActivityDetails(storedWhen),
      created_at: storedWhen,
    });
    if (logErr) {
      console.warn('activity_logs insert:', logErr.message);
    }
  }

  return { ok: true, alreadyToday, when: storedWhen };
}
