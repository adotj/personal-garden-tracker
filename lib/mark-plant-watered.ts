import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clientLocalDateKey,
  formatPlantCareInstant,
  isPlantCareDateToday,
  wateringLoggedAtIso,
} from '@/lib/plant-helpers';

export type MarkPlantWateredResult =
  | { ok: true; alreadyToday: boolean; when: string }
  | { ok: false; error: string };

export function plantWateredActivityDetails(when: string): string {
  return `Last watered on this plant’s record is now ${formatPlantCareInstant(when, 'profile')}.`;
}

async function updateLastWatered(
  supabase: SupabaseClient,
  plantId: string,
  value: string,
): Promise<{ ok: true; when: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('plants')
    .update({ last_watered: value })
    .eq('id', plantId)
    .select('last_watered')
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      error: 'Update did not apply — you may need to sign in again from the home page.',
    };
  }
  const when =
    typeof data.last_watered === 'string' && data.last_watered.trim()
      ? data.last_watered.trim()
      : value;
  return { ok: true, when };
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
  if (!plantId?.trim()) {
    return { ok: false, error: 'Missing plant id.' };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, error: sessionError.message || 'Could not verify sign-in.' };
  }
  if (!session) {
    return {
      ok: false,
      error: 'Please sign in on the home page before logging watering.',
    };
  }

  const { data: row, error: fetchErr } = await supabase
    .from('plants')
    .select('last_watered')
    .eq('id', plantId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message || 'Could not load plant' };
  }
  if (!row) {
    return { ok: false, error: 'Plant not found or you do not have access.' };
  }

  const alreadyToday = isPlantCareDateToday(row.last_watered);
  const candidates = [clientLocalDateKey(), wateringLoggedAtIso()];
  const errors: string[] = [];

  let storedWhen: string | null = null;
  for (const candidate of candidates) {
    const attempt = await updateLastWatered(supabase, plantId, candidate);
    if (attempt.ok) {
      storedWhen = attempt.when;
      break;
    }
    errors.push(attempt.error);
  }

  if (!storedWhen) {
    return {
      ok: false,
      error: errors.filter(Boolean).join(' · ') || 'Could not update last watered date.',
    };
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
