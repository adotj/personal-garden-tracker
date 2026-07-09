'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { ActionResult, Activity, AddPlantInput, GardenWeather, UpdatePlantInput } from '@/lib/garden-types';
import type { PlantEnvironment } from '@/lib/plant-environment';
import type { Plant } from '@/lib/plant-types';
import {
  formatPlantCareInstant,
  isPlantCareDateToday,
  normalizePlantRow,
  plantInsertCorePayload,
  plantInsertExtendedPatch,
  plantUpdateCorePayload,
  plantUpdateExtendedPatch,
  wateringLoggedAtIso,
} from '@/lib/plant-helpers';
import {
  ALL_FERTILIZER_SEASONS,
  normalizeFertilizerFrequencyDays,
  normalizeFertilizerSeasons,
  seasonLabel,
} from '@/lib/fertilizer-schedule';
import { sunExposureLabel } from '@/lib/plant-types';
import { datetimeLocalToIsoUtc } from '@/lib/photo-timeline';
import { format, isValid, parseISO } from 'date-fns';
import { LAVEEN_LATITUDE, LAVEEN_LONGITUDE } from '@/lib/weather';

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ClientCareDay = {
  todayDateKey: string;
  startIso: string;
  endIso: string;
};

type ParsedClientCareDay = {
  todayDateKey: string;
  start: Date;
  end: Date;
};

async function requireSignedInUser(
  supabase: SupabaseServerClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: 'Sign in again to continue.' };
  }
  return { ok: true };
}

function isDateOnlyIsoString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function parseClientCareDay(clientCareDay?: ClientCareDay): ParsedClientCareDay | null {
  if (!clientCareDay) return null;
  const { todayDateKey, startIso, endIso } = clientCareDay;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayDateKey)) return null;
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  if (!isValid(start) || !isValid(end) || end <= start) return null;
  return { todayDateKey, start, end };
}

function isPlantCareDateInClientDay(
  iso: string | null | undefined,
  clientCareDay: ParsedClientCareDay | null,
): boolean {
  if (!iso?.trim()) return false;
  const normalized = iso.trim();
  if (clientCareDay && isDateOnlyIsoString(normalized)) {
    return normalized === clientCareDay.todayDateKey;
  }
  const parsed = parseISO(normalized);
  if (!isValid(parsed)) return false;
  if (!clientCareDay) return isPlantCareDateToday(normalized);
  return parsed >= clientCareDay.start && parsed < clientCareDay.end;
}

function isRainWeatherCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
}

function isSnowWeatherCode(code: number): boolean {
  return (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
}

function getWeatherCondition(code: number): string {
  if (code === 0) return 'Sunny';
  if (code <= 3) return 'Cloudy';
  if (code <= 48) return 'Fog';
  if (isRainWeatherCode(code)) return 'Rain';
  if (isSnowWeatherCode(code)) return 'Snow';
  return 'Cloudy';
}

function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (isRainWeatherCode(code)) return '🌧️';
  if (isSnowWeatherCode(code)) return '❄️';
  return '☁️';
}

async function logActivity(action: string, plant_name?: string, details?: string | null, created_at?: string) {
  const supabase = await createSupabaseServerClient();
  const row: { action: string; plant_name?: string; details: string | null; created_at?: string } = {
    action,
    details: details ?? null,
  };
  if (plant_name?.trim()) row.plant_name = plant_name;
  if (created_at) row.created_at = created_at;
  await supabase.from('activity_logs').insert([row]);
}

function plantWateredDetails(when: string) {
  return `Last watered on this plant’s record is now ${formatPlantCareInstant(when, 'profile')}.`;
}

function fertilizerCadenceSentence(frequencyDays: number): string {
  if (frequencyDays === 0) {
    return 'Fertilizer cadence is set to as needed (no recurring interval).';
  }
  return `Fertilizer cadence is every ${frequencyDays} day${frequencyDays === 1 ? '' : 's'} during active seasons.`;
}

async function logPlantWateredActivities(supabase: SupabaseServerClient, plantNames: string[], when: string) {
  const rows = plantNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({
      action: 'Plant Watered',
      plant_name: name,
      details: plantWateredDetails(when),
      created_at: when,
    }));
  if (rows.length === 0) return;
  await supabase.from('activity_logs').insert(rows);
}

function toStoragePath(photoUrl: string): string | null {
  const marker = '/storage/v1/object/public/plant-photos/';
  const idx = photoUrl.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(photoUrl.slice(idx + marker.length));
}

