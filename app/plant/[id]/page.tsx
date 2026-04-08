'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { FertilizerSeason, FertilizerLogRow, Plant } from '@/lib/plant-types';
import { normalizePlantRow } from '@/lib/plant-helpers';
import {
  ALL_FERTILIZER_SEASONS,
  fertilizerUrgency,
  formatNextFertilizationDue,
  normalizeFertilizerSeasons,
  seasonLabel,
} from '@/lib/fertilizer-schedule';
import { FertilizerSeasonCheckboxes } from '@/components/FertilizerSeasonCheckboxes';
import { deletePlantImageFromStorage } from '@/lib/storage-upload';
import { getGardenMode } from '@/lib/garden-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast, Toaster } from 'sonner';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Droplet,
  Sprout,
  Star,
  CheckSquare,
  Square,
  NotebookPen,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { addDays } from 'date-fns';
import { cn } from '@/lib/utils';

type PlantPhotoRow = {
  id: string;
  plant_id: string;
  photo_url: string;
  created_at: string;
};

function formatCareDay(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return isValid(d) ? format(d, 'MMMM d, yyyy') : 'Never';
}

function formatLogWhen(iso: string): string {
  const d = new Date(iso);
  return isValid(d) ? format(d, 'MMM d, yyyy • h:mm a') : iso;
}

const WATER_ACTIONS = new Set(['Plant Watered', 'Watered', 'Plant Watered Today', 'Watered Today']);
const FERT_ACTIONS = new Set(['Plant Fertilized', 'Fertilized', 'Plant Fertilized Today', 'Fertilized Today']);

function isWaterLogAction(action: string) {
  if (WATER_ACTIONS.has(action)) return true;
  return /\bwater(ed)?\b/i.test(action);
}

function isFertLogAction(action: string) {
  if (FERT_ACTIONS.has(action)) return true;
  return action.toLowerCase().includes('fertiliz');
}

function formatDueLine(iso: string | null, freqDays: number): string {
  if (!iso || freqDays < 1) return '';
  const last = new Date(iso);
  const due = addDays(last, freqDays);
  if (!isValid(last) || !isValid(due)) return '';
  return `Next due ~ ${format(due, 'MMM d, yyyy')}`;
}

