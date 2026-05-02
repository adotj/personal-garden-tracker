'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import type { FertilizerSeason, FertilizerLogRow, Plant, PlantNoteEntry, SunExposure } from '@/lib/plant-types';
import { SUN_EXPOSURE_OPTIONS, sunExposureLabel } from '@/lib/plant-types';
import {
  formatPlantCareInstant,
  isoOrDateToDateInputValue,
  isPlantCareDateToday,
  normalizePlantRow,
  normalizeSunExposure,
  plantUpdateCorePayload,
  plantUpdateExtendedPatch,
  wateringLoggedAtIso,
} from '@/lib/plant-helpers';
import {
  ALL_FERTILIZER_SEASONS,
  fertilizerUrgency,
  formatNextFertilizationDue,
  normalizeFertilizerSeasons,
  seasonLabel,
} from '@/lib/fertilizer-schedule';
import { FertilizerSeasonCheckboxes } from '@/components/FertilizerSeasonCheckboxes';
import { deletePlantImageFromStorage, uploadPlantImage } from '@/lib/storage-upload';
import { datetimeLocalToIsoUtc, defaultPhotoTimelineFromFile, toDatetimeLocalValue } from '@/lib/photo-timeline';
import { buildPlantTroubleshootingPrompt } from '@/lib/plant-ai-prompt';
import { getGardenMode } from '@/lib/garden-session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Camera,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Sprout,
  Star,
  CheckSquare,
  Square,
  NotebookPen,
  Sun,
  CalendarClock,
  Sparkles,
  Pencil,
  MapPin,
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

type HeaderPotOption = {
  id: string;
  label: string;
  container_type: string;
  pot_size: string;
};

const HEADER_POT_OPTIONS: readonly HeaderPotOption[] = [
  { id: 'pot-4', label: '4" Pot', container_type: 'Pot', pot_size: '4" Pot' },
  { id: 'pot-6', label: '6" Pot', container_type: 'Pot', pot_size: '6" Pot' },
  { id: 'pot-10', label: '10" Pot', container_type: 'Pot', pot_size: '10" Pot' },
  { id: 'pot-14', label: '14" Pot', container_type: 'Pot', pot_size: '14" Pot' },
  { id: 'pot-20', label: '20" Pot', container_type: 'Pot', pot_size: '20" Pot' },
  { id: 'grow-bag', label: 'Grow Bag', container_type: 'Grow Bag', pot_size: '10 gallon' },
  { id: 'raised-bed', label: 'Raised Bed', container_type: 'Raised Bed', pot_size: 'Raised Bed' },
  { id: 'ground', label: 'Ground / In-Ground', container_type: 'Ground', pot_size: 'In-Ground' },
  { id: 'other', label: 'Other', container_type: 'Other', pot_size: '' },
];

const HEADER_LOCATION_PRESETS = [
  'Back Patio',
  'Raised Bed #3',
  'East Balcony',
  'Front Yard',
  'Greenhouse',
  'South Window',
] as const;

const HEADER_LOCATION_NONE = '__none__';
const HEADER_LOCATION_OTHER = '__other__';

function matchHeaderPotOption(plant: Plant): { optionId: string; customDetail: string } {
  const found = HEADER_POT_OPTIONS.find(
    (o) => o.id !== 'other' && o.container_type === plant.container_type && o.pot_size === plant.pot_size,
  );
  if (found) return { optionId: found.id, customDetail: '' };
  return {
    optionId: 'other',
    customDetail:
      plant.container_type === 'Other'
        ? plant.pot_size.trim()
        : `${plant.container_type} • ${plant.pot_size}`.trim(),
  };
}

function resolvePotFromHeaderSelection(
  optionId: string,
  customDetail: string,
): { container_type: string; pot_size: string } {
  const opt = HEADER_POT_OPTIONS.find((o) => o.id === optionId);
  const trimmed = customDetail.trim();
  // Preset rows ignore custom text so switching away from “Other” cannot save stale text as pot_size.
  if (opt && opt.id !== 'other') {
    return { container_type: opt.container_type, pot_size: opt.pot_size };
  }
  if (trimmed) {
    return { container_type: 'Pot', pot_size: trimmed };
  }
  return { container_type: 'Other', pot_size: 'Custom' };
}

/** Uses custom detail only when “Other” is selected — avoids stale React state after preset changes. */
function resolvePotWhenChangingPreset(optionId: string, headerPotCustom: string): {
  container_type: string;
  pot_size: string;
} {
  if (optionId === 'other') {
    return resolvePotFromHeaderSelection('other', headerPotCustom);
  }
  return resolvePotFromHeaderSelection(optionId, '');
}

function matchLocationPreset(location: string | null | undefined): { preset: string; custom: string } {
  const t = location?.trim() ?? '';
  if (!t) return { preset: HEADER_LOCATION_NONE, custom: '' };
  if ((HEADER_LOCATION_PRESETS as readonly string[]).includes(t)) {
    return { preset: t, custom: '' };
  }
  return { preset: HEADER_LOCATION_OTHER, custom: t };
}

