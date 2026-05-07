'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { FertilizerSeason, Plant, SunExposure } from '@/lib/plant-types';
import { SUN_EXPOSURE_OPTIONS } from '@/lib/plant-types';
import {
  isoOrDateToDateInputValue,
  normalizeSunExposure,
} from '@/lib/plant-helpers';
import {
  ALL_FERTILIZER_SEASONS,
  computeNextFertilizationDue,
  fertilizerUrgency,
  needsFertilizerThisMonth,
  normalizeFertilizerSeasons,
  seasonLabel,
} from '@/lib/fertilizer-schedule';
import { FertilizerSeasonCheckboxes } from '@/components/FertilizerSeasonCheckboxes';
import { WateringCalendar } from '@/components/WateringCalendar';
import { uploadPlantImage } from '@/lib/storage-upload';
import {
  defaultPhotoTimelineFromFile,
  toDatetimeLocalValue,
} from '@/lib/photo-timeline';
import { GARDEN_AUTH_KEY, GARDEN_MODE_KEY } from '@/lib/garden-session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, AlertTriangle, Image as ImageIcon, Loader2, X, Sprout, ChevronDown, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { toast, Toaster } from 'sonner';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';
import type { NewPlantForm } from '@/lib/garden-types';
import {
  DESERT_PLANT_CATEGORIES,
  type DesertPlantPreset,
  desertPlantPresets,
} from '@/lib/desert-plant-presets';
import { usePlants } from '@/hooks/use-plants';
import { useActivities } from '@/hooks/use-activities';
import { useWeather } from '@/hooks/use-weather';
import {
  addPlantAction,
  clearActivityLogAction,
  deletePlantAction,
  markAllWateredTodayAction,
  markFertilizedAction,
  markSelectedTodayPlantsWateredAction,
  markWateredAction,
  updatePlantAction,
} from '@/app/actions/garden';
import { GardenHeader, GardenWeather } from '@/components/GardenHeader';
import { PlantGrid } from '@/components/PlantGrid';
import { ActivityLog } from '@/components/ActivityLog';

const DEMO_PASSWORD = 'demo';
const REAL_PASSWORD = process.env.NEXT_PUBLIC_SHARED_PASSWORD || 'changeme';

function toCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function dateInputToday(): string {
  return new Date().toISOString().split('T')[0];
}

function createDefaultNewPlant(): NewPlantForm {
  const today = dateInputToday();
  return {
    name: '',
    species: '',
    container_type: 'Grow Bag',
    pot_size: '10 gallon',
    sun_exposure: 'full_sun',
    watering_frequency_days: 3,
    last_watered: today,
    fertilizer_frequency_days: 30,
    last_fertilized: today,
    fertilizer_seasons: [...ALL_FERTILIZER_SEASONS],
    fertilizer_notes: '',
    location_in_garden: '',
    photo_url: null,
  };
}

const DESERT_PRESET_FILTERS = ['All', ...DESERT_PLANT_CATEGORIES] as const;
type DesertPresetFilter = (typeof DESERT_PRESET_FILTERS)[number];

