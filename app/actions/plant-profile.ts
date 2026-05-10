'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { ActionResult } from '@/lib/garden-types';
import { normalizeSunExposure } from '@/lib/plant-helpers';
import { normalizeFertilizerSeasons } from '@/lib/fertilizer-schedule';
import type { FertilizerSeason, SunExposure } from '@/lib/plant-types';

function isSchemaColumnMissingError(error: { code?: string; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204') return true;
  const message = error.message ?? '';
  return message.includes('Could not find the') && message.includes('column');
}

function toStoragePath(photoUrl: string): string | null {
  const marker = '/storage/v1/object/public/plant-photos/';
  const idx = photoUrl.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(photoUrl.slice(idx + marker.length));
}

export async function savePlantHeaderFieldsAction(input: {
  plantId: string;
  containerType: string;
  potSize: string;
  sunExposure: SunExposure;
  locationInGarden: string | null;
}): Promise<ActionResult<{ extendedColumnsMissing: boolean }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error: coreError } = await supabase
      .from('plants')
      .update({
        container_type: input.containerType,
        pot_size: input.potSize,
      })
      .eq('id', input.plantId);
    if (coreError) return { ok: false, error: coreError.message || 'Could not save container and pot size' };

    const { error: extendedError } = await supabase
      .from('plants')
      .update({
        sun_exposure: normalizeSunExposure(input.sunExposure),
        location_in_garden: input.locationInGarden?.trim() ? input.locationInGarden.trim() : null,
      })
      .eq('id', input.plantId);

    if (extendedError) {
      if (isSchemaColumnMissingError(extendedError)) {
        return { ok: true, data: { extendedColumnsMissing: true } };
      }
      return { ok: false, error: extendedError.message || 'Could not save plant profile fields' };
    }
    return { ok: true, data: { extendedColumnsMissing: false } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save plant profile fields' };
  }
}

export async function saveWateringSettingsAction(input: {
  plantId: string;
  wateringFrequencyDays: number;
  lastWatered: string | null;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('plants')
      .update({
        watering_frequency_days: input.wateringFrequencyDays,
        last_watered: input.lastWatered?.trim() || null,
      })
      .eq('id', input.plantId);
    if (error) return { ok: false, error: error.message || 'Could not save watering settings' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save watering settings' };
  }
}

export async function saveFertilizerSettingsAction(input: {
  plantId: string;
  seasons: FertilizerSeason[];
  notes: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('plants')
      .update({
        fertilizer_seasons: normalizeFertilizerSeasons(input.seasons),
        fertilizer_notes: input.notes.trim() || null,
      })
      .eq('id', input.plantId);
    if (error) return { ok: false, error: error.message || 'Could not save fertilizer settings' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save fertilizer settings' };
  }
}

export async function saveFertilizerScheduleAction(input: {
  plantId: string;
  frequencyDays: number;
  lastFertilized: string | null;
  plantName: string;
  details: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error: scheduleError } = await supabase
      .from('plants')
      .update({
        fertilizer_frequency_days: input.frequencyDays,
        last_fertilized: input.lastFertilized?.trim() || null,
      })
      .eq('id', input.plantId);
    if (scheduleError) return { ok: false, error: scheduleError.message || 'Could not save fertilizer schedule' };

    const { error: activityError } = await supabase.from('activity_logs').insert({
      action: 'Fertilizer Schedule Updated',
      plant_name: input.plantName,
      details: input.details,
    });
    if (activityError) {
      return { ok: false, error: activityError.message || 'Could not log fertilizer schedule update' };
    }
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save fertilizer schedule' };
  }
}

export async function addPlantNoteEntryAction(input: {
  plantId: string;
  body: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('plant_note_entries').insert({
      plant_id: input.plantId,
      body: input.body,
    });
    if (error) return { ok: false, error: error.message || 'Could not add note' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not add note' };
  }
}

export async function deletePlantNoteEntryAction(input: {
  plantId: string;
  entryId: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('plant_note_entries')
      .delete()
      .eq('id', input.entryId)
      .eq('plant_id', input.plantId);
    if (error) return { ok: false, error: error.message || 'Could not delete note' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not delete note' };
  }
}

export async function deletePlantPhotoAction(input: {
  plantId: string;
  photoId: string;
  photoUrl: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const storagePath = toStoragePath(input.photoUrl);
    if (!storagePath) return { ok: false, error: 'Photo URL is not in the plant-photos bucket format' };

    const { error: storageError } = await supabase.storage.from('plant-photos').remove([storagePath]);
    if (storageError) return { ok: false, error: storageError.message || 'Could not delete storage image' };

    const { error: deleteRowError } = await supabase
      .from('plant_photos')
      .delete()
      .eq('id', input.photoId)
      .eq('plant_id', input.plantId);
    if (deleteRowError) return { ok: false, error: deleteRowError.message || 'Could not delete photo row' };

    await supabase
      .from('plants')
      .update({ photo_url: null })
      .eq('id', input.plantId)
      .eq('photo_url', input.photoUrl);

    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not delete photo' };
  }
}

export async function deleteUploadedPlantPhotoByUrlAction(photoUrl: string): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const storagePath = toStoragePath(photoUrl);
    if (!storagePath) return { ok: false, error: 'Photo URL is not in the plant-photos bucket format' };
    const { error } = await supabase.storage.from('plant-photos').remove([storagePath]);
    if (error) return { ok: false, error: error.message || 'Could not delete storage image' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not delete storage image' };
  }
}

export async function updatePhotoTimelineDateAction(input: {
  plantId: string;
  photoId: string;
  createdAtIso: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('plant_photos')
      .update({ created_at: input.createdAtIso })
      .eq('id', input.photoId)
      .eq('plant_id', input.plantId);
    if (error) return { ok: false, error: error.message || 'Could not update photo date' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not update photo date' };
  }
}

export async function addPlantTimelinePhotoAction(input: {
  plantId: string;
  photoUrl: string;
  createdAtIso: string | null;
  plantName: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error: photoError } = await supabase.from('plant_photos').insert({
      plant_id: input.plantId,
      photo_url: input.photoUrl,
      ...(input.createdAtIso ? { created_at: input.createdAtIso } : {}),
    });
    if (photoError) return { ok: false, error: photoError.message || 'Could not add photo row' };

    await supabase.from('activity_logs').insert({
      action: 'Photo Added',
      plant_name: input.plantName,
      details: null,
    });

    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not add photo' };
  }
}

export async function setPlantProfilePhotoAction(input: {
  plantId: string;
  photoUrl: string;
}): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('plants').update({ photo_url: input.photoUrl }).eq('id', input.plantId);
    if (error) return { ok: false, error: error.message || 'Could not set profile picture' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not set profile picture' };
  }
}