/** PostgREST: unknown column in payload (schema behind repo migrations). */
function isSchemaColumnMissingError(error: { code?: string; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204') return true;
  const m = error.message ?? '';
  return m.includes('Could not find the') && m.includes('column');
}

export default function PlantProfile() {
  const params = useParams();
  const router = useRouter();
  const plantId = params.id as string;

  const [plant, setPlant] = useState<Plant | null>(null);
  /** Avoid stale closures when saving header fields after rapid dropdown changes. */
  const plantRef = useRef<Plant | null>(null);
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
  const [wateringDraft, setWateringDraft] = useState<{ frequencyDays: string; lastWatered: string }>({
    frequencyDays: '',
    lastWatered: '',
  });
  const [wateringSettingsBusy, setWateringSettingsBusy] = useState(false);
  const [plantNoteEntries, setPlantNoteEntries] = useState<PlantNoteEntry[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [noteAddBusy, setNoteAddBusy] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [photoDateDialog, setPhotoDateDialog] = useState<{ id: string; datetimeLocal: string } | null>(null);
  const [photoDateSaving, setPhotoDateSaving] = useState(false);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState<number | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [headerEditMode, setHeaderEditMode] = useState(false);
  const [headerPotOptionId, setHeaderPotOptionId] = useState('pot-14');
  const [headerPotCustom, setHeaderPotCustom] = useState('');
  const [headerSun, setHeaderSun] = useState<SunExposure>('full_sun');
  const [headerLocationPreset, setHeaderLocationPreset] = useState(HEADER_LOCATION_NONE);
  const [headerLocationCustom, setHeaderLocationCustom] = useState('');
  const [headerSaveBusy, setHeaderSaveBusy] = useState(false);
  const headerBaselineRef = useRef<{
    container_type: string;
    pot_size: string;
    sun_exposure: SunExposure;
    location_in_garden: string | null | undefined;
  } | null>(null);
  const timelineUploadInputRef = useRef<HTMLInputElement>(null);
  const timelineCameraInputRef = useRef<HTMLInputElement>(null);
  const slideshowTouchStartXRef = useRef<number | null>(null);
  const slideshowTouchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    setIsWriteDisabled(getGardenMode() === 'demo');
  }, []);

  useEffect(() => {
    plantRef.current = plant;
  }, [plant]);

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

  useEffect(() => {
    if (!plant) return;
    const potMatch = matchHeaderPotOption(plant);
    setHeaderPotOptionId(potMatch.optionId);
    setHeaderPotCustom(potMatch.customDetail);
    setHeaderSun(normalizeSunExposure(plant.sun_exposure));
    const loc = matchLocationPreset(plant.location_in_garden);
    setHeaderLocationPreset(loc.preset);
    setHeaderLocationCustom(loc.custom);
    headerBaselineRef.current = {
      container_type: plant.container_type,
      pot_size: plant.pot_size,
      sun_exposure: normalizeSunExposure(plant.sun_exposure),
      location_in_garden: plant.location_in_garden ?? '',
    };
  }, [plant?.id]);

  const resolveHeaderLocationValue = useCallback((preset: string, custom: string): string | null => {
    const c = custom.trim();
    if (preset === HEADER_LOCATION_NONE || preset === '') return null;
    if (preset === HEADER_LOCATION_OTHER) return c || null;
    return preset;
  }, []);

  const saveHeaderProfileFields = useCallback(
    async (next: {
      container_type: string;
      pot_size: string;
      sun_exposure: SunExposure;
      location_in_garden: string | null;
    }) => {
      const basePlant = plantRef.current;
      if (!basePlant || isWriteDisabled) return;
      const base = headerBaselineRef.current;
      const locNext = next.location_in_garden ?? '';
      const locBase = (base?.location_in_garden ?? '').trim();
      if (
        base &&
        base.container_type === next.container_type &&
        base.pot_size === next.pot_size &&
        base.sun_exposure === next.sun_exposure &&
        locBase === locNext.trim()
      ) {
        return;
      }
      const merged: Plant = {
        ...basePlant,
        container_type: next.container_type,
        pot_size: next.pot_size,
        sun_exposure: next.sun_exposure,
        location_in_garden: next.location_in_garden ?? undefined,
      };
      plantRef.current = merged;
      setPlant(merged);
      setHeaderSaveBusy(true);
      try {
        const { error: coreError } = await supabase
          .from('plants')
          .update(plantUpdateCorePayload(merged))
          .eq('id', plantId);
        if (coreError) throw coreError;

        const { error: extError } = await supabase
          .from('plants')
          .update(plantUpdateExtendedPatch(merged))
          .eq('id', plantId);

        if (extError) {
          if (isSchemaColumnMissingError(extError)) {
            console.warn('plants extended columns missing or outdated schema:', extError.message);
            toast.success('Saved container & pot', { duration: 2200 });
            toast.message('Sun / location not synced to database', {
              description: 'Your Supabase project is missing newer columns (e.g. sun_exposure). Apply repo migrations to plants, then save again.',
              duration: 8000,
            });
          } else {
            throw extError;
          }
        } else {
          toast.success('Saved', { duration: 2000 });
        }

        headerBaselineRef.current = {
          container_type: merged.container_type,
          pot_size: merged.pot_size,
          sun_exposure: normalizeSunExposure(merged.sun_exposure),
          location_in_garden: merged.location_in_garden ?? '',
        };
        await fetchPlant();
      } catch (e) {
        console.error(e);
        toast.error('Could not save');
        await fetchPlant();
      } finally {
        setHeaderSaveBusy(false);
      }
    },
    [isWriteDisabled, plantId, fetchPlant],
  );

  const enterHeaderEditMode = useCallback(() => {
    if (!plant || isWriteDisabled) return;
    const potMatch = matchHeaderPotOption(plant);
    setHeaderPotOptionId(potMatch.optionId);
    setHeaderPotCustom(potMatch.customDetail);
    setHeaderSun(normalizeSunExposure(plant.sun_exposure));
    const loc = matchLocationPreset(plant.location_in_garden);
    setHeaderLocationPreset(loc.preset);
    setHeaderLocationCustom(loc.custom);
    headerBaselineRef.current = {
      container_type: plant.container_type,
      pot_size: plant.pot_size,
      sun_exposure: normalizeSunExposure(plant.sun_exposure),
      location_in_garden: plant.location_in_garden ?? '',
    };
    setHeaderEditMode(true);
  }, [plant, isWriteDisabled]);

  const commitHeaderFromState = useCallback(() => {
    const pot = resolvePotFromHeaderSelection(headerPotOptionId, headerPotCustom);
    const locationVal = resolveHeaderLocationValue(headerLocationPreset, headerLocationCustom);
    void saveHeaderProfileFields({
      ...pot,
      sun_exposure: headerSun,
      location_in_garden: locationVal,
    });
  }, [
    headerPotOptionId,
    headerPotCustom,
    headerSun,
    headerLocationPreset,
    headerLocationCustom,
    resolveHeaderLocationValue,
    saveHeaderProfileFields,
  ]);

  const onHeaderPotSelectChange = useCallback(
    (value: string | null) => {
      const v = value ?? headerPotOptionId;
      setHeaderPotOptionId(v);
      if (v !== 'other') {
        setHeaderPotCustom('');
      }
      const pot = resolvePotWhenChangingPreset(v, headerPotCustom);
      void saveHeaderProfileFields({
        ...pot,
        sun_exposure: headerSun,
        location_in_garden: resolveHeaderLocationValue(headerLocationPreset, headerLocationCustom),
      });
    },
    [
      headerPotOptionId,
      headerPotCustom,
      headerSun,
      headerLocationPreset,
      headerLocationCustom,
      resolveHeaderLocationValue,
      saveHeaderProfileFields,
    ],
  );

  const onHeaderSunChange = useCallback(
    (value: string | null) => {
      const sun = normalizeSunExposure(value ?? headerSun);
      setHeaderSun(sun);
      const pot = resolvePotFromHeaderSelection(headerPotOptionId, headerPotCustom);
      void saveHeaderProfileFields({
        ...pot,
        sun_exposure: sun,
        location_in_garden: resolveHeaderLocationValue(headerLocationPreset, headerLocationCustom),
      });
    },
    [
      headerPotOptionId,
      headerPotCustom,
      headerSun,
      headerLocationPreset,
      headerLocationCustom,
      resolveHeaderLocationValue,
      saveHeaderProfileFields,
    ],
  );

  const onHeaderLocationPresetChange = useCallback(
    (value: string | null) => {
      const v = value ?? HEADER_LOCATION_NONE;
      setHeaderLocationPreset(v);
      if (v !== HEADER_LOCATION_OTHER) {
        setHeaderLocationCustom('');
      }
      const pot = resolvePotFromHeaderSelection(headerPotOptionId, headerPotCustom);
      const loc =
        v === HEADER_LOCATION_NONE
          ? null
          : v === HEADER_LOCATION_OTHER
            ? headerLocationCustom.trim() || null
            : v;
      void saveHeaderProfileFields({
        ...pot,
        sun_exposure: headerSun,
        location_in_garden: loc,
      });
    },
    [
      headerPotOptionId,
      headerPotCustom,
      headerSun,
      headerLocationCustom,
      saveHeaderProfileFields,
    ],
  );

  const onHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'BUTTON' || t.getAttribute('role') === 'combobox') return;
    e.preventDefault();
    commitHeaderFromState();
  };

  const exitHeaderEditMode = useCallback(() => {
    commitHeaderFromState();
    setHeaderEditMode(false);
  }, [commitHeaderFromState]);

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

  const fetchPlantNoteEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('plant_note_entries')
      .select('*')
      .eq('plant_id', plantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.warn('plant_note_entries:', error.message);
      setPlantNoteEntries([]);
      return;
    }
    setPlantNoteEntries((data || []) as PlantNoteEntry[]);
  }, [plantId]);

  const logActivityDb = async (action: string, plantName: string) => {
    await supabase.from('activity_logs').insert([{ action, plant_name: plantName }]);
  };

  const markWateredFromProfile = async () => {
    if (!plant || isWriteDisabled) return;
    if (isPlantCareDateToday(plant.last_watered)) {
      toast.info(`${plant.name} is already marked as watered today.`);
      return;
    }
    setCareBusy('water');
    try {
      const when = wateringLoggedAtIso();
      const { error } = await supabase.from('plants').update({ last_watered: when }).eq('id', plantId);
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
    if (isPlantCareDateToday(plant.last_fertilized)) {
      toast.info(`${plant.name} is already marked as fertilized today.`);
      return;
    }
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

  const addPlantNoteEntry = async () => {
    if (!plant || isWriteDisabled) return;
    const body = newNoteText.trim();
    if (!body) {
      toast.error('Write something before adding a note');
      return;
    }
    setNoteAddBusy(true);
    try {
      const { error } = await supabase.from('plant_note_entries').insert({ plant_id: plantId, body });
      if (error) throw error;
      setNewNoteText('');
      toast.success('Note added');
      await fetchPlantNoteEntries();
    } catch (e) {
      console.error(e);
      toast.error('Could not add note — run the plant_note_entries migration if you see a schema error.');
    } finally {
      setNoteAddBusy(false);
    }
  };

  const deletePlantNoteEntry = async (entryId: string) => {
    if (isWriteDisabled) return;
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setDeletingNoteId(entryId);
    try {
      const { error } = await supabase
        .from('plant_note_entries')
        .delete()
        .eq('id', entryId)
        .eq('plant_id', plantId);
      if (error) throw error;
      toast.success('Note deleted');
      await fetchPlantNoteEntries();
    } catch (e) {
      console.error(e);
      toast.error('Could not delete note');
    } finally {
      setDeletingNoteId(null);
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
      if (cancelled) return;
      await fetchPlantNoteEntries();
      if (cancelled || !p?.name) return;
      await fetchActivities(p.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [plantId, fetchPlant, fetchPhotos, fetchFertilizerLogs, fetchPlantNoteEntries, fetchActivities]);

  useEffect(() => {
    if (!plant) return;
    setWateringDraft({
      frequencyDays: String(plant.watering_frequency_days),
      lastWatered: isoOrDateToDateInputValue(plant.last_watered),
    });
    setFertDraft({
      seasons: normalizeFertilizerSeasons(plant.fertilizer_seasons),
      notes: plant.fertilizer_notes ?? '',
    });
  }, [plant?.id]);

  const saveWateringSettings = async () => {
    if (!plant || isWriteDisabled) return;
    const parsedDays = parseInt(wateringDraft.frequencyDays, 10);
    if (!Number.isFinite(parsedDays) || parsedDays < 1) {
      toast.error('Watering frequency must be at least 1 day');
      return;
    }
    setWateringSettingsBusy(true);
    try {
      const { error } = await supabase
        .from('plants')
        .update({
          watering_frequency_days: parsedDays,
          last_watered: wateringDraft.lastWatered.trim() || null,
        })
        .eq('id', plantId);
      if (error) throw error;
      toast.success('Watering schedule saved');
      await fetchPlant();
    } catch (e) {
      console.error(e);
      toast.error('Could not save watering settings');
    } finally {
      setWateringSettingsBusy(false);
    }
  };

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

  const savePhotoTimelineDate = async () => {
    if (!photoDateDialog || isWriteDisabled) return;
    const iso = datetimeLocalToIsoUtc(photoDateDialog.datetimeLocal);
    if (!iso) {
      toast.error('Invalid date');
      return;
    }
    setPhotoDateSaving(true);
    try {
      const { error } = await supabase
        .from('plant_photos')
        .update({ created_at: iso })
        .eq('id', photoDateDialog.id)
        .eq('plant_id', plantId);
      if (error) throw error;
      toast.success('Photo date updated');
      setPhotoDateDialog(null);
      await fetchPhotos();
    } catch (e) {
      console.error(e);
      toast.error('Could not update photo date');
    } finally {
      setPhotoDateSaving(false);
    }
  };

  const addTimelinePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!plant || isWriteDisabled) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploadBusy(true);
    try {
      const photoUrl = await uploadPlantImage(file);
      if (!photoUrl) {
        toast.error('Photo upload failed');
        return;
      }
      const createdIso = datetimeLocalToIsoUtc(defaultPhotoTimelineFromFile(file));
      const { error } = await supabase.from('plant_photos').insert({
        plant_id: plantId,
        photo_url: photoUrl,
        ...(createdIso ? { created_at: createdIso } : {}),
      });
      if (error) {
        await deletePlantImageFromStorage(photoUrl);
        throw error;
      }
      await logActivityDb('Photo Added', plant.name);
      toast.success('Photo added to history');
      await fetchPhotos();
      await fetchActivities(plant.name);
    } catch (err) {
      console.error(err);
      toast.error('Could not add photo');
    } finally {
      e.target.value = '';
      setPhotoUploadBusy(false);
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

  const troubleshootingPrompt = useMemo(() => {
    if (!plant) return '';
    return buildPlantTroubleshootingPrompt(plant, { journalEntries: plantNoteEntries });
  }, [plant, plantNoteEntries]);

  const copyTroubleshootingPrompt = async () => {
    if (!troubleshootingPrompt) return;
    try {
      await navigator.clipboard.writeText(troubleshootingPrompt);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy — select the text in the dialog instead');
    }
  };

  const openSlideshow = (index: number) => {
    if (photoSelectMode || photos.length === 0) return;
    setSlideshowIndex(index);
  };

  const showOlderPhoto = () => {
    if (photos.length === 0 || slideshowIndex === null) return;
    setSlideshowIndex((slideshowIndex + 1) % photos.length);
  };

  const showNewerPhoto = () => {
    if (photos.length === 0 || slideshowIndex === null) return;
    setSlideshowIndex((slideshowIndex - 1 + photos.length) % photos.length);
  };

  const onSlideshowTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    slideshowTouchStartXRef.current = touch.clientX;
    slideshowTouchStartYRef.current = touch.clientY;
  };

  const onSlideshowTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startX = slideshowTouchStartXRef.current;
    const startY = slideshowTouchStartYRef.current;
    slideshowTouchStartXRef.current = null;
    slideshowTouchStartYRef.current = null;
    if (startX === null || startY === null || photos.length < 2) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    // Require mostly-horizontal intent and minimum travel distance to avoid accidental flips.
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) showOlderPhoto();
    else showNewerPhoto();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-desert-page">
        Loading plant profile...
      </div>
    );
  }

  if (!plant) {
    return <div className="min-h-screen flex items-center justify-center">Plant not found</div>;
  }

  const fertU = fertilizerUrgency(plant);
  const plantSeasons = normalizeFertilizerSeasons(plant.fertilizer_seasons);
  const wateredToday = isPlantCareDateToday(plant.last_watered);
  const fertilizedToday = isPlantCareDateToday(plant.last_fertilized);
  const fertDraftMatchesPlant =
    JSON.stringify(normalizeFertilizerSeasons(fertDraft.seasons)) === JSON.stringify(plantSeasons) &&
    (fertDraft.notes.trim() || '') === (plant.fertilizer_notes ?? '').trim();
  const wateringDraftMatchesPlant =
    wateringDraft.frequencyDays.trim() === String(plant.watering_frequency_days) &&
    wateringDraft.lastWatered === isoOrDateToDateInputValue(plant.last_watered);
  const slideshowPhoto = slideshowIndex !== null ? photos[slideshowIndex] : null;

  return (
    <div className="min-h-screen bg-desert-page text-desert-ink">
      <Toaster position="top-center" richColors />

      <header className="sticky top-0 z-50 bg-desert-parchment/95 backdrop-blur border-b border-desert-border">
        <div className="max-w-4xl mx-auto px-6 py-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold text-oasis">{plant.name}</h1>
              {!headerEditMode || isWriteDisabled ? (
                <div
                  className="mt-1 flex flex-wrap items-center gap-2"
                  onKeyDown={onHeaderKeyDown}
                  role={isWriteDisabled ? undefined : 'group'}
                  aria-label="Plant placement summary"
                >
                  <button
                    type="button"
                    disabled={isWriteDisabled}
                    onClick={enterHeaderEditMode}
                    className={cn(
                      'inline-flex max-w-full items-center rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-colors',
                      'bg-primary text-primary-foreground',
                      !isWriteDisabled &&
                        'cursor-pointer hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      isWriteDisabled && 'cursor-default opacity-90',
                    )}
                  >
                    <span className="truncate">
                      {plant.container_type} • {plant.pot_size}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isWriteDisabled}
                    onClick={enterHeaderEditMode}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-normal transition-colors',
                      'bg-secondary text-secondary-foreground',
                      !isWriteDisabled &&
                        'cursor-pointer hover:bg-secondary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      isWriteDisabled && 'cursor-default opacity-90',
                    )}
                  >
                    <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{sunExposureLabel(plant.sun_exposure)}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isWriteDisabled}
                    onClick={enterHeaderEditMode}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-normal transition-colors',
                      plant.location_in_garden?.trim()
                        ? 'bg-secondary text-secondary-foreground'
                        : 'border-border text-muted-foreground bg-muted/40',
                      !isWriteDisabled &&
                        'cursor-pointer hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      isWriteDisabled && 'cursor-default opacity-90',
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {plant.location_in_garden?.trim() ? plant.location_in_garden.trim() : 'Location'}
                    </span>
                  </button>
                </div>
              ) : (
                <div
                  className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
                  onKeyDown={onHeaderKeyDown}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[min(100%,280px)]">
                    <Label htmlFor="profile-header-pot" className="text-xs text-desert-dust">
                      Pot / container
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={headerPotOptionId} onValueChange={onHeaderPotSelectChange}>
                        <SelectTrigger
                          id="profile-header-pot"
                          size="sm"
                          className="min-h-8 w-full min-w-[160px] border-desert-border bg-desert-parchment data-[size=sm]:h-8 sm:w-auto"
                          aria-busy={headerSaveBusy}
                        >
                          <SelectValue placeholder="Choose container" />
                        </SelectTrigger>
                        <SelectContent>
                          {HEADER_POT_OPTIONS.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label="Custom pot or size detail"
                        placeholder="Custom detail"
                        value={headerPotCustom}
                        onChange={(e) => setHeaderPotCustom(e.target.value)}
                        onBlur={() => {
                          const pot = resolvePotFromHeaderSelection(headerPotOptionId, headerPotCustom);
                          void saveHeaderProfileFields({
                            ...pot,
                            sun_exposure: headerSun,
                            location_in_garden: resolveHeaderLocationValue(
                              headerLocationPreset,
                              headerLocationCustom,
                            ),
                          });
                        }}
                        className="h-8 min-w-[120px] flex-1 border-desert-border bg-desert-parchment text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[min(100%,220px)]">
                    <Label htmlFor="profile-header-sun" className="text-xs text-desert-dust">
                      Sun
                    </Label>
                    <Select value={headerSun} onValueChange={onHeaderSunChange}>
                      <SelectTrigger
                        id="profile-header-sun"
                        size="sm"
                        className="min-h-8 w-full border-desert-border bg-desert-parchment data-[size=sm]:h-8"
                        aria-busy={headerSaveBusy}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUN_EXPOSURE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value} title={o.hint}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[min(100%,280px)]">
                    <Label htmlFor="profile-header-location" className="text-xs text-desert-dust">
                      Location
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={headerLocationPreset} onValueChange={onHeaderLocationPresetChange}>
                        <SelectTrigger
                          id="profile-header-location"
                          size="sm"
                          className="min-h-8 w-full min-w-[140px] flex-1 border-desert-border bg-desert-parchment data-[size=sm]:h-8 sm:w-auto"
                          aria-busy={headerSaveBusy}
                        >
                          <SelectValue placeholder="Where it sits" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={HEADER_LOCATION_NONE}>— None —</SelectItem>
                          {HEADER_LOCATION_PRESETS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                          <SelectItem value={HEADER_LOCATION_OTHER}>Other…</SelectItem>
                        </SelectContent>
                      </Select>
                      {headerLocationPreset === HEADER_LOCATION_OTHER ? (
                        <Input
                          aria-label="Custom location"
                          placeholder="Describe spot"
                          value={headerLocationCustom}
                          onChange={(e) => setHeaderLocationCustom(e.target.value)}
                          onBlur={() => {
                            const pot = resolvePotFromHeaderSelection(headerPotOptionId, headerPotCustom);
                            void saveHeaderProfileFields({
                              ...pot,
                              sun_exposure: headerSun,
                              location_in_garden: resolveHeaderLocationValue(
                                HEADER_LOCATION_OTHER,
                                headerLocationCustom,
                              ),
                            });
                          }}
                          className="h-8 min-w-[120px] flex-1 border-desert-border bg-desert-parchment text-sm"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-row items-start gap-2 self-start">
            {!isWriteDisabled ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  'rounded-full border-desert-border',
                  headerEditMode && 'border-oasis bg-oasis/10 text-oasis',
                )}
                onClick={() => (headerEditMode ? exitHeaderEditMode() : enterHeaderEditMode())}
                aria-label={headerEditMode ? 'Done editing placement' : 'Edit pot, sun, and location'}
                aria-pressed={headerEditMode}
              >
                {headerSaveBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Pencil className="h-4 w-4" aria-hidden />
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full border-desert-border"
              onClick={() => setAiPromptOpen(true)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI prompt
            </Button>
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
            <div
              className="relative h-[min(420px,55vh)] min-h-[220px] w-full rounded-3xl overflow-hidden border border-desert-border shadow-sm"
            >
              <Image
                src={plant.photo_url}
                alt={plant.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 800px"
                priority
                quality={80}
              />
            </div>
            <p className="mt-2 text-sm text-desert-dust">
              Choose a different image from photo history below, or add progress photos here.
            </p>
          </div>
        )}

        {/* Photo History */}
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">📸 Photo history</h2>
              <p className="text-sm text-desert-dust mt-1">
                {photos.length} photo{photos.length === 1 ? '' : 's'} in timeline. Tap{' '}
                <span className="font-medium text-desert-ink">Select photos</span> to choose
                several, then delete. Use <span className="font-medium text-desert-ink">Use as profile</span>{' '}
                on any shot to make it the home / card picture. Add new photos with{' '}
                <span className="font-medium text-desert-ink">Upload photo</span> or{' '}
                <span className="font-medium text-desert-ink">Take photo</span> to track progress.
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
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => timelineUploadInputRef.current?.click()}
                    disabled={isWriteDisabled || photoUploadBusy}
                  >
                    {photoUploadBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-1.5" />}
                    Upload photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => timelineCameraInputRef.current?.click()}
                    disabled={isWriteDisabled || photoUploadBusy}
                  >
                    {photoUploadBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
                    Take photo
                  </Button>
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
                </>
              )}
            </div>
          </div>
          <input
            ref={timelineUploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void addTimelinePhoto(e)}
          />
          <input
            ref={timelineCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void addTimelinePhoto(e)}
          />

          {photos.length === 0 ? (
            <Card className="bg-desert-parchment border-desert-border">
              <CardContent className="py-12 text-center">
                <p className="text-desert-dust">
                  No timeline photos yet. Upload or take one above to start tracking growth.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {photos.map((photo, index) => {
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
                        ? 'border-oasis ring-2 ring-oasis/40'
                        : 'border-desert-border',
                    )}
                  >
                    <div className="relative group shrink-0 aspect-square">
                      {photoSelectMode && (
                        <button
                          type="button"
                          onClick={() => togglePhotoSelected(photo.id)}
                          className="absolute left-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md ring-1 ring-desert-border"
                          aria-label={isSelected ? 'Deselect photo' : 'Select photo'}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-oasis" />
                          ) : (
                            <Square className="h-5 w-5 text-desert-dust" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        className="w-full relative aspect-square"
                        onClick={() => openSlideshow(index)}
                        disabled={photoSelectMode}
                        aria-label={`Open photo from ${format(new Date(photo.created_at), 'MMMM d, yyyy h:mm a')}`}
                      >
                        <Image
                          src={photo.photo_url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 33vw"
                          quality={70}
                        />
                      </button>

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
                      <div className="flex flex-col gap-1.5 border-t border-desert-border/60 bg-desert-parchment/90 p-2">
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
                          variant="outline"
                          className="h-9 w-full justify-center gap-1.5 rounded-lg text-xs sm:text-sm"
                          disabled={isWriteDisabled}
                          onClick={() =>
                            setPhotoDateDialog({
                              id: photo.id,
                              datetimeLocal: toDatetimeLocalValue(new Date(photo.created_at)),
                            })
                          }
                        >
                          <CalendarClock className="h-4 w-4" />
                          Set photo date
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

        {/* Care summary + last watered / fertilized */}
        <Card className="bg-desert-parchment border-desert-border dark:bg-zinc-900 dark:border-zinc-700">
          <CardHeader>
            <CardTitle className="text-lg">Care &amp; schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 rounded-2xl border border-desert-mist/80 bg-white/50 p-4 dark:border-zinc-600 dark:bg-zinc-800/85">
                <Droplet className="h-8 w-8 shrink-0 text-sky-600 dark:text-sky-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-desert-dust dark:text-zinc-300">
                    Last watered
                  </p>
                  <p className="text-lg font-semibold text-desert-ink dark:text-zinc-100">
                    {formatPlantCareInstant(plant.last_watered, 'profile')}
                  </p>
                  <p className="text-sm text-desert-sage dark:text-zinc-300">
                    Every {plant.watering_frequency_days} day{plant.watering_frequency_days === 1 ? '' : 's'} ·{' '}
                    {formatDueLine(plant.last_watered, plant.watering_frequency_days) || '—'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-2xl border border-desert-mist/80 bg-white/50 p-4 dark:border-zinc-600 dark:bg-zinc-800/85">
                <Sprout className="h-8 w-8 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-desert-dust dark:text-zinc-300">
                    Last fertilized
                  </p>
                  <p className="text-lg font-semibold text-desert-ink dark:text-zinc-100">
                    {formatCareDay(plant.last_fertilized)}
                  </p>
                  <p className="text-sm text-desert-sage dark:text-zinc-300">
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
                  <p className="text-xs text-desert-dust dark:text-zinc-300">
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
                className="rounded-full bg-oasis hover:bg-oasis-hover"
                disabled={isWriteDisabled || careBusy !== null || wateredToday}
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
                disabled={isWriteDisabled || careBusy !== null || fertilizedToday}
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
            <div className="space-y-3 rounded-2xl border border-desert-mist/70 bg-white/60 p-4 dark:border-zinc-600 dark:bg-zinc-800/80">
              <p className="text-sm font-medium text-desert-ink dark:text-zinc-100">Adjust watering schedule</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="profile-water-frequency">Water every (days)</Label>
                  <Input
                    id="profile-water-frequency"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={wateringDraft.frequencyDays}
                    onChange={(e) =>
                      setWateringDraft((draft) => ({
                        ...draft,
                        frequencyDays: e.target.value,
                      }))
                    }
                    disabled={isWriteDisabled}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="profile-last-watered">Last watered date</Label>
                  <Input
                    id="profile-last-watered"
                    type="date"
                    value={wateringDraft.lastWatered}
                    onChange={(e) =>
                      setWateringDraft((draft) => ({
                        ...draft,
                        lastWatered: e.target.value,
                      }))
                    }
                    disabled={isWriteDisabled}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                type="button"
                className="rounded-full bg-oasis hover:bg-oasis-hover"
                disabled={isWriteDisabled || wateringSettingsBusy || wateringDraftMatchesPlant}
                onClick={() => void saveWateringSettings()}
              >
                {wateringSettingsBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save watering settings
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-desert-parchment border-desert-border dark:bg-zinc-900 dark:border-zinc-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <NotebookPen className="h-5 w-5 text-oasis dark:text-emerald-400" />
              Plant notes
            </CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-300">
              Each time you add a note it is saved with a timestamp. Delete entries you no longer need. Everyone
              using the same garden sees the same journal.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-new-note">New note</Label>
              <Textarea
                id="profile-new-note"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="e.g. Noticed spider mites on the underside of the oldest leaves — sprayed neem."
                disabled={isWriteDisabled}
                className="min-h-[100px] resize-y text-base leading-relaxed"
              />
              <Button
                type="button"
                className="rounded-full bg-oasis hover:bg-oasis-hover"
                disabled={isWriteDisabled || noteAddBusy || !newNoteText.trim()}
                onClick={() => void addPlantNoteEntry()}
              >
                {noteAddBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add note
              </Button>
            </div>

            {plant.notes?.trim() ? (
              <div className="rounded-2xl border border-dashed border-desert-border bg-white/40 p-4 dark:border-zinc-600 dark:bg-zinc-800/80">
                <p className="text-xs font-semibold uppercase tracking-wide text-desert-dust dark:text-zinc-300">
                  Earlier note (from before journal entries)
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-desert-sage dark:text-zinc-100">
                  {plant.notes.trim()}
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium text-desert-ink dark:text-zinc-100">History</p>
              {plantNoteEntries.length === 0 ? (
                <p className="rounded-xl border border-desert-mist/60 bg-white/50 py-10 text-center text-sm text-desert-dust dark:border-zinc-600 dark:bg-zinc-800/85 dark:text-zinc-200">
                  No journal entries yet. Add your first note above.
                </p>
              ) : (
                <ul className="max-h-[min(420px,50vh)] space-y-3 overflow-y-auto pr-1">
                  {plantNoteEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-2xl border border-desert-mist/70 bg-white/70 p-4 dark:border-zinc-600 dark:bg-zinc-800/85"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <time
                          dateTime={entry.created_at}
                          className="shrink-0 text-xs font-medium text-desert-dust dark:text-zinc-300"
                        >
                          {formatLogWhen(entry.created_at)}
                        </time>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50"
                          disabled={isWriteDisabled || deletingNoteId === entry.id}
                          aria-label="Delete note"
                          onClick={() => void deletePlantNoteEntry(entry.id)}
                        >
                          {deletingNoteId === entry.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-desert-ink dark:text-zinc-100">
                        {entry.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isWriteDisabled ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">Demo mode — journal is read-only.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-desert-parchment border-desert-border dark:bg-zinc-900 dark:border-zinc-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sprout className="h-5 w-5 text-amber-600" />
              Fertilizer schedule
            </CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-300">
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

        <Card className="bg-desert-parchment border-desert-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sprout className="h-5 w-5 text-amber-600" />
              Fertilizer history
            </CardTitle>
            <p className="text-sm text-desert-dust">
              Recorded when you tap “Fertilized today” here or on the dashboard (after the fertilizer log table
              exists in your database).
            </p>
          </CardHeader>
          <CardContent>
            {fertilizerLogs.length === 0 ? (
              <p className="py-8 text-center text-desert-dust dark:text-zinc-300">
                No fertilizer applications logged yet.
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {fertilizerLogs.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-desert-mist/60 bg-white/60 px-4 py-3 text-sm dark:border-zinc-600 dark:bg-zinc-800/85"
                  >
                    <span className="font-medium text-desert-ink dark:text-zinc-100">
                      {formatCareDay(row.applied_on)}
                    </span>
                    {row.notes ? (
                      <span className="text-xs text-desert-sage dark:text-zinc-300">{row.notes}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Water / fertilizer log (from activity_logs) */}
        <Card className="bg-desert-parchment border-desert-border dark:bg-zinc-900 dark:border-zinc-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Droplet className="h-5 w-5 text-sky-600" />
              Water &amp; fertilizer log
            </CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-300">
              Each line is a time you (or someone) logged watering or fertilizing from this profile or the home
              dashboard. The cards above show the dates saved on the plant.
            </p>
          </CardHeader>
          <CardContent>
            {careLogs.length === 0 ? (
              <p className="py-8 text-center text-desert-dust dark:text-zinc-300">
                No watering or fertilizing events logged for this plant yet.
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {careLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-desert-mist/60 bg-white/60 px-4 py-3 text-sm dark:border-zinc-600 dark:bg-zinc-800/85"
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
                    <span className="mt-0.5 block text-xs font-normal text-desert-dust dark:text-zinc-300">
                      {log.action}
                    </span>
                    <span className="shrink-0 text-xs text-desert-dust dark:text-zinc-300">
                      {formatLogWhen(log.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Full activity History */}
        <Card className="bg-desert-parchment border-desert-border dark:bg-zinc-900 dark:border-zinc-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">🌱 All activity</CardTitle>
            <p className="text-sm text-desert-dust dark:text-zinc-300">
              Edits, photos, and other actions for this plant.
            </p>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-center py-12 text-desert-dust dark:text-zinc-300">
                No activity logged for this plant yet.
              </p>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
                {activities.map((log) => (
                  <div
                    key={log.id}
                    className="flex justify-between items-start gap-3 p-4 bg-white/60 rounded-2xl border border-desert-mist dark:border-zinc-600 dark:bg-zinc-800/85"
                  >
                    <div className="font-medium">{log.action}</div>
                    <div className="text-right text-xs text-desert-dust whitespace-nowrap dark:text-zinc-300">
                      {formatLogWhen(log.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={!!photoDateDialog}
        onOpenChange={(open) => {
          if (!open) setPhotoDateDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set photo date</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-desert-dust">
            Timeline order on this profile uses this time — useful for older shots from your camera roll.
          </p>
          <div className="space-y-2 pt-2">
            <Label htmlFor="photo-date-dialog-input">Date and time</Label>
            <Input
              id="photo-date-dialog-input"
              type="datetime-local"
              value={photoDateDialog?.datetimeLocal ?? ''}
              onChange={(e) =>
                setPhotoDateDialog((prev) =>
                  prev ? { ...prev, datetimeLocal: e.target.value } : null,
                )
              }
              disabled={isWriteDisabled}
            />
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setPhotoDateDialog(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-oasis hover:bg-oasis-hover"
                onClick={() => void savePhotoTimelineDate()}
                disabled={isWriteDisabled || photoDateSaving}
              >
                {photoDateSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={slideshowIndex !== null && !!slideshowPhoto}
        onOpenChange={(open) => {
          if (!open) setSlideshowIndex(null);
        }}
      >
        <DialogContent className="w-[min(96vw,980px)] max-w-[96vw] p-0 overflow-hidden">
          {slideshowPhoto ? (
            <div className="flex flex-col bg-black text-white">
              <div className="flex items-center justify-between gap-3 border-b border-white/20 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {format(new Date(slideshowPhoto.created_at), 'MMMM d, yyyy • h:mm a')}
                  </p>
                  <p className="text-xs text-zinc-300">
                    Photo {slideshowIndex! + 1} of {photos.length}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/30 bg-transparent text-white hover:bg-white/10"
                    onClick={() => showNewerPhoto()}
                    disabled={photos.length < 2}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Newer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/30 bg-transparent text-white hover:bg-white/10"
                    onClick={() => showOlderPhoto()}
                    disabled={photos.length < 2}
                  >
                    Older
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/30 bg-transparent text-white hover:bg-white/10"
                    onClick={() => setSlideshowIndex(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
              <div
                className="flex items-center justify-center bg-black p-2 sm:p-4"
                onTouchStart={onSlideshowTouchStart}
                onTouchEnd={onSlideshowTouchEnd}
              >
                <img
                  src={slideshowPhoto.photo_url}
                  alt={`${plant.name} timeline photo`}
                  className="max-h-[80vh] w-auto max-w-full object-contain"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={aiPromptOpen} onOpenChange={setAiPromptOpen}>
        <DialogContent className="max-h-[min(90vh,640px)] max-w-2xl overflow-hidden flex flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-desert-border px-6 py-4">
            <DialogTitle>Prompt for AI troubleshooting</DialogTitle>
            <p className="text-sm font-normal text-desert-dust">
              Copy into ChatGPT, Claude, or another assistant, then describe symptoms or attach a photo.
            </p>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
            <Textarea
              readOnly
              value={troubleshootingPrompt}
              className="min-h-[min(320px,45vh)] resize-none font-mono text-xs leading-relaxed"
              aria-label="Troubleshooting prompt text"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAiPromptOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                className="bg-oasis hover:bg-oasis-hover"
                onClick={() => void copyTroubleshootingPrompt()}
              >
                Copy to clipboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