export function GardenPageClient() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [plantSearch, setPlantSearch] = useState('');
  const [fertDueThisMonthOnly, setFertDueThisMonthOnly] = useState(false);
  const [isFertilizerOpen, setIsFertilizerOpen] = useState(false);
  const [isGardenHeaderCollapsed, setIsGardenHeaderCollapsed] = useState(false);
  const [bulkWateringTodayBusy, setBulkWateringTodayBusy] = useState(false);
  const [desertPresetSearch, setDesertPresetSearch] = useState('');
  const [desertPresetFilter, setDesertPresetFilter] = useState<DesertPresetFilter>('All');
  const editPhotoBaselineRef = useRef<string | null>(null);
  const lastScrollYRef = useRef(0);

  const { plants, setPlants, fetchPlants } = usePlants();
  const { activities, setActivities, fetchActivities } = useActivities();
  const { weather, loadWeather } = useWeather();

  const [newPlant, setNewPlant] = useState<NewPlantForm>(createDefaultNewPlant);
  const [editWaterDays, setEditWaterDays] = useState('');
  const [editFertDays, setEditFertDays] = useState('');
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [newPhotoTimelineAt, setNewPhotoTimelineAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [editPhotoTimelineAt, setEditPhotoTimelineAt] = useState(() => toDatetimeLocalValue(new Date()));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const loadDemoPlants = useCallback(() => {
    const demoPlants: Plant[] = [
      {
        id: 'demo1',
        name: 'Demo Desert Rose',
        container_type: 'Pot',
        pot_size: '10gal',
        watering_frequency_days: 7,
        last_watered: '2026-04-01',
        fertilizer_frequency_days: 30,
        last_fertilized: '2026-03-15',
        fertilizer_seasons: ['spring', 'summer'],
        fertilizer_notes: 'Bloom booster in spring',
        sun_exposure: 'full_sun',
        photo_url: null,
      },
      {
        id: 'demo2',
        name: 'Demo Saguaro',
        container_type: 'Grow Bag',
        pot_size: '10 gallon',
        watering_frequency_days: 14,
        last_watered: '2026-03-25',
        fertilizer_frequency_days: 60,
        last_fertilized: '2026-02-01',
        fertilizer_seasons: ['summer'],
        fertilizer_notes: 'Light feed; dormant in winter',
        sun_exposure: 'partial_sun',
        photo_url: null,
      },
      {
        id: 'demo3',
        name: 'Demo Prickly Pear',
        container_type: 'Raised Bed',
        pot_size: 'Large',
        watering_frequency_days: 10,
        last_watered: '2026-04-03',
        fertilizer_frequency_days: 45,
        last_fertilized: '2026-03-20',
        fertilizer_seasons: [...ALL_FERTILIZER_SEASONS],
        fertilizer_notes: null,
        sun_exposure: 'partial_shade',
        photo_url: null,
      },
    ];
    setPlants(demoPlants);
    setActivities([]);
  }, [setActivities, setPlants]);

  const loadGardenData = useCallback(async () => {
    const [plantsResult, activityResult, weatherResult] = await Promise.all([
      fetchPlants(),
      fetchActivities(),
      loadWeather(),
    ]);
    if (!plantsResult.ok) {
      toast.error(plantsResult.error || 'Could not load plants');
    }
    if (!activityResult.ok) {
      toast.error(activityResult.error || 'Could not load activity log');
    }
    if (!weatherResult.ok) {
      toast.error(weatherResult.error || 'Weather fetch failed');
    }
  }, [fetchActivities, fetchPlants, loadWeather]);

  useEffect(() => {
    const savedDark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDark);
    if (savedDark) document.documentElement.classList.add('dark');

    if (localStorage.getItem(GARDEN_AUTH_KEY) === 'true') {
      setIsAuthenticated(true);
      if (localStorage.getItem(GARDEN_MODE_KEY) === 'demo') {
        setIsDemoMode(true);
        loadDemoPlants();
      } else {
        setIsDemoMode(false);
      }
    }
    setLoading(false);
  }, [loadDemoPlants]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
    newMode ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPassword === DEMO_PASSWORD) {
      setIsAuthenticated(true);
      setIsDemoMode(true);
      localStorage.setItem(GARDEN_AUTH_KEY, 'true');
      localStorage.setItem(GARDEN_MODE_KEY, 'demo');
      toast.success('Demo Mode Activated');
      loadDemoPlants();
    } else if (enteredPassword === REAL_PASSWORD) {
      setIsAuthenticated(true);
      setIsDemoMode(false);
      localStorage.setItem(GARDEN_AUTH_KEY, 'true');
      localStorage.setItem(GARDEN_MODE_KEY, 'real');
      toast.success('Welcome to your real garden 🌵');
      void loadGardenData();
    } else {
      toast.error('Incorrect password');
      setEnteredPassword('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsDemoMode(false);
    localStorage.removeItem(GARDEN_AUTH_KEY);
    localStorage.removeItem(GARDEN_MODE_KEY);
    toast.info('Logged out');
  };

  useEffect(() => {
    if (isAuthenticated && !isDemoMode) {
      void loadGardenData();
    }
  }, [isAuthenticated, isDemoMode, loadGardenData]);

  useEffect(() => {
    if (!isAuthenticated || loading) {
      setIsGardenHeaderCollapsed(false);
      return;
    }

    const collapseAt = 72;
    const expandAt = 24;
    const onScroll = () => {
      const y = window.scrollY || 0;
      const previousY = lastScrollYRef.current;
      const isScrollingUp = y < previousY;
      lastScrollYRef.current = y;
      setIsGardenHeaderCollapsed((prev) => {
        if (isScrollingUp) return false;
        if (prev && y < expandAt) return false;
        if (!prev && y > collapseAt) return true;
        return prev;
      });
    };

    lastScrollYRef.current = window.scrollY || 0;
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isAuthenticated, loading]);

  const refreshGarden = useCallback(async () => {
    if (isDemoMode) {
      loadDemoPlants();
      return;
    }
    await loadGardenData();
  }, [isDemoMode, loadDemoPlants, loadGardenData]);

  const { pullDistance, isRefreshing, threshold } = usePullToRefresh(refreshGarden, {
    disabled: !isAuthenticated || loading,
  });

  const isWriteDisabled = isDemoMode;

  const plantSearchNorm = plantSearch.trim().toLowerCase();
  const filteredPlants = useMemo(() => {
    let list = plants;
    if (plantSearchNorm) list = list.filter((p) => p.name.toLowerCase().includes(plantSearchNorm));
    if (fertDueThisMonthOnly) list = list.filter((p) => needsFertilizerThisMonth(p));
    return list;
  }, [plants, plantSearchNorm, fertDueThisMonthOnly]);
  const desertPresetSearchNorm = desertPresetSearch.trim().toLowerCase();
  const filteredDesertPresets = useMemo(() => {
    return desertPlantPresets.filter((preset) => {
      if (desertPresetFilter !== 'All' && preset.category !== desertPresetFilter) return false;
      if (!desertPresetSearchNorm) return true;
      const searchable = [
        preset.name,
        preset.species,
        preset.category,
        preset.fertilizer_notes,
        preset.location_in_garden,
        preset.phoenix_notes,
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(desertPresetSearchNorm);
    });
  }, [desertPresetFilter, desertPresetSearchNorm]);

  const totalPlantCount = plants.length;
  const showRainyDayButton = useMemo(() => {
    if (!weather?.forecast?.length) return false;
    return weather.forecast.some((day) => day.condition === 'Rain');
  }, [weather]);

  const fertilizerUpcoming = useMemo(() => {
    const now = new Date();
    return plants
      .map((plant) => ({
        plant,
        urgency: fertilizerUrgency(plant, now),
        next: computeNextFertilizationDue(plant, now),
      }))
      .filter(
        (x) =>
          x.urgency === 'overdue' || x.urgency === 'due_soon' || x.urgency === 'due_month',
      )
      .sort((a, b) => {
        const ta = a.next?.getTime() ?? 0;
        const tb = b.next?.getTime() ?? 0;
        return ta - tb;
      });
  }, [plants]);

  const allPlantNamesCsv = useMemo(
    () => plants.map((plant) => toCsvCell(plant.name.trim())).join(', '),
    [plants],
  );

  const copyAllPlantNames = async () => {
    if (plants.length === 0) {
      toast.info('No plant names to copy yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(allPlantNamesCsv);
      toast.success(
        `Copied ${plants.length} plant name${plants.length === 1 ? '' : 's'} to clipboard.`,
      );
    } catch {
      toast.error('Could not copy plant names from this browser.');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    if (isWriteDisabled) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    if (isEdit) setEditPreviewUrl(previewUrl);
    else setNewPreviewUrl(previewUrl);

    setIsUploading(true);
    const photoUrl = await uploadPlantImage(file);
    setIsUploading(false);

    if (!photoUrl) {
      toast.error('Photo upload failed');
      e.target.value = '';
      return;
    }

    const timelineDefault = defaultPhotoTimelineFromFile(file);
    if (isEdit) setEditPhotoTimelineAt(timelineDefault);
    else setNewPhotoTimelineAt(timelineDefault);

    if (isEdit && editingPlant) {
      setEditingPlant({ ...editingPlant, photo_url: photoUrl });
      toast.success('Photo uploaded successfully!');
    } else {
      setNewPlant({ ...newPlant, photo_url: photoUrl });
      toast.success('Photo uploaded successfully!');
    }
    e.target.value = '';
  };

  const removePreview = (isEdit = false) => {
    if (isEdit) {
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
      setEditPreviewUrl(null);
      setEditPhotoTimelineAt(toDatetimeLocalValue(new Date()));
      if (editingPlant) setEditingPlant({ ...editingPlant, photo_url: null });
    } else {
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
      setNewPreviewUrl(null);
      setNewPhotoTimelineAt(toDatetimeLocalValue(new Date()));
      setNewPlant({ ...newPlant, photo_url: null });
    }
  };

  const triggerFileInput = (isEdit: boolean) => {
    if (isEdit && editFileInputRef.current) editFileInputRef.current.click();
    else if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleContainerTypeChange = (value: string | null, isEdit = false) => {
    const safeValue = value || 'Grow Bag';
    if (isEdit && editingPlant) {
      const newSize = safeValue === 'Grow Bag' && !['3 gallon', '5 gallon', '10 gallon', '20 gallon'].includes(editingPlant.pot_size)
        ? '10 gallon'
        : editingPlant.pot_size;
      setEditingPlant({ ...editingPlant, container_type: safeValue, pot_size: newSize });
    } else {
      const newSize = safeValue === 'Grow Bag' && !['3 gallon', '5 gallon', '10 gallon', '20 gallon'].includes(newPlant.pot_size)
        ? '10 gallon'
        : newPlant.pot_size;
      setNewPlant({ ...newPlant, container_type: safeValue, pot_size: newSize });
    }
  };

  const applyDesertPlantPreset = (preset: DesertPlantPreset) => {
    if (newPreviewUrl) {
      URL.revokeObjectURL(newPreviewUrl);
      setNewPreviewUrl(null);
    }
    setNewPhotoTimelineAt(toDatetimeLocalValue(new Date()));
    setNewPlant({
      ...createDefaultNewPlant(),
      name: preset.name,
      species: preset.species,
      container_type: preset.container_type,
      pot_size: preset.pot_size,
      sun_exposure: preset.sun_exposure,
      watering_frequency_days: preset.watering_frequency_days,
      fertilizer_frequency_days: preset.fertilizer_frequency_days,
      fertilizer_seasons: [...preset.fertilizer_seasons],
      fertilizer_notes: preset.fertilizer_notes,
      location_in_garden: preset.location_in_garden,
      photo_url: null,
    });
    toast.success(`${preset.name} preset loaded.`);
  };

  const addPlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) return;
    e.preventDefault();
    if (!newPlant.name.trim()) {
      toast.error('Plant name is required');
      return;
    }

    const waterDays =
      newPlant.watering_frequency_days === ''
        ? 3
        : Math.max(1, Number(newPlant.watering_frequency_days));
    const fertDays =
      newPlant.fertilizer_frequency_days === ''
        ? 30
        : Math.max(1, Number(newPlant.fertilizer_frequency_days));
    const seasons =
      newPlant.fertilizer_seasons?.length > 0 ? newPlant.fertilizer_seasons : [...ALL_FERTILIZER_SEASONS];

    const result = await addPlantAction({
      plant: {
        name: newPlant.name,
        container_type: newPlant.container_type,
        pot_size: newPlant.pot_size,
        sun_exposure: newPlant.sun_exposure,
        watering_frequency_days: waterDays,
        fertilizer_frequency_days: fertDays,
        last_watered: newPlant.last_watered,
        last_fertilized: newPlant.last_fertilized,
        fertilizer_seasons: seasons,
        fertilizer_notes: newPlant.fertilizer_notes,
        location_in_garden: newPlant.location_in_garden,
        photo_url: newPlant.photo_url,
      },
      photoTimelineAt: newPhotoTimelineAt,
    });

    if (!result.ok) {
      toast.error(result.error || 'Failed to add plant');
      return;
    }

    toast.success('Plant added successfully! 🌱');
    if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
    setIsAddModalOpen(false);
    setNewPlant(createDefaultNewPlant());
    setDesertPresetSearch('');
    setDesertPresetFilter('All');
    setNewPreviewUrl(null);
    setNewPhotoTimelineAt(toDatetimeLocalValue(new Date()));
    await fetchPlants();
    await fetchActivities();
  };

  const updatePlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) return;
    e.preventDefault();
    if (!editingPlant) return;
    const baseline = editPhotoBaselineRef.current;
    const wParsed = parseInt(editWaterDays, 10);
    const fParsed = parseInt(editFertDays, 10);
    const wf = Math.max(
      1,
      Number.isFinite(wParsed) && wParsed >= 1 ? wParsed : editingPlant.watering_frequency_days,
    );
    const ff = Math.max(
      1,
      Number.isFinite(fParsed) && fParsed >= 1 ? fParsed : editingPlant.fertilizer_frequency_days,
    );
    const merged: Plant = {
      ...editingPlant,
      watering_frequency_days: wf,
      fertilizer_frequency_days: ff,
      fertilizer_seasons: normalizeFertilizerSeasons(editingPlant.fertilizer_seasons),
    };

    const result = await updatePlantAction({
      plant: merged,
      photoBaseline: baseline,
      photoTimelineAt: editPhotoTimelineAt,
    });

    if (!result.ok) {
      toast.error(result.error || 'Failed to update plant');
      return;
    }

    editPhotoBaselineRef.current = null;
    toast.success('Plant updated successfully!');
    if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    setIsEditModalOpen(false);
    setEditingPlant(null);
    setEditPreviewUrl(null);
    setEditPhotoTimelineAt(toDatetimeLocalValue(new Date()));
    await fetchPlants();
    await fetchActivities();
  };

  const markWatered = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    const result = await markWateredAction(id);
    if (!result.ok) {
      toast.error(result.error || 'Could not mark watered');
      return;
    }
    if (result.data.alreadyToday) {
      toast.info(`${name} is already marked as watered today.`);
      return;
    }
    toast.success(`✅ ${name} marked watered`);
    setPlants((prev) =>
      prev.map((plant) => (plant.id === id ? { ...plant, last_watered: result.data.when } : plant)),
    );
    await fetchActivities();
  };

  const markSelectedTodayPlantsWatered = async (plantIds: string[]): Promise<boolean> => {
    if (isWriteDisabled) return false;
    if (plantIds.length === 0) {
      toast.info('Select at least one plant due today.');
      return false;
    }

    setBulkWateringTodayBusy(true);
    const result = await markSelectedTodayPlantsWateredAction(plantIds);
    setBulkWateringTodayBusy(false);
    if (!result.ok) {
      toast.info(result.error || 'Could not mark selected plants watered');
      return false;
    }

    const updatedIdSet = new Set(result.data.updatedIds);
    setPlants((prev) =>
      prev.map((plant) => (updatedIdSet.has(plant.id) ? { ...plant, last_watered: result.data.when } : plant)),
    );
    toast.success(`✅ Marked ${result.data.updatedIds.length} plant${result.data.updatedIds.length === 1 ? '' : 's'} watered.`);
    await fetchActivities();
    return true;
  };

  const markAllWateredToday = async () => {
    if (isWriteDisabled) return;
    const result = await markAllWateredTodayAction();
    if (!result.ok) {
      toast.info(result.error || 'Could not apply rainy day watering');
      return;
    }
    setPlants((prev) => prev.map((plant) => ({ ...plant, last_watered: result.data.when })));
    toast.success(`🌧️ Rainy day applied — ${result.data.total} plants marked watered today.`);
    await fetchActivities();
  };

  const markFertilized = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    const result = await markFertilizedAction(id);
    if (!result.ok) {
      toast.error(result.error || 'Failed to record fertilizing');
      return;
    }
    if (result.data.alreadyToday) {
      toast.info(`${name} is already marked as fertilized today.`);
      return;
    }
    toast.success(`🌱 ${name} fertilized today!`);
    setPlants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, last_fertilized: result.data.fertilizedDate } : p)),
    );
    await fetchActivities();
  };

  const deletePlant = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    if (!confirm(`Delete ${name} and its photos?`)) return;

    const result = await deletePlantAction(id);
    if (!result.ok) {
      toast.error(result.error || 'Failed to delete plant');
      return;
    }

    toast.success(`${name} deleted`);
    await fetchPlants();
    await fetchActivities();
  };

  const openEditModal = (plant: Plant) => {
    if (isWriteDisabled) return;
    editPhotoBaselineRef.current = plant.photo_url ?? null;
    setEditWaterDays(String(plant.watering_frequency_days));
    setEditFertDays(String(plant.fertilizer_frequency_days));
    setEditingPlant({ ...plant });
    setIsEditModalOpen(true);
  };

  const clearActivityLog = async () => {
    if (isWriteDisabled) return;
    if (!confirm('Clear the entire activity log?')) return;
    const result = await clearActivityLogAction();
    if (!result.ok) {
      toast.error(result.error || 'Failed to clear log');
      return;
    }
    toast.success('Activity log cleared');
    await fetchActivities();
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-desert-page">Loading Garden...</div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-desert-page flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-desert-parchment rounded-3xl shadow-xl shadow-desert-border/20 p-10 ring-1 ring-desert-border/30">
          <div className="flex justify-center mb-6"><Lock className="h-12 w-12 text-oasis" /></div>
          <h1 className="text-4xl font-bold text-center text-oasis mb-2">Laveen Garden</h1>
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <Input type="password" value={enteredPassword} onChange={(e) => setEnteredPassword(e.target.value)} placeholder="demo (demo mode)" required className="text-lg py-6" />
            <Button type="submit" className="w-full bg-oasis hover:bg-oasis-hover py-6 text-lg rounded-full">Enter Garden</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''} bg-desert-page text-desert-ink`}>
      <Toaster position="top-center" richColors />

      {isAuthenticated && !loading && (pullDistance > 0 || isRefreshing) && (
        <div
          className="pointer-events-none fixed left-0 right-0 z-[60] flex justify-center pt-[max(0.5rem,env(safe-area-inset-top))]"
          aria-hidden
        >
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full bg-desert-parchment/95 shadow-md ring-1 ring-desert-border',
              isRefreshing && 'ring-oasis/30',
            )}
            style={{
              transform: `translateY(${isRefreshing ? 0 : Math.min(pullDistance * 0.4, 52)}px)`,
              opacity: isRefreshing ? 1 : Math.min(pullDistance / threshold, 1),
            }}
          >
            <Loader2 className={cn('h-5 w-5 text-oasis', isRefreshing && 'animate-spin')} />
          </div>
        </div>
      )}

      {isDemoMode && (
        <div className="bg-amber-950/90 text-amber-100 py-3 px-6 flex items-center justify-center gap-2 font-medium border-b border-amber-900/50">
          <AlertTriangle className="h-5 w-5" /> DEMO MODE — All changes are temporary
        </div>
      )}

      <GardenHeader
        darkMode={darkMode}
        isDemoMode={isDemoMode}
        isGardenHeaderCollapsed={isGardenHeaderCollapsed}
        totalPlantCount={totalPlantCount}
        fertDueThisMonthOnly={fertDueThisMonthOnly}
        onToggleFertDueThisMonthOnly={() => setFertDueThisMonthOnly((v) => !v)}
        onCopyAllPlantNames={copyAllPlantNames}
        copyNamesDisabled={plants.length === 0}
        plantSearch={plantSearch}
        onPlantSearchChange={setPlantSearch}
        onClearPlantSearch={() => setPlantSearch('')}
        onToggleDarkMode={toggleDarkMode}
        onLogout={handleLogout}
        addPlantDialog={(
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger>
              <Button className="bg-oasis hover:bg-oasis-hover rounded-full" disabled={isDemoMode}>
                <Plus className="h-4 w-4 mr-1" /> New Plant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[min(92vh,720px)] w-full max-w-[95vw] overflow-x-hidden overflow-y-auto p-3 sm:max-w-lg sm:p-4">
              <DialogHeader>
                <DialogTitle className="text-oasis">Add New Plant</DialogTitle>
              </DialogHeader>
              <form onSubmit={addPlant} className="w-full max-w-full space-y-4 sm:space-y-5">
                {/* Added: desert quick-add library (searchable, category-filtered). */}
                <div className="w-full max-w-full overflow-hidden space-y-3 rounded-2xl border border-desert-border bg-desert-parchment/70 p-3 shadow-sm sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-sm font-semibold text-oasis">Quick Add from Desert Library</Label>
                    <Badge variant="outline" className="border-desert-border text-desert-sage">
                      {filteredDesertPresets.length} matches
                    </Badge>
                  </div>
                  <Input
                    value={desertPresetSearch}
                    onChange={(e) => setDesertPresetSearch(e.target.value)}
                    placeholder="Search Phoenix-friendly plants..."
                    className="h-9 w-full max-w-full px-3 text-sm"
                  />
                  <div className="w-full max-w-full overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex flex-nowrap gap-2 snap-x snap-mandatory">
                      {DESERT_PRESET_FILTERS.map((category) => {
                        const active = desertPresetFilter === category;
                        return (
                          <Button
                            key={category}
                            type="button"
                            size="sm"
                            variant={active ? 'secondary' : 'outline'}
                            className={cn(
                              'h-8 shrink-0 snap-start whitespace-nowrap rounded-full px-3 text-xs sm:h-7 sm:text-[0.8rem]',
                              active && 'bg-oasis/10 text-oasis',
                            )}
                            onClick={() => setDesertPresetFilter(category)}
                          >
                            {category}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="w-full max-w-full max-h-52 space-y-2 overflow-x-hidden overflow-y-auto sm:max-h-56">
                    {filteredDesertPresets.length > 0 ? (
                      filteredDesertPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyDesertPlantPreset(preset)}
                          className="w-full max-w-full rounded-xl border border-desert-border bg-white/70 px-3 py-2.5 text-left transition-colors hover:border-oasis/40 hover:bg-oasis/5 sm:px-4 sm:py-3 dark:bg-zinc-900/60"
                        >
                          <div className="flex w-full min-w-0 flex-col items-start space-y-1">
                            <p className="w-full min-w-0 overflow-hidden text-sm font-medium leading-5 text-desert-ink [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] dark:text-zinc-100 sm:text-base">
                              {preset.name}
                            </p>
                            <Badge variant="outline" className="max-w-full border-desert-border text-desert-dust">
                              {preset.category}
                            </Badge>
                          </div>
                          <p className="mt-1 overflow-hidden text-xs leading-4 text-desert-dust [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                            {preset.phoenix_notes}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-desert-border px-3 py-4 text-sm text-desert-sage">
                        No presets match that search. Try another name or category.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Plant Name</Label>
                  <Input required value={newPlant.name} onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <Label>Container Type</Label>
                    <Select value={newPlant.container_type} onValueChange={(v) => handleContainerTypeChange(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Grow Bag">Grow Bag</SelectItem>
                        <SelectItem value="Pot">Pot</SelectItem>
                        <SelectItem value="Raised Bed">Raised Bed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Size</Label>
                    {newPlant.container_type === 'Grow Bag' ? (
                      <Select value={newPlant.pot_size} onValueChange={(v) => setNewPlant({ ...newPlant, pot_size: v || '10 gallon' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3 gallon">3 gallon</SelectItem>
                          <SelectItem value="5 gallon">5 gallon</SelectItem>
                          <SelectItem value="10 gallon">10 gallon</SelectItem>
                          <SelectItem value="20 gallon">20 gallon</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input required value={newPlant.pot_size} onChange={(e) => setNewPlant({ ...newPlant, pot_size: e.target.value })} />
                    )}
                  </div>
                </div>
                <div>
                  <Label>Sun exposure</Label>
                  <p className="text-xs text-desert-dust mt-0.5 mb-2">
                    Where the container sits — full sun heats soil fast in the desert; partial shade can reduce stress.
                  </p>
                  <Select
                    value={newPlant.sun_exposure}
                    onValueChange={(v) => setNewPlant({ ...newPlant, sun_exposure: v as SunExposure })}
                  >
                    <SelectTrigger>
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <Label>Water every (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      required
                      value={newPlant.watering_frequency_days === '' ? '' : newPlant.watering_frequency_days}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') setNewPlant({ ...newPlant, watering_frequency_days: '' });
                        else {
                          const n = parseInt(v, 10);
                          if (!Number.isNaN(n)) setNewPlant({ ...newPlant, watering_frequency_days: n });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <Label>Fertilize every (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      required
                      value={newPlant.fertilizer_frequency_days === '' ? '' : newPlant.fertilizer_frequency_days}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') setNewPlant({ ...newPlant, fertilizer_frequency_days: '' });
                        else {
                          const n = parseInt(v, 10);
                          if (!Number.isNaN(n)) setNewPlant({ ...newPlant, fertilizer_frequency_days: n });
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <Label>Last watered</Label>
                    <Input
                      type="date"
                      value={newPlant.last_watered}
                      onChange={(e) => setNewPlant({ ...newPlant, last_watered: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Last fertilized</Label>
                    <Input
                      type="date"
                      value={newPlant.last_fertilized}
                      onChange={(e) => setNewPlant({ ...newPlant, last_fertilized: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Fertilizer seasons (Northern Hemisphere)</Label>
                  <p className="text-xs text-desert-dust mb-2">
                    Fertilizing is only scheduled in checked seasons; other months are treated as off-season.
                  </p>
                  <FertilizerSeasonCheckboxes
                    value={newPlant.fertilizer_seasons}
                    onChange={(fertilizer_seasons) => setNewPlant({ ...newPlant, fertilizer_seasons })}
                    disabled={isDemoMode}
                  />
                </div>
                <div>
                  <Label htmlFor="new-fert-notes">Fertilizer notes (optional)</Label>
                  <Textarea
                    id="new-fert-notes"
                    value={newPlant.fertilizer_notes}
                    onChange={(e) => setNewPlant({ ...newPlant, fertilizer_notes: e.target.value })}
                    placeholder="e.g. 10-10-10 balanced, half strength"
                    className="mt-1 min-h-[72px] resize-y"
                    disabled={isDemoMode}
                  />
                </div>
                <div>
                  <Label>Homepage photo (optional)</Label>
                  <p className="text-xs text-desert-dust mb-2">Shown on the garden grid; add more on the plant profile.</p>
                  <Button type="button" variant="outline" className="w-full flex items-center justify-center gap-2 py-6" onClick={() => triggerFileInput(false)} disabled={isDemoMode || isUploading}>
                    {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                    {isUploading ? 'Uploading Photo...' : 'Choose Photo'}
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e)} className="hidden" />

                  {newPreviewUrl && (
                    <div className="mt-4 relative">
                      <img src={newPreviewUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-xl border border-desert-border" />
                      <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => removePreview(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {(newPreviewUrl || newPlant.photo_url) && (
                    <div className="mt-3 space-y-1.5">
                      <Label htmlFor="new-photo-timeline">Photo date on timeline</Label>
                      <p className="text-xs text-desert-dust">
                        Shown on the plant profile history. We pre-fill from the file when the device provides it;
                        change this if it&apos;s an older photo.
                      </p>
                      <Input
                        id="new-photo-timeline"
                        type="datetime-local"
                        value={newPhotoTimelineAt}
                        onChange={(e) => setNewPhotoTimelineAt(e.target.value)}
                        disabled={isDemoMode}
                        className="max-w-full sm:max-w-xs"
                      />
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full bg-oasis hover:bg-oasis-hover rounded-full py-3" disabled={isDemoMode || isUploading}>
                  {isUploading ? 'Uploading Photo...' : 'Add to Garden'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <main className="max-w-7xl mx-auto px-6 py-10">
        <GardenWeather
          weather={weather}
          showRainyDayButton={showRainyDayButton}
          onMarkAllWateredToday={markAllWateredToday}
          rainyDayDisabled={isDemoMode || plants.length === 0}
        />

        {plants.length > 0 && fertilizerUpcoming.length > 0 ? (
          <Card className="mb-10 border-amber-700/30 bg-gradient-to-br from-amber-50/90 to-desert-parchment dark:from-amber-950/40 dark:to-zinc-900 dark:border-amber-900/40">
            <CardHeader className="pb-2">
              <button
                type="button"
                onClick={() => setIsFertilizerOpen((v) => !v)}
                className="flex w-full items-start justify-between gap-3 rounded-xl text-left outline-none transition-colors hover:bg-amber-100/40 focus-visible:ring-2 focus-visible:ring-amber-500/30 dark:hover:bg-amber-950/30 -m-2 p-2"
                aria-expanded={isFertilizerOpen}
                aria-controls="fertilizer-upcoming-panel"
                id="fertilizer-upcoming-toggle"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Sprout className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                    Fertilizer — coming up
                  </CardTitle>
                  {isFertilizerOpen ? (
                    <p className="text-sm text-desert-dust dark:text-zinc-300">
                      Only counts months you marked as fertilizer seasons. Northern Hemisphere: winter Dec–Feb, spring
                      Mar–May, summer Jun–Aug, fall Sep–Nov.
                    </p>
                  ) : (
                    <p className="text-sm text-desert-dust dark:text-zinc-300">
                      {fertilizerUpcoming.length} plant{fertilizerUpcoming.length === 1 ? '' : 's'} due.
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    'mt-1 h-5 w-5 shrink-0 text-desert-dust transition-transform',
                    isFertilizerOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>
            </CardHeader>
            {isFertilizerOpen ? (
              <CardContent
                id="fertilizer-upcoming-panel"
                role="region"
                aria-labelledby="fertilizer-upcoming-toggle"
                className="space-y-6"
              >
                {(['overdue', 'due_soon', 'due_month'] as const).map((bucket) => {
                  const slice = fertilizerUpcoming.filter((x) => x.urgency === bucket);
                  if (slice.length === 0) return null;
                  const title =
                    bucket === 'overdue'
                      ? 'Overdue'
                      : bucket === 'due_soon'
                        ? 'Due within 7 days'
                        : 'Due later this month';
                  return (
                    <div key={bucket}>
                      <h3 className="mb-2 text-sm font-semibold text-desert-ink dark:text-zinc-100">{title}</h3>
                      <ul className="space-y-2">
                        {slice.map(({ plant: p, next }) => (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-desert-mist bg-white/70 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800/85"
                          >
                            <Link href={`/plant/${p.id}`} className="font-medium text-oasis hover:underline dark:text-emerald-300">
                              {p.name}
                            </Link>
                            <span className="text-desert-dust dark:text-zinc-300">
                              Next: {next ? format(next, 'MMM d') : '—'} ·{' '}
                              {p.fertilizer_seasons?.map((s) => seasonLabel(s as FertilizerSeason)).join(', ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </CardContent>
            ) : null}
          </Card>
        ) : null}

        {plants.length > 0 ? (
          <WateringCalendar
            plants={plants}
            numDays={3}
            onMarkTodayPlantsWatered={markSelectedTodayPlantsWatered}
            bulkActionDisabled={isDemoMode}
            bulkActionBusy={bulkWateringTodayBusy}
          />
        ) : null}

        {plants.length === 0 ? (
          <Card className="mb-16 rounded-3xl border border-desert-border bg-desert-parchment">
            <CardContent className="py-16 text-center">
              <p className="text-lg text-desert-sage">
                No plants yet. Add your first plant with <span className="font-medium text-oasis">New Plant</span>
                {isDemoMode ? ' (disabled in demo).' : '.'}
              </p>
            </CardContent>
          </Card>
        ) : filteredPlants.length === 0 ? (
          <Card className="mb-16 rounded-3xl border border-desert-border bg-desert-parchment">
            <CardContent className="py-16 text-center space-y-2">
              <p className="text-lg font-medium text-desert-ink">No plants found</p>
              <p className="text-desert-sage">
                {fertDueThisMonthOnly
                  ? 'No plants match “due this month” with your search. Try turning off the filter or clear the search.'
                  : `Nothing matches “${plantSearch.trim()}”. Try another name or clear the search.`}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {plantSearch.trim() ? (
                  <Button type="button" variant="outline" size="sm" className="mt-2 rounded-full" onClick={() => setPlantSearch('')}>
                    Clear search
                  </Button>
                ) : null}
                {fertDueThisMonthOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 rounded-full"
                    onClick={() => setFertDueThisMonthOnly(false)}
                  >
                    Show all plants
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <PlantGrid
            plants={filteredPlants}
            isDemoMode={isDemoMode}
            onMarkWatered={markWatered}
            onMarkFertilized={markFertilized}
            onEdit={openEditModal}
            onDelete={deletePlant}
          />
        )}

        <ActivityLog
          activities={activities}
          isDemoMode={isDemoMode}
          onClearActivityLog={clearActivityLog}
        />
      </main>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-oasis">Edit Plant</DialogTitle>
          </DialogHeader>
          {editingPlant && (
            <form onSubmit={updatePlant} className="space-y-5">
              <div>
                <Label>Plant Name</Label>
                <Input value={editingPlant.name} onChange={(e) => setEditingPlant({ ...editingPlant, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Container Type</Label>
                  <Select value={editingPlant.container_type} onValueChange={(v) => handleContainerTypeChange(v, true)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Grow Bag">Grow Bag</SelectItem>
                      <SelectItem value="Pot">Pot</SelectItem>
                      <SelectItem value="Raised Bed">Raised Bed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Size</Label>
                  {editingPlant.container_type === 'Grow Bag' ? (
                    <Select value={editingPlant.pot_size} onValueChange={(v) => setEditingPlant({ ...editingPlant, pot_size: v || '10 gallon' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3 gallon">3 gallon</SelectItem>
                        <SelectItem value="5 gallon">5 gallon</SelectItem>
                        <SelectItem value="10 gallon">10 gallon</SelectItem>
                        <SelectItem value="20 gallon">20 gallon</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={editingPlant.pot_size} onChange={(e) => setEditingPlant({ ...editingPlant, pot_size: e.target.value })} />
                  )}
                </div>
              </div>
              <div>
                <Label>Sun exposure</Label>
                <p className="text-xs text-desert-dust mt-0.5 mb-2">
                  Container placement — matters a lot for heat and watering in Laveen.
                </p>
                <Select
                  value={normalizeSunExposure(editingPlant.sun_exposure)}
                  onValueChange={(v) =>
                    setEditingPlant({ ...editingPlant, sun_exposure: v as SunExposure })
                  }
                >
                  <SelectTrigger>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Water every (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={editWaterDays}
                    onChange={(e) => setEditWaterDays(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fertilize every (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={editFertDays}
                    onChange={(e) => setEditFertDays(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Last watered</Label>
                  <Input
                    type="date"
                    value={isoOrDateToDateInputValue(editingPlant.last_watered)}
                    onChange={(e) =>
                      setEditingPlant({
                        ...editingPlant,
                        last_watered: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Last fertilized</Label>
                  <Input
                    type="date"
                    value={isoOrDateToDateInputValue(editingPlant.last_fertilized)}
                    onChange={(e) =>
                      setEditingPlant({
                        ...editingPlant,
                        last_fertilized: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Fertilizer seasons</Label>
                <FertilizerSeasonCheckboxes
                  value={editingPlant.fertilizer_seasons ?? ALL_FERTILIZER_SEASONS}
                  onChange={(fertilizer_seasons) => setEditingPlant({ ...editingPlant, fertilizer_seasons })}
                  disabled={isDemoMode}
                />
              </div>
              <div>
                <Label htmlFor="edit-fert-notes">Fertilizer notes</Label>
                <Textarea
                  id="edit-fert-notes"
                  value={editingPlant.fertilizer_notes ?? ''}
                  onChange={(e) =>
                    setEditingPlant({
                      ...editingPlant,
                      fertilizer_notes: e.target.value || null,
                    })
                  }
                  className="mt-1 min-h-[72px]"
                  disabled={isDemoMode}
                />
              </div>
              <div>
                <Label>Homepage photo</Label>
                <p className="text-xs text-desert-dust mb-2">Replaces the card image; previous shots stay in the profile timeline when you save.</p>
                <Button type="button" variant="outline" className="w-full flex items-center justify-center gap-2 py-6" onClick={() => triggerFileInput(true)} disabled={isDemoMode || isUploading}>
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                  {isUploading ? 'Uploading Photo...' : 'Choose New Photo'}
                </Button>
                <input ref={editFileInputRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, true)} className="hidden" />

                {editPreviewUrl && (
                  <div className="mt-4 relative">
                    <img src={editPreviewUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-xl border border-desert-border" />
                    <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => removePreview(true)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {editPreviewUrl && (
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="edit-photo-timeline">Photo date on timeline</Label>
                    <p className="text-xs text-desert-dust">
                      Used when you save — this shot is added to profile history with this timestamp.
                    </p>
                    <Input
                      id="edit-photo-timeline"
                      type="datetime-local"
                      value={editPhotoTimelineAt}
                      onChange={(e) => setEditPhotoTimelineAt(e.target.value)}
                      disabled={isDemoMode}
                      className="max-w-full sm:max-w-xs"
                    />
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full bg-oasis hover:bg-oasis-hover rounded-full py-3" disabled={isDemoMode || isUploading}>
                {isUploading ? 'Uploading Photo...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