export async function fetchPlantsAction(): Promise<ActionResult<Plant[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('plants').select('*').order('created_at', { ascending: false });
    if (error) return { ok: false, error: error.message || 'Could not load plants' };
    return { ok: true, data: (data || []).map((row) => normalizePlantRow(row as Plant)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not load plants' };
  }
}

export async function fetchActivitiesAction(): Promise<ActionResult<Activity[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return { ok: false, error: error.message || 'Could not load activity log' };
    return { ok: true, data: (data || []) as Activity[] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not load activity log' };
  }
}

export async function fetchWeatherAction(): Promise<ActionResult<GardenWeather | null>> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAVEEN_LATITUDE}&longitude=${LAVEEN_LONGITUDE}` +
    '&current=temperature_2m,wind_speed_10m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&temperature_unit=fahrenheit&timezone=America/Phoenix';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    const current = data?.current;
    const daily = data?.daily;
    if (!current || !daily?.time?.length) return { ok: true, data: null };

    const condition = getWeatherCondition(current.weather_code);

    return {
      ok: true,
      data: {
        temperature: Math.round(current.temperature_2m),
        condition,
        windSpeed: Math.round(current.wind_speed_10m),
        forecast: daily.time.slice(0, 3).map((date: string, i: number) => ({
          // Local noon avoids UTC-midnight weekday shift in America/Phoenix.
          date: format(parseISO(`${date}T12:00:00`), 'EEE'),
          high: Math.round(daily.temperature_2m_max[i]),
          low: Math.round(daily.temperature_2m_min[i]),
          condition: getWeatherCondition(daily.weather_code[i]),
          icon: getWeatherIcon(daily.weather_code[i]),
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Weather fetch failed' };
  }
}

export async function addPlantAction(input: AddPlantInput): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return auth;

    const seasons =
      input.plant.fertilizer_seasons?.length > 0
        ? input.plant.fertilizer_seasons
        : [...ALL_FERTILIZER_SEASONS];
    const fertilizerFrequencyDays = normalizeFertilizerFrequencyDays(input.plant.fertilizer_frequency_days, 30);

    const coreRow = plantInsertCorePayload({
      name: input.plant.name,
      container_type: input.plant.container_type,
      pot_size: input.plant.pot_size,
      watering_frequency_days: Math.max(1, input.plant.watering_frequency_days),
      last_watered: input.plant.last_watered,
      last_fertilized: input.plant.last_fertilized,
      photo_url: input.plant.photo_url,
    });
    const { data: inserted, error } = await supabase
      .from('plants')
      .insert([coreRow])
      .select('id')
      .single();
    if (error || !inserted?.id) {
      return { ok: false, error: error?.message || 'Failed to add plant' };
    }

    const { error: extErr } = await supabase
      .from('plants')
      .update(
        plantInsertExtendedPatch({
          environment: input.environment,
          sun_exposure: input.plant.sun_exposure,
          fertilizer_frequency_days: fertilizerFrequencyDays,
          fertilizer_seasons: seasons,
          fertilizer_notes: input.plant.fertilizer_notes,
          location_in_garden: input.plant.location_in_garden,
          species: input.plant.species,
        }),
      )
      .eq('id', inserted.id);
    if (extErr) {
      console.warn('plants extended columns update:', extErr);
    }

    if (input.plant.photo_url) {
      const createdIso = datetimeLocalToIsoUtc(input.photoTimelineAt);
      const { error: timelineErr } = await supabase.from('plant_photos').insert({
        plant_id: inserted.id,
        photo_url: input.plant.photo_url,
        ...(createdIso ? { created_at: createdIso } : {}),
      });
      if (timelineErr) console.error('plant_photos insert:', timelineErr);
    }

    const addDetails = [
      `${coreRow.container_type}, ${coreRow.pot_size}.`,
      `Sun: ${sunExposureLabel(input.plant.sun_exposure)}.`,
      `Water every ${coreRow.watering_frequency_days} day${coreRow.watering_frequency_days === 1 ? '' : 's'}; ${
        fertilizerFrequencyDays === 0
          ? 'fertilize as needed (no recurring interval)'
          : `fertilize every ${fertilizerFrequencyDays} day${fertilizerFrequencyDays === 1 ? '' : 's'}`
      }.`,
    ];
    if (seasons.length > 0 && seasons.length < ALL_FERTILIZER_SEASONS.length) {
      addDetails.push(`Fertilizer scheduled in: ${seasons.map(seasonLabel).join(', ')}.`);
    }
    if (input.plant.photo_url) addDetails.push('Homepage photo attached.');
    await logActivity('Plant Added', input.plant.name, addDetails.join(' '));

    return { ok: true, data: { id: inserted.id } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to add plant' };
  }
}

export async function updatePlantAction(input: UpdatePlantInput): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return auth;

    const merged = {
      ...input.plant,
      watering_frequency_days: Math.max(1, input.plant.watering_frequency_days),
      fertilizer_frequency_days: normalizeFertilizerFrequencyDays(input.plant.fertilizer_frequency_days, 30),
      fertilizer_seasons: normalizeFertilizerSeasons(input.plant.fertilizer_seasons),
    };

    const { error: coreError } = await supabase
      .from('plants')
      .update(plantUpdateCorePayload(merged))
      .eq('id', merged.id);
    if (coreError) {
      return { ok: false, error: coreError.message || 'Failed to update plant' };
    }

    const { error: extError } = await supabase
      .from('plants')
      .update(plantUpdateExtendedPatch(merged))
      .eq('id', merged.id);
    if (extError) console.warn('plants extended columns update:', extError);

    if (merged.photo_url && merged.photo_url !== input.photoBaseline) {
      const createdIso = datetimeLocalToIsoUtc(input.photoTimelineAt);
      const { error: timelineErr } = await supabase.from('plant_photos').insert({
        plant_id: merged.id,
        photo_url: merged.photo_url,
        ...(createdIso ? { created_at: createdIso } : {}),
      });
      if (timelineErr) console.error('plant_photos insert:', timelineErr);
    }

    const editDetails = [
      `${merged.container_type}, ${merged.pot_size}.`,
      `Sun: ${sunExposureLabel(merged.sun_exposure)}.`,
      `Water every ${merged.watering_frequency_days} day${merged.watering_frequency_days === 1 ? '' : 's'}; ${
        merged.fertilizer_frequency_days === 0
          ? 'fertilize as needed (no recurring interval)'
          : `fertilize every ${merged.fertilizer_frequency_days} day${merged.fertilizer_frequency_days === 1 ? '' : 's'}`
      }.`,
      `Fertilizer seasons: ${merged.fertilizer_seasons.map(seasonLabel).join(', ')}.`,
    ];
    if (merged.photo_url && merged.photo_url !== input.photoBaseline) {
      editDetails.push('Card / homepage photo was replaced.');
    }
    await logActivity('Plant Edited', merged.name, editDetails.join(' '));

    return { ok: true, data: { id: merged.id } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to update plant' };
  }
}

export async function markWateredAction(
  id: string,
  clientCareDay?: ClientCareDay,
): Promise<ActionResult<{ alreadyToday: boolean; when: string; name: string }>> {
  try {
    const parsedClientCareDay = parseClientCareDay(clientCareDay);
    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return { ok: false, error: 'Sign in again to mark plants as watered.' };
    const { data: plant, error: plantErr } = await supabase
      .from('plants')
      .select('id, name, last_watered')
      .eq('id', id)
      .limit(1)
      .maybeSingle();
    if (plantErr || !plant) {
      return { ok: false, error: plantErr?.message || 'Plant not found' };
    }
    const alreadyToday = isPlantCareDateInClientDay(plant.last_watered, parsedClientCareDay);
    const when = wateringLoggedAtIso();
    let storedWhen = when;
    const { error } = await supabase.from('plants').update({ last_watered: when }).eq('id', id);
    if (error) {
      const dateOnly = parsedClientCareDay?.todayDateKey ?? when.slice(0, 10);
      const { error: retryError } = await supabase
        .from('plants')
        .update({ last_watered: dateOnly })
        .eq('id', id);
      if (retryError) {
        return { ok: false, error: retryError.message || error.message || 'Could not mark watered' };
      }
      storedWhen = dateOnly;
    }
    if (!alreadyToday) {
      await logPlantWateredActivities(supabase, [plant.name], storedWhen);
    }
    return { ok: true, data: { alreadyToday, when: storedWhen, name: plant.name } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not mark watered' };
  }
}

export async function markSelectedTodayPlantsWateredAction(
  plantIds: string[],
  clientCareDay?: ClientCareDay,
): Promise<ActionResult<{ updatedIds: string[]; when: string }>> {
  try {
    const parsedClientCareDay = parseClientCareDay(clientCareDay);
    const uniqueIds = Array.from(new Set(plantIds));
    if (uniqueIds.length === 0) return { ok: false, error: 'Select at least one plant due today.' };

    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return auth;

    const { data: rows, error: rowsErr } = await supabase
      .from('plants')
      .select('id, name, last_watered')
      .in('id', uniqueIds);
    if (rowsErr || !rows) return { ok: false, error: rowsErr?.message || 'Could not load selected plants' };
    if (rows.length === 0) return { ok: false, error: 'Selected plants could not be found.' };
    const pendingRows = rows.filter((row) => !isPlantCareDateInClientDay(row.last_watered, parsedClientCareDay));
    // Only update plants not already watered today — never re-stamp already-done plants.
    if (pendingRows.length === 0) {
      return { ok: false, error: 'Selected plants are already marked watered today.' };
    }
    const idsToUpdate = pendingRows.map((row) => row.id as string);
    const rowsToLog = pendingRows;

    const when = wateringLoggedAtIso();
    const dateOnlyFallback = parsedClientCareDay?.todayDateKey ?? when.slice(0, 10);
    const { error } = await supabase.from('plants').update({ last_watered: when }).in('id', idsToUpdate);
    if (error) {
      const dateOnly = dateOnlyFallback;
      const { error: retryError } = await supabase
        .from('plants')
        .update({ last_watered: dateOnly })
        .in('id', idsToUpdate);
      if (retryError) {
        return { ok: false, error: retryError.message || error.message || 'Could not mark selected plants watered' };
      }
      await logPlantWateredActivities(
        supabase,
        rowsToLog.map((row) => (typeof row.name === 'string' ? row.name : '')),
        dateOnly,
      );
      await logActivity(
        'Plant Watered',
        undefined,
        `Bulk watered ${idsToUpdate.length} plant${idsToUpdate.length === 1 ? '' : 's'}. Last watered is now ${formatPlantCareInstant(dateOnly, 'profile')}.`,
        dateOnly,
      );
      return { ok: true, data: { updatedIds: idsToUpdate, when: dateOnly } };
    }

    await logPlantWateredActivities(
      supabase,
      rowsToLog.map((row) => (typeof row.name === 'string' ? row.name : '')),
      when,
    );
    await logActivity(
      'Plant Watered',
      undefined,
      `Bulk watered ${idsToUpdate.length} plant${idsToUpdate.length === 1 ? '' : 's'}. Last watered is now ${formatPlantCareInstant(when, 'profile')}.`,
      when,
    );
    return { ok: true, data: { updatedIds: idsToUpdate, when } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not mark selected plants watered' };
  }
}

export async function markAllWateredTodayAction(
  clientCareDay?: ClientCareDay,
  environment: PlantEnvironment = 'outdoor',
): Promise<ActionResult<{ when: string; total: number }>> {
  try {
    const parsedClientCareDay = parseClientCareDay(clientCareDay);
    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return auth;

    const { data: rows, error: rowsErr } = await supabase
      .from('plants')
      .select('id, last_watered')
      .eq('environment', environment);
    if (rowsErr || !rows) return { ok: false, error: rowsErr?.message || 'Could not load plants' };
    if (rows.length === 0) return { ok: false, error: 'No plants to update yet.' };
    const pendingIds = rows
      .filter((row) => !isPlantCareDateInClientDay(row.last_watered, parsedClientCareDay))
      .map((row) => row.id as string);
    if (pendingIds.length === 0) {
      return { ok: false, error: 'All plants are already marked watered today.' };
    }
    const when = wateringLoggedAtIso();
    const dateOnlyFallback = parsedClientCareDay?.todayDateKey ?? when.slice(0, 10);
    const { error } = await supabase.from('plants').update({ last_watered: when }).in('id', pendingIds);
    if (error) {
      const dateOnly = dateOnlyFallback;
      const { error: retryError } = await supabase
        .from('plants')
        .update({ last_watered: dateOnly })
        .in('id', pendingIds);
      if (retryError) {
        return { ok: false, error: retryError.message || error.message || 'Could not apply rainy day watering' };
      }
      const zoneLabel = environment === 'indoor' ? 'indoor' : 'outdoor';
      await logActivity(
        'Rainy Day',
        undefined,
        `Set last watered to ${formatPlantCareInstant(dateOnly, 'profile')} for ${pendingIds.length} ${zoneLabel} plants.`,
      );
      return { ok: true, data: { when: dateOnly, total: pendingIds.length } };
    }
    const zoneLabel = environment === 'indoor' ? 'indoor' : 'outdoor';
    await logActivity(
      'Rainy Day',
      undefined,
      `Set last watered to ${formatPlantCareInstant(when, 'profile')} for ${pendingIds.length} ${zoneLabel} plants.`,
    );
    return { ok: true, data: { when, total: pendingIds.length } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not apply rainy day watering' };
  }
}

export async function markFertilizedAction(
  id: string,
  clientCareDay?: ClientCareDay,
): Promise<ActionResult<{ alreadyToday: boolean; fertilizedDate: string; name: string }>> {
  try {
    const parsedClientCareDay = parseClientCareDay(clientCareDay);
    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return auth;

    const { data: plant, error: plantErr } = await supabase
      .from('plants')
      .select('id, name, last_fertilized, fertilizer_frequency_days')
      .eq('id', id)
      .single();
    if (plantErr || !plant) return { ok: false, error: plantErr?.message || 'Plant not found' };
    if (isPlantCareDateInClientDay(plant.last_fertilized, parsedClientCareDay)) {
      return {
        ok: true,
        data: { alreadyToday: true, fertilizedDate: plant.last_fertilized || '', name: plant.name },
      };
    }

    const { data: logRow, error: logError } = await supabase
      .from('activity_logs')
      .insert([{ action: 'Plant Fertilized', plant_name: plant.name }])
      .select('id, created_at')
      .single();
    if (logError || !logRow?.created_at) {
      return { ok: false, error: logError?.message || 'Failed to record fertilizing' };
    }

    // Prefer the client's local calendar day so late-evening AZ taps don't store UTC tomorrow.
    const fertilizedDate =
      parsedClientCareDay?.todayDateKey ?? format(new Date(logRow.created_at), 'yyyy-MM-dd');
    const { data: updated, error: plantError } = await supabase
      .from('plants')
      .update({ last_fertilized: fertilizedDate })
      .eq('id', id)
      .select('id');
    if (plantError || !updated?.length) {
      await supabase.from('activity_logs').delete().eq('id', logRow.id);
      return { ok: false, error: plantError?.message || 'Plant fertilizer date did not save.' };
    }

    const fertWhen = isValid(parseISO(fertilizedDate))
      ? format(parseISO(fertilizedDate), 'MMMM d, yyyy')
      : fertilizedDate;
    const fertilizerFrequencyDays = normalizeFertilizerFrequencyDays(plant.fertilizer_frequency_days, 30);
    await supabase
      .from('activity_logs')
      .update({
        details: `Last fertilized on this plant’s record is now ${fertWhen} (from the dashboard). ${fertilizerCadenceSentence(
          fertilizerFrequencyDays,
        )}`,
      })
      .eq('id', logRow.id);
    const { error: fertLogErr } = await supabase.from('fertilizer_logs').insert({
      plant_id: id,
      applied_on: fertilizedDate,
      notes: null,
    });
    if (fertLogErr) console.warn('fertilizer_logs insert:', fertLogErr);

    return { ok: true, data: { alreadyToday: false, fertilizedDate, name: plant.name } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not mark fertilized' };
  }
}

export async function deletePlantAction(id: string): Promise<ActionResult<{ name: string; deletedImages: number }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return auth;

    const { data: plant, error: plantErr } = await supabase
      .from('plants')
      .select('id, name, photo_url')
      .eq('id', id)
      .single();
    if (plantErr || !plant) return { ok: false, error: plantErr?.message || 'Plant not found' };

    const { data: galleryRows } = await supabase.from('plant_photos').select('photo_url').eq('plant_id', id);
    const urls = new Set<string>();
    galleryRows?.forEach((row: { photo_url: string }) => {
      if (row.photo_url) urls.add(row.photo_url);
    });
    if (plant.photo_url) urls.add(plant.photo_url);

    const deletePaths = Array.from(urls)
      .map(toStoragePath)
      .filter((path): path is string => Boolean(path));
    if (deletePaths.length > 0) {
      const { error: storageErr } = await supabase.storage.from('plant-photos').remove(deletePaths);
      if (storageErr) console.warn('storage delete error:', storageErr);
    }

    await supabase.from('plant_photos').delete().eq('plant_id', id);
    const { error } = await supabase.from('plants').delete().eq('id', id);
    if (error) return { ok: false, error: error.message || 'Failed to delete plant' };

    const imgCount = urls.size;
    await logActivity(
      'Plant Deleted',
      plant.name,
      imgCount > 0
        ? `Removed the plant and deleted ${imgCount} image file${imgCount === 1 ? '' : 's'} from storage.`
        : 'Removed the plant record.',
    );
    return { ok: true, data: { name: plant.name, deletedImages: imgCount } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to delete plant' };
  }
}

export async function clearActivityLogAction(): Promise<ActionResult<null>> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireSignedInUser(supabase);
    if (!auth.ok) return auth;

    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) return { ok: false, error: error.message || 'Failed to clear log' };
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to clear log' };
  }
}