export default function PlantProfile() {
  const params = useParams();
  const router = useRouter();
  const plantId = params.id as string;

  const [plant, setPlant] = useState<Plant | null>(null);
  const [photos, setPhotos] = useState<PlantPhotoRow[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settingProfileForUrl, setSettingProfileForUrl] = useState<string | null>(null);
  const [photoSelectMode, setPhotoSelectMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [careBusy, setCareBusy] = useState<'water' | 'fert' | null>(null);
  const [isWriteDisabled, setIsWriteDisabled] = useState(false);
  const [fertilizerLogs, setFertilizerLogs] = useState<FertilizerLogRow[]>([]);
  const [fertDraft, setFertDraft] = useState<{ seasons: FertilizerSeason[]; notes: string }>({
    seasons: [...ALL_FERTILIZER_SEASONS],
    notes: '',
  });
  const [fertSettingsBusy, setFertSettingsBusy] = useState(false);
  const [plantNotesDraft, setPlantNotesDraft] = useState('');
  const [plantNotesBusy, setPlantNotesBusy] = useState(false);

  useEffect(() => {
    setIsWriteDisabled(getGardenMode() === 'demo');
  }, []);

  const fetchPlant = useCallback(async () => {
    const { data, error } = await supabase
      .from('plants')
      .select('*')
      .eq('id', plantId)
      .single();

    if (error) {
      toast.error('Plant not found');
      router.push('/');
      return null;
    }
    const normalized = normalizePlantRow(data as Plant);
    setPlant(normalized);
    setLoading(false);
    return normalized;
  }, [plantId, router]);

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('plant_photos')
      .select('*')
      .eq('plant_id', plantId)
      .order('created_at', { ascending: false });
    setPhotos((data || []) as PlantPhotoRow[]);
  }, [plantId]);

  const fetchActivities = useCallback(
    async (plantName: string) => {
      if (!plantName) return;
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('plant_name', plantName)
        .order('created_at', { ascending: false })
        .limit(120);
      setActivities(data || []);
    },
    [],
  );

  const fetchFertilizerLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('fertilizer_logs')
      .select('*')
      .eq('plant_id', plantId)
      .order('applied_on', { ascending: false })
      .limit(80);
    if (error) {
      console.warn('fertilizer_logs:', error.message);
      setFertilizerLogs([]);
      return;
    }
    setFertilizerLogs((data || []) as FertilizerLogRow[]);
  }, [plantId]);

  const logActivityDb = async (action: string, plantName: string) => {
    await supabase.from('activity_logs').insert([{ action, plant_name: plantName }]);
  };

  const markWateredFromProfile = async () => {
    if (!plant || isWriteDisabled) return;
    setCareBusy('water');
    try {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('plants').update({ last_watered: today }).eq('id', plantId);
      if (error) throw error;
      await logActivityDb('Plant Watered', plant.name);
      toast.success(`${plant.name} watered`);
      await fetchPlant();
      await fetchActivities(plant.name);
    } catch (e) {
      console.error(e);
      toast.error('Could not update watering');
    } finally {
      setCareBusy(null);
    }
  };

  const markFertilizedFromProfile = async () => {
    if (!plant || isWriteDisabled) return;
    setCareBusy('fert');
    try {
      const { data: logRow, error: logError } = await supabase
        .from('activity_logs')
        .insert([{ action: 'Plant Fertilized', plant_name: plant.name }])
        .select('id, created_at')
        .single();

      if (logError || !logRow?.created_at) {
        toast.error(logError?.message ?? 'Failed to record fertilizing');
        return;
      }

      const fertilizedDate = format(new Date(logRow.created_at), 'yyyy-MM-dd');

      const { data: updated, error: plantError } = await supabase
        .from('plants')
        .update({ last_fertilized: fertilizedDate })
        .eq('id', plantId)
        .select('id');

      if (plantError || !updated?.length) {
        await supabase.from('activity_logs').delete().eq('id', logRow.id);
        toast.error(plantError?.message ?? 'Could not save fertilizer date');
        await fetchActivities(plant.name);
        return;
      }

      toast.success(`${plant.name} fertilized`);
      const { error: fertLogErr } = await supabase.from('fertilizer_logs').insert({
        plant_id: plantId,
        applied_on: fertilizedDate,
        notes: null,
      });
      if (fertLogErr) console.warn('fertilizer_logs insert:', fertLogErr);
      await fetchPlant();
      await fetchFertilizerLogs();
      await fetchActivities(plant.name);
    } catch (e) {
      console.error(e);
      toast.error('Could not update fertilizing');
    } finally {
      setCareBusy(null);
    }
  };

  const saveFertilizerSettings = async () => {
    if (!plant || isWriteDisabled) return;
    setFertSettingsBusy(true);
    try {
      const { error } = await supabase
        .from('plants')
        .update({
          fertilizer_seasons: normalizeFertilizerSeasons(fertDraft.seasons),
          fertilizer_notes: fertDraft.notes.trim() || null,
        })
        .eq('id', plantId);
      if (error) throw error;
      toast.success('Fertilizer schedule saved');
      await fetchPlant();
    } catch (e) {
      console.error(e);
      toast.error('Could not save fertilizer settings');
    } finally {
      setFertSettingsBusy(false);
    }
  };

  const savePlantNotes = async () => {
    if (!plant || isWriteDisabled) return;
    setPlantNotesBusy(true);
    try {
      const { error } = await supabase
        .from('plants')
        .update({ notes: plantNotesDraft.trim() || null })
        .eq('id', plantId);
      if (error) throw error;
      toast.success('Notes saved');
      await fetchPlant();
    } catch (e) {
      console.error(e);
      toast.error('Could not save notes — add the `notes` column if you see a schema error.');
    } finally {
      setPlantNotesBusy(false);
    }
  };

  useEffect(() => {
    if (!plantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const p = await fetchPlant();
      if (cancelled) return;
      await fetchPhotos();
      if (cancelled) return;
      await fetchFertilizerLogs();
      if (cancelled || !p?.name) return;
      await fetchActivities(p.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [plantId, fetchPlant, fetchPhotos, fetchFertilizerLogs, fetchActivities]);

  useEffect(() => {
    if (!plant) return;
    setFertDraft({
      seasons: normalizeFertilizerSeasons(plant.fertilizer_seasons),
      notes: plant.fertilizer_notes ?? '',
    });
    setPlantNotesDraft(plant.notes ?? '');
  }, [plant?.id]);

  const togglePhotoSelected = (id: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPhotos = () => {
    if (selectedPhotoIds.size === photos.length) {
      setSelectedPhotoIds(new Set());
      return;
    }
    setSelectedPhotoIds(new Set(photos.map((p) => p.id)));
  };

  const removePhotoFromState = (photoId: string, photoUrl: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setPlant((prev) =>
      prev && prev.photo_url === photoUrl ? { ...prev, photo_url: null } : prev,
    );
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
  };

  /** Only clears plants.photo_url if it still matches (safe for concurrent/bulk deletes). */
  const deletePhotoFromDbAndStorage = async (photoId: string, photoUrl: string) => {
    const storageError = await deletePlantImageFromStorage(photoUrl);
    if (storageError) {
      console.error('Storage delete failed:', storageError);
      throw new Error('storage');
    }
    const { error: dbError } = await supabase.from('plant_photos').delete().eq('id', photoId);
    if (dbError) throw dbError;
    await supabase
      .from('plants')
      .update({ photo_url: null })
      .eq('id', plantId)
      .eq('photo_url', photoUrl);
  };

  const deletePhoto = async (photoId: string, photoUrl: string) => {
    if (!confirm('Delete this photo permanently? This cannot be undone.')) return;
    setBusyId(photoId);
    try {
      await deletePhotoFromDbAndStorage(photoId, photoUrl);
      removePhotoFromState(photoId, photoUrl);
      toast.success('Photo deleted');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to delete photo');
    } finally {
      setBusyId(null);
    }
  };

  const deleteSelectedPhotos = async () => {
    const ids = [...selectedPhotoIds];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} selected photo(s) permanently? This cannot be undone.`,
      )
    )
      return;

    setBulkDeleting(true);
    try {
      for (const id of ids) {
        const row = photos.find((p) => p.id === id);
        if (!row) continue;
        try {
          await deletePhotoFromDbAndStorage(id, row.photo_url);
        } catch {
          toast.error('Some photos could not be deleted');
          await fetchPlant();
          await fetchPhotos();
          if (plant?.name) await fetchActivities(plant.name);
          return;
        }
      }
      toast.success('Selected photos deleted');
      setPhotoSelectMode(false);
      setSelectedPhotoIds(new Set());
      await fetchPlant();
      await fetchPhotos();
      if (plant?.name) await fetchActivities(plant.name);
    } finally {
      setBulkDeleting(false);
    }
  };

  const setAsProfilePicture = async (photoUrl: string) => {
    setSettingProfileForUrl(photoUrl);
    try {
      const { error } = await supabase.from('plants').update({ photo_url: photoUrl }).eq('id', plantId);
      if (error) throw error;
      setPlant((prev) => (prev ? { ...prev, photo_url: photoUrl } : null));
      toast.success('Profile picture updated');
    } catch (err) {
      console.error(err);
      toast.error('Could not set profile picture');
    } finally {
      setSettingProfileForUrl(null);
    }
  };

  const careLogs = activities.filter((log) => isWaterLogAction(log.action) || isFertLogAction(log.action));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-desert-page dark:bg-zinc-950">
        Loading plant profile...
      </div>
    );
  }

  if (!plant) {
    return <div className="min-h-screen flex items-center justify-center">Plant not found</div>;
  }

  const fertU = fertilizerUrgency(plant);
  const plantSeasons = normalizeFertilizerSeasons(plant.fertilizer_seasons);
  const fertDraftMatchesPlant =
    JSON.stringify(normalizeFertilizerSeasons(fertDraft.seasons)) === JSON.stringify(plantSeasons) &&
    (fertDraft.notes.trim() || '') === (plant.fertilizer_notes ?? '').trim();
  const plantNotesMatchesPlant =
    (plantNotesDraft.trim() || '') === ((plant.notes ?? '').trim());

  return (
    <div className="min-h-screen bg-desert-page dark:bg-zinc-950 text-desert-ink dark:text-white">
      <Toaster position="top-center" richColors />

      <header className="sticky top-0 z-50 bg-desert-parchment/95 dark:bg-zinc-900/95 backdrop-blur border-b border-desert-border dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-oasis dark:text-emerald-400">{plant.name}</h1>
            <Badge className="mt-1">
              {plant.container_type} • {plant.pot_size}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-4 pb-10 sm:pt-6 space-y-12">
        {/* Profile picture — first so it reads as the hero */}
        {plant.photo_url && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5" /> Profile picture
            </h2>
            <div className="relative rounded-3xl overflow-hidden border border-desert-border dark:border-zinc-700 shadow-sm">
              <img
                src={plant.photo_url}
                alt={plant.name}
                className="w-full max-h-[min(420px,55vh)] object-cover"
              />
            </div>
            <p className="mt-2 text-sm text-desert-dust dark:text-zinc-500">
              Choose a different image from photo history below, or add one from the garden dashboard.
            </p>
          </div>
        )}

        {/* Care summary + last watered / fertilized */}
        <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Care &amp; schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 rounded-2xl border border-desert-mist/80 bg-white/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <Droplet className="h-8 w-8 shrink-0 text-sky-600 dark:text-sky-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-desert-dust dark:text-zinc-500">
                    Last watered
                  </p>
                  <p className="text-lg font-semibold text-desert-ink dark:text-white">
                    {formatCareDay(plant.last_watered)}
                  </p>
                  <p className="text-sm text-desert-sage dark:text-zinc-400">
                    Every {plant.watering_frequency_days} day{plant.watering_frequency_days === 1 ? '' : 's'} ·{' '}
                    {formatDueLine(plant.last_watered, plant.watering_frequency_days) || '—'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-2xl border border-desert-mist/80 bg-white/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <Sprout className="h-8 w-8 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-desert-dust dark:text-zinc-500">
                    Last fertilized
                  </p>
                  <p className="text-lg font-semibold text-desert-ink dark:text-white">
                    {formatCareDay(plant.last_fertilized)}
                  </p>
                  <p className="text-sm text-desert-sage dark:text-zinc-400">
                    Every {plant.fertilizer_frequency_days} day
                    {plant.fertilizer_frequency_days === 1 ? '' : 's'} · Next (in active seasons):{' '}
                    <span
                      className={cn(
                        fertU === 'overdue' || fertU === 'due_soon'
                          ? 'font-medium text-orange-600 dark:text-orange-400'
                          : '',
                      )}
                    >
                      {formatNextFertilizationDue(plant)}
                    </span>
                  </p>
                  <p className="text-xs text-desert-dust dark:text-zinc-500">
                    Fertilize in: {plantSeasons.map(seasonLabel).join(', ')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fertU === 'off_season' ? (
                      <Badge variant="secondary" className="text-xs font-normal">
                        Fertilizer off-season
                      </Badge>
                    ) : null}
                    {fertU === 'overdue' ? (
                      <Badge className="bg-red-600 text-white hover:bg-red-600 text-xs">Needs fertilizer now</Badge>
                    ) : null}
                    {fertU === 'due_soon' ? (
                      <Badge className="bg-amber-600 text-white hover:bg-amber-600 text-xs">Due within a week</Badge>
                    ) : null}
                    {fertU === 'due_month' ? (
                      <Badge variant="outline" className="border-amber-600 text-amber-800 dark:text-amber-300 text-xs">
                        Due this month
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-desert-mist/60 pt-4 dark:border-zinc-700">
              <Button
                type="button"
                className="rounded-full bg-oasis hover:bg-oasis-hover dark:bg-emerald-600"
                disabled={isWriteDisabled || careBusy !== null}
                onClick={() => void markWateredFromProfile()}
              >
                {careBusy === 'water' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Droplet className="mr-2 h-4 w-4" />
                )}
                Watered today
              </Button>
              <Button
                type="button"
                className="rounded-full bg-amber-600 hover:bg-amber-700 text-white"
                disabled={isWriteDisabled || careBusy !== null}
                onClick={() => void markFertilizedFromProfile()}
              >
                {careBusy === 'fert' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sprout className="mr-2 h-4 w-4" />
                )}
                Fertilized today
              </Button>
              {isWriteDisabled ? (
                <p className="w-full text-xs text-amber-700 dark:text-amber-400">Demo mode — care actions are disabled.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <NotebookPen className="h-5 w-5 text-oasis dark:text-emerald-400" />
              Plant notes
            </CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-500">
              Shared space for anything you both want to remember—pests, pruning, repotting, observations, or
              “water extra when it hits 110°F.”
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="profile-plant-notes" className="sr-only">
                Plant notes
              </Label>
              <Textarea
                id="profile-plant-notes"
                value={plantNotesDraft}
                onChange={(e) => setPlantNotesDraft(e.target.value)}
                placeholder="Type notes here… (saved to this plant for everyone using the garden)"
                disabled={isWriteDisabled}
                className="min-h-[160px] resize-y text-base leading-relaxed"
              />
            </div>
            <Button
              type="button"
              className="rounded-full bg-oasis hover:bg-oasis-hover dark:bg-emerald-600"
              disabled={isWriteDisabled || plantNotesBusy || plantNotesMatchesPlant}
              onClick={() => void savePlantNotes()}
            >
              {plantNotesBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save notes
            </Button>
            {isWriteDisabled ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">Demo mode — notes are read-only.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sprout className="h-5 w-5 text-amber-600" />
              Fertilizer schedule
            </CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-500">
              Seasons use a simple Northern Hemisphere calendar (e.g. spring = Mar–May). The next due date only
              counts during the seasons you enable.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Active seasons</Label>
              <FertilizerSeasonCheckboxes
                idPrefix="profile-fert-season"
                value={fertDraft.seasons}
                onChange={(seasons) => setFertDraft((d) => ({ ...d, seasons }))}
                disabled={isWriteDisabled}
              />
            </div>
            <div>
              <Label htmlFor="profile-fert-notes">Notes</Label>
              <Textarea
                id="profile-fert-notes"
                value={fertDraft.notes}
                onChange={(e) => setFertDraft((d) => ({ ...d, notes: e.target.value }))}
                className="mt-1 min-h-[88px]"
                placeholder="e.g. 10-10-10 balanced, half strength"
                disabled={isWriteDisabled}
              />
            </div>
            <Button
              type="button"
              className="rounded-full bg-amber-700 hover:bg-amber-800 text-white"
              disabled={isWriteDisabled || fertSettingsBusy || fertDraftMatchesPlant}
              onClick={() => void saveFertilizerSettings()}
            >
              {fertSettingsBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save fertilizer settings
            </Button>
            {isWriteDisabled ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">Demo mode — editing is disabled.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sprout className="h-5 w-5 text-amber-600" />
              Fertilizer history
            </CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-500">
              Recorded when you tap “Fertilized today” here or on the dashboard (after the fertilizer log table
              exists in your database).
            </p>
          </CardHeader>
          <CardContent>
            {fertilizerLogs.length === 0 ? (
              <p className="py-8 text-center text-desert-dust dark:text-zinc-500">
                No fertilizer applications logged yet.
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {fertilizerLogs.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-desert-mist/60 bg-white/60 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50"
                  >
                    <span className="font-medium text-desert-ink dark:text-zinc-100">
                      {formatCareDay(row.applied_on)}
                    </span>
                    {row.notes ? (
                      <span className="text-xs text-desert-sage dark:text-zinc-400">{row.notes}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Water / fertilizer log (from activity_logs) */}
        <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Droplet className="h-5 w-5 text-sky-600" />
              Water &amp; fertilizer log
            </CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-500">
              Each line is a time you (or someone) logged watering or fertilizing from this profile or the home
              dashboard. The cards above show the dates saved on the plant.
            </p>
          </CardHeader>
          <CardContent>
            {careLogs.length === 0 ? (
              <p className="py-8 text-center text-desert-dust dark:text-zinc-500">
                No watering or fertilizing events logged for this plant yet.
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {careLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-desert-mist/60 bg-white/60 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50"
                  >
                    <span className="font-medium text-desert-ink dark:text-zinc-100">
                      {isWaterLogAction(log.action) ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Droplet className="h-4 w-4 text-sky-600" />
                          Watered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Sprout className="h-4 w-4 text-amber-600" />
                          Fertilized
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-desert-dust dark:text-zinc-500">
                      {log.action}
                    </span>
                    <span className="shrink-0 text-xs text-desert-dust dark:text-zinc-500">
                      {formatLogWhen(log.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Photo History */}
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">📸 Photo history</h2>
              <p className="text-sm text-desert-dust dark:text-zinc-500 mt-1">
                {photos.length} photo{photos.length === 1 ? '' : 's'} in timeline. Tap{' '}
                <span className="font-medium text-desert-ink dark:text-zinc-300">Select photos</span> to choose
                several, then delete. Use <span className="font-medium text-desert-ink dark:text-zinc-300">Use as profile</span>{' '}
                on any shot to make it the home / card picture.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {photoSelectMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={selectAllPhotos}
                    disabled={photos.length === 0}
                  >
                    {selectedPhotoIds.size === photos.length ? 'Deselect all' : 'Select all'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="rounded-full"
                    disabled={selectedPhotoIds.size === 0 || bulkDeleting}
                    onClick={() => void deleteSelectedPhotos()}
                  >
                    {bulkDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Delete (${selectedPhotoIds.size})`
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setPhotoSelectMode(false);
                      setSelectedPhotoIds(new Set());
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setPhotoSelectMode(true)}
                  disabled={photos.length === 0}
                >
                  <CheckSquare className="h-4 w-4 mr-1.5" />
                  Select photos
                </Button>
              )}
            </div>
          </div>

          {photos.length === 0 ? (
            <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
              <CardContent className="py-12 text-center">
                <p className="text-desert-dust dark:text-zinc-500">No timeline photos yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {photos.map((photo) => {
                const isProfile = plant.photo_url === photo.photo_url;
                const isSelected = selectedPhotoIds.has(photo.id);
                const busy = busyId === photo.id;
                const setting = settingProfileForUrl === photo.photo_url;

                return (
                  <div
                    key={photo.id}
                    className={cn(
                      'flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-shadow',
                      isSelected
                        ? 'border-oasis ring-2 ring-oasis/40 dark:border-emerald-500 dark:ring-emerald-500/30'
                        : 'border-desert-border dark:border-zinc-700',
                    )}
                  >
                    <div className="relative group shrink-0">
                      {photoSelectMode && (
                        <button
                          type="button"
                          onClick={() => togglePhotoSelected(photo.id)}
                          className="absolute left-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md ring-1 ring-desert-border dark:bg-zinc-900 dark:ring-zinc-600"
                          aria-label={isSelected ? 'Deselect photo' : 'Select photo'}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-oasis dark:text-emerald-400" />
                          ) : (
                            <Square className="h-5 w-5 text-desert-dust" />
                          )}
                        </button>
                      )}

                      <img
                        src={photo.photo_url}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />

                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {isProfile && (
                            <Badge className="border-0 bg-white/25 text-white backdrop-blur-sm">Profile</Badge>
                          )}
                          <p className="text-xs text-white">
                            {format(new Date(photo.created_at), 'MMM d, yyyy • h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {!photoSelectMode ? (
                      <div className="flex flex-col gap-1.5 border-t border-desert-border/60 bg-desert-parchment/90 p-2 dark:border-zinc-600 dark:bg-zinc-800/95">
                        <Button
                          type="button"
                          size="sm"
                          variant={isProfile ? 'secondary' : 'outline'}
                          className="h-9 w-full justify-center gap-1.5 rounded-lg text-xs sm:text-sm"
                          disabled={isProfile || setting}
                          onClick={() => void setAsProfilePicture(photo.photo_url)}
                        >
                          {setting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Star className={cn('h-4 w-4', isProfile && 'fill-amber-400 text-amber-600')} />
                          )}
                          {isProfile ? 'Current profile photo' : 'Use as profile photo'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-9 w-full justify-center gap-1.5 rounded-lg text-xs sm:text-sm"
                          disabled={busy}
                          onClick={() => void deletePhoto(photo.id, photo.photo_url)}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Delete photo
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Full activity History */}
        <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">🌱 All activity</CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-500">
              Edits, photos, and other actions for this plant.
            </p>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-center py-12 text-desert-dust dark:text-zinc-500">
                No activity logged for this plant yet.
              </p>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
                {activities.map((log) => (
                  <div
                    key={log.id}
                    className="flex justify-between items-start gap-3 p-4 bg-white/60 dark:bg-zinc-800/60 rounded-2xl border border-desert-mist dark:border-zinc-700"
                  >
                    <div className="font-medium">{log.action}</div>
                    <div className="text-right text-xs text-desert-dust dark:text-zinc-500 whitespace-nowrap">
                      {formatLogWhen(log.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
