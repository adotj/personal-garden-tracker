'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import type { FertilizerSeason, Plant, SunExposure } from '@/lib/plant-types';
import { SUN_EXPOSURE_OPTIONS, sunExposureLabel } from '@/lib/plant-types';
import {
  formatPlantCareInstant,
  isPlantCareDateToday,
  isoOrDateToDateInputValue,
  normalizePlantRow,
  plantInsertCorePayload,
  plantInsertExtendedPatch,
  plantUpdateCorePayload,
  plantUpdateExtendedPatch,
  normalizeSunExposure,
  wateringLoggedAtIso,
} from '@/lib/plant-helpers';
import {
  ALL_FERTILIZER_SEASONS,
  computeNextFertilizationDue,
  fertilizerDueSoonOrOverdue,
  fertilizerUrgency,
  formatNextFertilizationDue,
  needsFertilizerThisMonth,
  normalizeFertilizerSeasons,
  seasonLabel,
} from '@/lib/fertilizer-schedule';
import { FertilizerSeasonCheckboxes } from '@/components/FertilizerSeasonCheckboxes';
import { WateringCalendar } from '@/components/WateringCalendar';
import { uploadPlantImage, deletePlantImageFromStorage } from '@/lib/storage-upload';
import {
  datetimeLocalToIsoUtc,
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
import { Plus, Droplet, Edit, Trash2, Sun, History, Moon, Sun as SunIcon, Trash, Lock, AlertTriangle, Image as ImageIcon, Loader2, X, Sprout, Search, CalendarRange, ChevronDown, Copy } from 'lucide-react';
import { format, addDays, differenceInDays, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { toast, Toaster } from 'sonner';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';
import { usdaHardinessZoneLabel } from '@/lib/garden-site';

type Activity = {
  id: string;
  action: string;
  plant_name?: string;
  details?: string;
  created_at: string;
};

/** Add-plant form: allow '' while typing so mobile browsers don’t snap back to defaults */
type NewPlantForm = {
  name: string;
  species: string;
  container_type: string;
  pot_size: string;
  sun_exposure: SunExposure;
  watering_frequency_days: number | '';
  fertilizer_frequency_days: number | '';
  last_watered: string;
  last_fertilized: string;
  fertilizer_seasons: FertilizerSeason[];
  fertilizer_notes: string;
  location_in_garden: string;
  photo_url: string | null;
};

type PlantViewMode = 'list' | 'table' | 'grid';
type TableSortKey = 'name' | 'container' | 'watering' | 'fertilizer';
type TableSortDirection = 'asc' | 'desc';

function safeFormatDay(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return isValid(d) ? format(d, 'MMM d') : 'Never';
}

function safeFormatDue(iso: string | null, freqDays: number): string {
  if (!iso || freqDays < 1) return '';
  const last = new Date(iso);
  const due = addDays(last, freqDays);
  if (!isValid(last) || !isValid(due)) return '';
  return format(due, 'MMM d');
}

function formatActivityWhen(iso: string): string {
  const d = new Date(iso);
  return isValid(d) ? format(d, "EEE, MMM d, yyyy 'at' h:mm a") : iso;
}

function activityRelativeTime(iso: string): string {
  const d = new Date(iso);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '';
}

/** Short headline for each log row (action code → plain language). */
function activityPrimaryLine(log: Activity): string {
  const name = log.plant_name?.trim();
  const quoted = name ? `“${name}”` : null;
  switch (log.action) {
    case 'Rainy Day':
      return 'Rainy day — watered every plant';
    case 'Plant Watered':
      return quoted ? `Watered ${quoted}` : 'Plant watered';
    case 'Plant Fertilized':
      return quoted ? `Fertilized ${quoted}` : 'Plant fertilized';
    case 'Plant Added':
      return quoted ? `Added ${quoted} to the garden` : 'Plant added';
    case 'Plant Edited':
      return quoted ? `Updated ${quoted}` : 'Plant updated';
    case 'Plant Deleted':
      return quoted ? `Removed ${quoted} from the garden` : 'Plant removed';
    case 'Photo Updated':
      return quoted ? `New homepage photo for ${quoted}` : 'Photo updated';
    default:
      return quoted ? `${log.action} — ${quoted}` : log.action;
  }
}

function waterDueSoon(plant: Plant): boolean {
  if (!plant.last_watered) return true;
  const freq = plant.watering_frequency_days || 7;
  const last = new Date(plant.last_watered);
  const due = addDays(last, freq);
  if (!isValid(last) || !isValid(due)) return true;
  return differenceInDays(due, new Date()) <= 2;
}

function getWeatherCondition(code: number): string {
  if (code === 0) return 'Sunny';
  if (code <= 3) return 'Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 67 || code <= 82) return 'Rain';
  if (code <= 86) return 'Snow';
  return 'Cloudy';
}

function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67 || code <= 82) return '🌧️';
  if (code <= 86) return '❄️';
  return '☁️';
}

function toCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const DEMO_PASSWORD = "demo";
const REAL_PASSWORD = process.env.NEXT_PUBLIC_SHARED_PASSWORD || "changeme";

export default function LaveenGardenTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [plants, setPlants] = useState<Plant[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [weather, setWeather] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [plantSearch, setPlantSearch] = useState('');
  const [fertDueThisMonthOnly, setFertDueThisMonthOnly] = useState(false);
  const [tableSortKey, setTableSortKey] = useState<TableSortKey>('name');
  const [tableSortDirection, setTableSortDirection] = useState<TableSortDirection>('asc');
  const [isFertilizerOpen, setIsFertilizerOpen] = useState(false);
  const [isGardenHeaderCollapsed, setIsGardenHeaderCollapsed] = useState(false);
  const [plantViewMode, setPlantViewMode] = useState<PlantViewMode>('list');
  const [bulkWateringTodayBusy, setBulkWateringTodayBusy] = useState(false);
  const editPhotoBaselineRef = useRef<string | null>(null);
  const lastScrollYRef = useRef(0);

  const [newPlant, setNewPlant] = useState<NewPlantForm>({
    name: '', species: '', container_type: 'Grow Bag', pot_size: '10 gallon',
    sun_exposure: 'full_sun',
    watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0],
    fertilizer_frequency_days: 30, last_fertilized: new Date().toISOString().split('T')[0],
    fertilizer_seasons: [...ALL_FERTILIZER_SEASONS],
    fertilizer_notes: '',
    location_in_garden: '', photo_url: null as string | null,
  });
  const [editWaterDays, setEditWaterDays] = useState('');
  const [editFertDays, setEditFertDays] = useState('');
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [newPhotoTimelineAt, setNewPhotoTimelineAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [editPhotoTimelineAt, setEditPhotoTimelineAt] = useState(() => toDatetimeLocalValue(new Date()));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

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
  }, []);

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
      fetchPlants();
      fetchActivities();
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

  const loadDemoPlants = () => {
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
  };

  const fetchPlants = async () => {
    const { data, error } = await supabase.from('plants').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      toast.error('Could not load plants');
      setPlants([]);
      return;
    }
    setPlants((data || []).map((row) => normalizePlantRow(row as Plant)));
  };

  const fetchActivities = async () => {
    const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(50);
    setActivities(data || []);
  };

  const loadWeather = useCallback(async () => {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=33.3625&longitude=-112.1695' +
      '&current=temperature_2m,wind_speed_10m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&temperature_unit=fahrenheit&timezone=America/Phoenix';
    try {
      const res = await fetch(url);
      const data = await res.json();
      const current = data?.current;
      const daily = data?.daily;
      if (!current || !daily?.time?.length) return;

      let condition = 'Sunny';
      if (current.weather_code >= 51) condition = 'Rain';
      else if (current.weather_code >= 3) condition = 'Cloudy';

      setWeather({
        temperature: Math.round(current.temperature_2m),
        condition,
        windSpeed: Math.round(current.wind_speed_10m),
        forecast: daily.time.slice(0, 3).map((date: string, i: number) => ({
          date: format(new Date(date), 'EEE'),
          high: Math.round(daily.temperature_2m_max[i]),
          low: Math.round(daily.temperature_2m_min[i]),
          condition: getWeatherCondition(daily.weather_code[i]),
          icon: getWeatherIcon(daily.weather_code[i]),
        })),
      });
    } catch {
      console.error('Weather fetch failed');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isDemoMode) {
      fetchPlants();
      fetchActivities();
      void loadWeather();
    }
  }, [isAuthenticated, isDemoMode, loadWeather]);

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
    await fetchPlants();
    await fetchActivities();
    await loadWeather();
  }, [isDemoMode, loadWeather]);

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

  const totalPlantCount = plants.length;
  const showRainyDayButton = useMemo(() => {
    if (!weather?.forecast?.length) return false;
    return weather.forecast.some((day: { condition?: string }) => day.condition === 'Rain');
  }, [weather]);

  const sortedTablePlants = useMemo(() => {
    const compareBy = (a: Plant, b: Plant): number => {
      switch (tableSortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'container': {
          const aContainer = `${a.container_type} ${a.pot_size}`;
          const bContainer = `${b.container_type} ${b.pot_size}`;
          return aContainer.localeCompare(bContainer);
        }
        case 'watering': {
          const waterDueTime = (plant: Plant) => {
            if (!plant.last_watered) return Number.NEGATIVE_INFINITY;
            const lastWatered = new Date(plant.last_watered);
            const due = addDays(lastWatered, plant.watering_frequency_days || 7);
            return isValid(due) ? due.getTime() : Number.NEGATIVE_INFINITY;
          };
          return waterDueTime(a) - waterDueTime(b);
        }
        case 'fertilizer': {
          const fertilizerDueTime = (plant: Plant) =>
            computeNextFertilizationDue(plant)?.getTime() ?? Number.POSITIVE_INFINITY;
          return fertilizerDueTime(a) - fertilizerDueTime(b);
        }
        default:
          return 0;
      }
    };

    const directionMultiplier = tableSortDirection === 'asc' ? 1 : -1;
    return [...filteredPlants].sort((a, b) => {
      const primary = compareBy(a, b);
      if (primary !== 0) return primary * directionMultiplier;
      return a.name.localeCompare(b.name) * directionMultiplier;
    });
  }, [filteredPlants, tableSortDirection, tableSortKey]);

  const toggleTableSort = (key: TableSortKey) => {
    if (tableSortKey === key) {
      setTableSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setTableSortKey(key);
    setTableSortDirection('asc');
  };

  const tableSortIconClass = (key: TableSortKey) =>
    cn(
      'h-3.5 w-3.5 transition-transform',
      tableSortKey === key
        ? tableSortDirection === 'asc'
          ? 'rotate-180 text-desert-ink'
          : 'text-desert-ink'
        : 'text-desert-dust/70',
    );

  const tableSortAriaLabel = (key: TableSortKey, label: string) => {
    if (tableSortKey === key) {
      return `Sort by ${label} (currently ${tableSortDirection === 'asc' ? 'ascending' : 'descending'})`;
    }
    return `Sort by ${label} (activate to sort ascending)`;
  };

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

  const logActivity = async (action: string, plant_name?: string, details?: string | null) => {
    if (isWriteDisabled) return;
    await supabase.from('activity_logs').insert([{ action, plant_name, details: details ?? null }]);
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

    if (photoUrl) {
      if (isEdit && editingPlant) {
        setEditingPlant({ ...editingPlant, photo_url: photoUrl });
        await logActivity(
          'Photo Updated',
          editingPlant.name,
          'Uploaded a new image; it is set as the card photo and added to the profile photo timeline.',
        );
      } else {
        setNewPlant({ ...newPlant, photo_url: photoUrl });
      }
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
    const coreRow = plantInsertCorePayload({
      name: newPlant.name,
      container_type: newPlant.container_type,
      pot_size: newPlant.pot_size,
      watering_frequency_days: waterDays,
      last_watered: newPlant.last_watered,
      last_fertilized: newPlant.last_fertilized,
      photo_url: newPlant.photo_url,
    });
    const { data: inserted, error } = await supabase.from('plants').insert([coreRow]).select('id').single();
    if (error) {
      const parts = [error.message, error.details, error.hint].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      );
      toast.error(parts.length > 0 ? parts.join(' — ') : 'Failed to add plant');
      return;
    }
    if (inserted?.id) {
      const { error: extErr } = await supabase
        .from('plants')
        .update(plantInsertExtendedPatch({
          sun_exposure: newPlant.sun_exposure,
          fertilizer_frequency_days: fertDays,
          fertilizer_seasons: seasons,
          fertilizer_notes: newPlant.fertilizer_notes,
          location_in_garden: newPlant.location_in_garden,
        }))
        .eq('id', inserted.id);
      if (extErr) {
        console.warn('plants extended columns update (add supabase/migrations if missing):', extErr);
      }
    }
    if (inserted?.id && coreRow.photo_url) {
      const createdIso = datetimeLocalToIsoUtc(newPhotoTimelineAt);
      const { error: gErr } = await supabase.from('plant_photos').insert({
        plant_id: inserted.id,
        photo_url: coreRow.photo_url,
        ...(createdIso ? { created_at: createdIso } : {}),
      });
      if (gErr) console.error('plant_photos insert:', gErr);
    }
    const addDetails = [
      `${coreRow.container_type}, ${coreRow.pot_size}.`,
      `Sun: ${sunExposureLabel(newPlant.sun_exposure)}.`,
      `Water every ${waterDays} day${waterDays === 1 ? '' : 's'}; fertilize every ${fertDays} day${fertDays === 1 ? '' : 's'}.`,
    ];
    if (seasons.length > 0 && seasons.length < ALL_FERTILIZER_SEASONS.length) {
      addDetails.push(`Fertilizer scheduled in: ${seasons.map(seasonLabel).join(', ')}.`);
    }
    if (coreRow.photo_url) addDetails.push('Homepage photo attached.');
    await logActivity('Plant Added', newPlant.name, addDetails.join(' '));
    toast.success('Plant added successfully! 🌱');
    if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
    setIsAddModalOpen(false);
    setNewPlant({
      name: '',
      species: '',
      container_type: 'Grow Bag',
      pot_size: '10 gallon',
      sun_exposure: 'full_sun',
      watering_frequency_days: 3,
      fertilizer_frequency_days: 30,
      last_watered: new Date().toISOString().split('T')[0],
      last_fertilized: new Date().toISOString().split('T')[0],
      fertilizer_seasons: [...ALL_FERTILIZER_SEASONS],
      fertilizer_notes: '',
      location_in_garden: '',
      photo_url: null,
    });
    setNewPreviewUrl(null);
    setNewPhotoTimelineAt(toDatetimeLocalValue(new Date()));
    fetchPlants();
    fetchActivities();
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
    const merged: Plant = { ...editingPlant, watering_frequency_days: wf, fertilizer_frequency_days: ff };
    const { error: coreError } = await supabase
      .from('plants')
      .update(plantUpdateCorePayload(merged))
      .eq('id', editingPlant.id);
    if (coreError) {
      toast.error(coreError.message || 'Failed to update plant');
      return;
    }
    const { error: extError } = await supabase
      .from('plants')
      .update(plantUpdateExtendedPatch(merged))
      .eq('id', editingPlant.id);
    if (extError) {
      console.warn('plants extended columns update (add supabase/migrations if missing):', extError);
    }
    {
      if (
        merged.photo_url &&
        merged.photo_url !== baseline
      ) {
        const createdIso = datetimeLocalToIsoUtc(editPhotoTimelineAt);
        const { error: gErr } = await supabase.from('plant_photos').insert({
          plant_id: editingPlant.id,
          photo_url: merged.photo_url,
          ...(createdIso ? { created_at: createdIso } : {}),
        });
        if (gErr) console.error('plant_photos insert:', gErr);
      }
      editPhotoBaselineRef.current = null;
      const fertSeasons = normalizeFertilizerSeasons(merged.fertilizer_seasons);
      const editDetails = [
        `${merged.container_type}, ${merged.pot_size}.`,
        `Sun: ${sunExposureLabel(merged.sun_exposure)}.`,
        `Water every ${wf} day${wf === 1 ? '' : 's'}; fertilize every ${ff} day${ff === 1 ? '' : 's'}.`,
        `Fertilizer seasons: ${fertSeasons.map(seasonLabel).join(', ')}.`,
      ];
      if (merged.photo_url && merged.photo_url !== baseline) {
        editDetails.push('Card / homepage photo was replaced.');
      }
      await logActivity('Plant Edited', editingPlant.name, editDetails.join(' '));
      toast.success('Plant updated successfully!');
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
      setIsEditModalOpen(false);
      setEditingPlant(null);
      setEditPreviewUrl(null);
      setEditPhotoTimelineAt(toDatetimeLocalValue(new Date()));
      fetchPlants();
      fetchActivities();
    }
  };

  const markWatered = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    const plant = plants.find((p) => p.id === id);
    if (isPlantCareDateToday(plant?.last_watered)) {
      toast.info(`${name} is already marked as watered today.`);
      return;
    }
    const when = wateringLoggedAtIso();
    const { error } = await supabase.from('plants').update({ last_watered: when }).eq('id', id);
    if (error) {
      const parts = [error.message, error.details, error.hint].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      );
      toast.error(parts.length > 0 ? parts.join(' — ') : 'Could not mark watered');
      return;
    }
    const whenLabel = formatPlantCareInstant(when, 'profile');
    await logActivity('Plant Watered', name, `Last watered on this plant’s record is now ${whenLabel}.`);
    toast.success(`✅ ${name} marked watered`);
    fetchPlants();
    fetchActivities();
  };

  const markSelectedTodayPlantsWatered = async (plantIds: string[]): Promise<boolean> => {
    if (isWriteDisabled) return false;
    const uniqueIds = Array.from(new Set(plantIds));
    if (uniqueIds.length === 0) {
      toast.info('Select at least one plant due today.');
      return false;
    }
    const selectedIdSet = new Set(uniqueIds);
    const selectedPlants = plants.filter((plant) => selectedIdSet.has(plant.id));
    if (selectedPlants.length === 0) {
      toast.info('Those plants are no longer in today’s due list.');
      return false;
    }
    const pendingPlants = selectedPlants.filter((plant) => !isPlantCareDateToday(plant.last_watered));
    if (pendingPlants.length === 0) {
      toast.info('Selected plants are already marked watered today.');
      return false;
    }

    setBulkWateringTodayBusy(true);
    const when = wateringLoggedAtIso();
    const pendingIds = pendingPlants.map((plant) => plant.id);
    const pendingIdSet = new Set(pendingIds);
    const { error } = await supabase.from('plants').update({ last_watered: when }).in('id', pendingIds);
    setBulkWateringTodayBusy(false);
    if (error) {
      const parts = [error.message, error.details, error.hint].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      );
      toast.error(parts.length > 0 ? parts.join(' — ') : 'Could not mark selected plants watered');
      return false;
    }

    setPlants((prev) =>
      prev.map((plant) => (pendingIdSet.has(plant.id) ? { ...plant, last_watered: when } : plant)),
    );
    const whenLabel = formatPlantCareInstant(when, 'profile');
    await logActivity(
      'Plant Watered',
      undefined,
      `Bulk watered ${pendingPlants.length} plant${pendingPlants.length === 1 ? '' : 's'}. Last watered is now ${whenLabel}.`,
    );
    toast.success(`✅ Marked ${pendingPlants.length} plant${pendingPlants.length === 1 ? '' : 's'} watered.`);
    await fetchActivities();
    return true;
  };

  const markAllWateredToday = async () => {
    if (isWriteDisabled) return;
    if (plants.length === 0) {
      toast.info('No plants to update yet.');
      return;
    }
    const alreadyWateredToday = plants.filter((plant) => isPlantCareDateToday(plant.last_watered)).length;
    if (alreadyWateredToday === plants.length) {
      toast.info('All plants are already marked watered today.');
      return;
    }

    const when = wateringLoggedAtIso();
    const { error } = await supabase.from('plants').update({ last_watered: when });
    if (error) {
      const parts = [error.message, error.details, error.hint].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      );
      toast.error(parts.length > 0 ? parts.join(' — ') : 'Could not apply rainy day watering');
      return;
    }

    setPlants((prev) => prev.map((plant) => ({ ...plant, last_watered: when })));
    const whenLabel = formatPlantCareInstant(when, 'profile');
    await logActivity(
      'Rainy Day',
      undefined,
      `Set last watered to ${whenLabel} for all ${plants.length} plants.`,
    );
    toast.success(`🌧️ Rainy day applied — ${plants.length} plants marked watered today.`);
    await fetchActivities();
  };

  const markFertilized = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    const plant = plants.find((p) => p.id === id);
    if (isPlantCareDateToday(plant?.last_fertilized)) {
      toast.info(`${name} is already marked as fertilized today.`);
      return;
    }

    const { data: logRow, error: logError } = await supabase
      .from('activity_logs')
      .insert([{ action: 'Plant Fertilized', plant_name: name }])
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
      .eq('id', id)
      .select('id');

    if (plantError || !updated?.length) {
      await supabase.from('activity_logs').delete().eq('id', logRow.id);
      toast.error(plantError?.message ?? 'Plant fertilizer date did not save — check the plants table has last_fertilized and RLS allows updates.');
      await fetchActivities();
      return;
    }

    toast.success(`🌱 ${name} fertilized today!`);
    setPlants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, last_fertilized: fertilizedDate } : p)),
    );
    const fertWhen = isValid(parseISO(fertilizedDate))
      ? format(parseISO(fertilizedDate), 'MMMM d, yyyy')
      : fertilizedDate;
    await supabase
      .from('activity_logs')
      .update({
        details: `Last fertilized on this plant’s record is now ${fertWhen} (from the dashboard).`,
      })
      .eq('id', logRow.id);
    const { error: fertLogErr } = await supabase.from('fertilizer_logs').insert({
      plant_id: id,
      applied_on: fertilizedDate,
      notes: null,
    });
    if (fertLogErr) console.warn('fertilizer_logs insert:', fertLogErr);
    await fetchPlants();
    await fetchActivities();
  };

  const deletePlant = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    if (!confirm(`Delete ${name} and its photos?`)) return;
    const plantToDelete = plants.find(p => p.id === id);

    const { data: galleryRows } = await supabase.from('plant_photos').select('photo_url').eq('plant_id', id);
    const urls = new Set<string>();
    galleryRows?.forEach((r: { photo_url: string }) => urls.add(r.photo_url));
    if (plantToDelete?.photo_url) urls.add(plantToDelete.photo_url);
    for (const url of urls) await deletePlantImageFromStorage(url);

    const { error } = await supabase.from('plants').delete().eq('id', id);
    if (error) toast.error('Failed to delete plant');
    else {
      const imgCount = urls.size;
      await logActivity(
        'Plant Deleted',
        name,
        imgCount > 0
          ? `Removed the plant and deleted ${imgCount} image file${imgCount === 1 ? '' : 's'} from storage.`
          : 'Removed the plant record.',
      );
      toast.success(`${name} deleted`);
      fetchPlants();
      fetchActivities();
    }
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
    const { error } = await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) toast.error('Failed to clear log');
    else {
      toast.success('Activity log cleared');
      fetchActivities();
    }
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

      <header className="sticky top-0 z-50 bg-desert-parchment/95 backdrop-blur border-b border-desert-border">
        <div
          className={cn(
            'max-w-7xl mx-auto px-6 flex flex-wrap justify-between items-center gap-3 transition-[padding] duration-300',
            isGardenHeaderCollapsed ? 'py-2' : 'py-4',
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                'shrink-0 transition-[font-size] duration-300',
                isGardenHeaderCollapsed ? 'text-2xl' : 'text-4xl',
              )}
            >
              🌵
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <div
                className={cn(
                  'font-bold tracking-tighter text-oasis transition-[font-size] duration-300',
                  isGardenHeaderCollapsed ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl',
                )}
              >
                Laveen Garden
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border border-desert-border/50 bg-desert-dune/40 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-oasis transition-all duration-300',
                  isGardenHeaderCollapsed && 'max-w-0 overflow-hidden border-transparent px-0 py-0 opacity-0',
                )}
                aria-label={`${totalPlantCount} plants in your garden`}
              >
                {totalPlantCount} {totalPlantCount === 1 ? 'plant' : 'plants'}
                {isDemoMode ? ' · demo' : ''}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full border border-desert-border/50 bg-desert-dune/40 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-oasis transition-all duration-300',
                  isGardenHeaderCollapsed && 'max-w-0 overflow-hidden border-transparent px-0 py-0 opacity-0',
                )}
                title="USDA Plant Hardiness Zone"
              >
                {usdaHardinessZoneLabel()}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {darkMode ? <SunIcon className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger>
                <Button className="bg-oasis hover:bg-oasis-hover rounded-full" disabled={isDemoMode}>
                  <Plus className="h-4 w-4 mr-1" /> New Plant
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-oasis">Add New Plant</DialogTitle>
                </DialogHeader>
                <form onSubmit={addPlant} className="space-y-5">
                  <div>
                    <Label>Plant Name</Label>
                    <Input required value={newPlant.name} onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>

        <div
          className={cn(
            'max-w-7xl mx-auto bg-gradient-to-b from-desert-dune/35 to-desert-dune/10 px-4 dark:from-desert-dune/80 dark:to-desert-page/50 sm:px-6 transition-all duration-300 overflow-hidden',
            isGardenHeaderCollapsed
              ? 'max-h-0 border-t-0 pb-0 pt-0 opacity-0'
              : 'max-h-[320px] border-t border-desert-border/30 pb-3 pt-3 opacity-100',
          )}
          aria-hidden={isGardenHeaderCollapsed}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" role="status" aria-live="polite">
              <span className="text-xl font-semibold tabular-nums text-oasis sm:text-2xl">
                {totalPlantCount}
              </span>
              <span className="text-sm text-desert-sage">
                {totalPlantCount === 1 ? 'plant' : 'plants'} in your garden
                {isDemoMode ? ' · demo' : ''}
              </span>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-2xl sm:flex-row sm:items-center">
              <Button
                type="button"
                variant={fertDueThisMonthOnly ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'h-10 shrink-0 rounded-full px-3 text-xs sm:text-sm',
                  fertDueThisMonthOnly && 'bg-amber-600 text-white hover:bg-amber-700',
                )}
                onClick={() => setFertDueThisMonthOnly((v) => !v)}
              >
                <CalendarRange className="mr-1.5 h-4 w-4" />
                Due this month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 rounded-full px-3 text-xs sm:text-sm"
                onClick={copyAllPlantNames}
                disabled={plants.length === 0}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Copy names
              </Button>
              <div
                className="flex h-10 shrink-0 items-center rounded-full border border-desert-border/50 bg-desert-parchment/70 p-1"
                role="group"
                aria-label="Plant view mode"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={plantViewMode === 'list' ? 'default' : 'ghost'}
                  className={cn(
                    'h-8 rounded-full px-3 text-xs sm:text-sm',
                    plantViewMode === 'list'
                      ? 'bg-oasis text-white hover:bg-oasis-hover'
                      : 'text-desert-sage hover:text-desert-ink',
                  )}
                  onClick={() => setPlantViewMode('list')}
                  aria-pressed={plantViewMode === 'list'}
                >
                  List
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={plantViewMode === 'table' ? 'default' : 'ghost'}
                  className={cn(
                    'h-8 rounded-full px-3 text-xs sm:text-sm',
                    plantViewMode === 'table'
                      ? 'bg-oasis text-white hover:bg-oasis-hover'
                      : 'text-desert-sage hover:text-desert-ink',
                  )}
                  onClick={() => setPlantViewMode('table')}
                  aria-pressed={plantViewMode === 'table'}
                >
                  Table
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={plantViewMode === 'grid' ? 'default' : 'ghost'}
                  className={cn(
                    'h-8 rounded-full px-3 text-xs sm:text-sm',
                    plantViewMode === 'grid'
                      ? 'bg-oasis text-white hover:bg-oasis-hover'
                      : 'text-desert-sage hover:text-desert-ink',
                  )}
                  onClick={() => setPlantViewMode('grid')}
                  aria-pressed={plantViewMode === 'grid'}
                >
                  Grid
                </Button>
              </div>
              <div className="relative min-w-0 flex-1">
                <label htmlFor="garden-plant-filter" className="sr-only">
                  Search plants by name
                </label>
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-desert-dust opacity-80"
                  aria-hidden
                />
                <input
                  id="garden-plant-filter"
                  name="garden-plant-filter"
                  type="search"
                  value={plantSearch}
                  onChange={(e) => setPlantSearch(e.target.value)}
                  placeholder="Search plants by name…"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    'h-10 w-full rounded-full border border-desert-border/50 bg-desert-parchment/70 pl-10 text-sm text-desert-ink shadow-sm',
                    'placeholder:text-desert-dust/65',
                    'transition-[box-shadow,border-color] duration-200',
                    'focus:border-oasis focus:outline-none focus:ring-2 focus:ring-oasis/25',
                    'dark:border-desert-border dark:bg-desert-page/55 dark:text-desert-ink dark:placeholder:text-desert-dust/70',
                    'dark:focus:border-oasis dark:focus:ring-oasis/25',
                    plantSearch.length > 0 ? 'pr-11' : 'pr-4',
                  )}
                />
                {plantSearch.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPlantSearch('')}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-desert-dust transition-colors hover:bg-desert-mist/60 hover:text-desert-ink dark:hover:bg-desert-mist/40 dark:hover:text-desert-ink"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {weather && (
          <div className="mb-12 bg-desert-parchment rounded-3xl p-8 border border-desert-border shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm text-desert-dust">
                3-day forecast
              </div>
              {showRainyDayButton ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full px-3 text-xs sm:text-sm"
                  onClick={markAllWateredToday}
                  disabled={isDemoMode || plants.length === 0}
                >
                  <Droplet className="mr-1.5 h-4 w-4" />
                  Rainy Day
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-8 mb-8">
              <Sun className="h-12 w-12 text-amber-500" />
              <div>
                <div className="text-7xl font-light">{weather.temperature}°F</div>
                <div className="text-2xl text-desert-dust">{weather.condition}</div>
              </div>
              <div className="text-sm text-desert-dust">
                Wind: {weather.windSpeed} mph
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {weather.forecast?.map((day: any, index: number) => (
                <div key={index} className="text-center bg-desert-dune rounded-2xl p-5 border border-desert-mist">
                  <div className="font-medium text-sm mb-2">{day.date}</div>
                  <div className="text-4xl mb-3">{day.icon}</div>
                  <div className="text-3xl font-light mb-1">{day.high}°</div>
                  <div className="text-sm text-desert-dust">{day.low}°</div>
                  <div className="text-xs mt-2 text-desert-dust">{day.condition}</div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                              {p.fertilizer_seasons?.map((s) => seasonLabel(s)).join(', ')}
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
        ) : plantViewMode === 'table' ? (
          <div className="mb-16 overflow-hidden rounded-3xl border border-desert-border bg-desert-parchment shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-desert-dune/60 text-left text-desert-sage">
                  <tr>
                    <th
                      className="px-4 py-3 font-semibold"
                      aria-sort={
                        tableSortKey === 'name'
                          ? tableSortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left text-sm font-semibold hover:text-desert-ink"
                        onClick={() => toggleTableSort('name')}
                        aria-label={tableSortAriaLabel('name', 'plant name')}
                      >
                        Plant
                        <ChevronDown className={tableSortIconClass('name')} aria-hidden />
                      </button>
                    </th>
                    <th
                      className="px-4 py-3 font-semibold"
                      aria-sort={
                        tableSortKey === 'container'
                          ? tableSortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left text-sm font-semibold hover:text-desert-ink"
                        onClick={() => toggleTableSort('container')}
                        aria-label={tableSortAriaLabel('container', 'container')}
                      >
                        Container
                        <ChevronDown className={tableSortIconClass('container')} aria-hidden />
                      </button>
                    </th>
                    <th
                      className="px-4 py-3 font-semibold"
                      aria-sort={
                        tableSortKey === 'watering'
                          ? tableSortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left text-sm font-semibold hover:text-desert-ink"
                        onClick={() => toggleTableSort('watering')}
                        aria-label={tableSortAriaLabel('watering', 'watering schedule')}
                      >
                        Watering
                        <ChevronDown className={tableSortIconClass('watering')} aria-hidden />
                      </button>
                    </th>
                    <th
                      className="px-4 py-3 font-semibold"
                      aria-sort={
                        tableSortKey === 'fertilizer'
                          ? tableSortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left text-sm font-semibold hover:text-desert-ink"
                        onClick={() => toggleTableSort('fertilizer')}
                        aria-label={tableSortAriaLabel('fertilizer', 'fertilizer schedule')}
                      >
                        Fertilizer
                        <ChevronDown className={tableSortIconClass('fertilizer')} aria-hidden />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTablePlants.map((plant) => {
                    const showWaterDue = waterDueSoon(plant);
                    const fertU = fertilizerUrgency(plant);
                    const showFertStress = fertilizerDueSoonOrOverdue(plant);
                    const waterDueLabel = safeFormatDue(plant.last_watered, plant.watering_frequency_days);

                    return (
                      <tr key={plant.id} className="border-t border-desert-mist align-top">
                        <td className="px-4 py-3">
                          <Link href={`/plant/${plant.id}`} className="font-semibold text-oasis hover:underline">
                            {plant.name}
                          </Link>
                          <p className="mt-1 text-xs text-desert-dust">Sun: {sunExposureLabel(plant.sun_exposure)}</p>
                        </td>
                        <td className="px-4 py-3 text-desert-sage">
                          {plant.container_type} • {plant.pot_size}
                        </td>
                        <td className="px-4 py-3 text-desert-sage">
                          <p>{formatPlantCareInstant(plant.last_watered, 'card')}</p>
                          <p className={cn('mt-1 text-xs', showWaterDue ? 'font-medium text-orange-600 dark:text-orange-400' : 'text-desert-dust')}>
                            Due {waterDueLabel || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-desert-sage">
                          <p>Last: {safeFormatDay(plant.last_fertilized)}</p>
                          <p className={cn('mt-1 text-xs', showFertStress ? 'font-medium text-orange-600 dark:text-orange-400' : 'text-desert-dust')}>
                            Next: {formatNextFertilizationDue(plant)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {fertU === 'off_season' ? (
                              <Badge variant="secondary" className="text-xs font-normal">
                                Off-season
                              </Badge>
                            ) : null}
                            {fertU === 'overdue' ? (
                              <Badge className="bg-red-600 text-xs text-white hover:bg-red-600">Fertilize now</Badge>
                            ) : null}
                            {fertU === 'due_soon' ? (
                              <Badge className="bg-amber-600 text-xs text-white hover:bg-amber-600">Due soon</Badge>
                            ) : null}
                            {fertU === 'due_month' ? (
                              <Badge variant="outline" className="border-amber-600 text-xs text-amber-800 dark:text-amber-300">
                                Due this month
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => markWatered(plant.id, plant.name)}
                              disabled={isDemoMode || isPlantCareDateToday(plant.last_watered)}
                              className="rounded-full bg-oasis text-white hover:bg-oasis-hover"
                            >
                              <Droplet className="mr-1 h-4 w-4" /> Watered
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => markFertilized(plant.id, plant.name)}
                              disabled={isDemoMode || isPlantCareDateToday(plant.last_fertilized)}
                              className="rounded-full bg-amber-600 text-white hover:bg-amber-700"
                            >
                              <Sprout className="mr-1 h-4 w-4" /> Fertilized
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openEditModal(plant)}
                              disabled={isDemoMode}
                              className="border-desert-border"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="border-desert-border text-red-600"
                              onClick={() => deletePlant(plant.id, plant.name)}
                              disabled={isDemoMode}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : plantViewMode === 'grid' ? (
          <div className="mb-16 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredPlants.map((plant) => {
              const showWaterDue = waterDueSoon(plant);
              const showFertStress = fertilizerDueSoonOrOverdue(plant);

              return (
                <Card
                  key={plant.id}
                  className="overflow-hidden border border-desert-border bg-desert-parchment/95 shadow-sm"
                >
                  <CardContent className="space-y-2 p-3">
                    {plant.photo_url ? (
                      <Link
                        href={`/plant/${plant.id}`}
                        className="relative block h-20 overflow-hidden rounded-lg bg-desert-dune"
                        aria-label={`Open ${plant.name} profile`}
                      >
                        <Image
                          src={plant.photo_url}
                          alt={plant.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                          priority={false}
                          quality={70}
                        />
                      </Link>
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded-lg bg-desert-dune text-[11px] text-desert-dust">
                        No photo
                      </div>
                    )}
                    <Link
                      href={`/plant/${plant.id}`}
                      className="line-clamp-2 text-sm font-semibold leading-tight text-oasis hover:underline"
                    >
                      {plant.name}
                    </Link>
                    <p className="line-clamp-1 text-xs text-desert-dust">
                      {plant.container_type} • {plant.pot_size}
                    </p>
                    {plant.location_in_garden?.trim() ? (
                      <p className="line-clamp-1 text-[11px] text-desert-dust">
                        {plant.location_in_garden.trim()}
                      </p>
                    ) : null}
                    <div className="space-y-1 text-[11px]">
                      <p
                        className={cn(
                          showWaterDue
                            ? 'font-medium text-orange-600 dark:text-orange-400'
                            : 'text-desert-sage',
                        )}
                      >
                        Water due {safeFormatDue(plant.last_watered, plant.watering_frequency_days) || '—'}
                      </p>
                      <p
                        className={cn(
                          showFertStress
                            ? 'font-medium text-orange-600 dark:text-orange-400'
                            : 'text-desert-sage',
                        )}
                      >
                        Fert {formatNextFertilizationDue(plant)}
                      </p>
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <Button
                        size="sm"
                        onClick={() => markWatered(plant.id, plant.name)}
                        disabled={isDemoMode || isPlantCareDateToday(plant.last_watered)}
                        className="h-7 flex-1 rounded-full px-2 text-xs bg-oasis text-white hover:bg-oasis-hover"
                      >
                        <Droplet className="mr-1 h-3.5 w-3.5" />
                        Water
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => markFertilized(plant.id, plant.name)}
                        disabled={isDemoMode || isPlantCareDateToday(plant.last_fertilized)}
                        className="h-7 flex-1 rounded-full px-2 text-xs bg-amber-600 text-white hover:bg-amber-700"
                      >
                        <Sprout className="mr-1 h-3.5 w-3.5" />
                        Fert
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {filteredPlants.map((plant) => {
              const showWaterDue = waterDueSoon(plant);
              const fertU = fertilizerUrgency(plant);
              const showFertStress = fertilizerDueSoonOrOverdue(plant);

              return (
                <Card key={plant.id} className="relative bg-desert-parchment border border-desert-border rounded-3xl overflow-hidden shadow-sm">
                  <Link
                    href={`/plant/${plant.id}`}
                    className="absolute inset-0 z-0 rounded-3xl"
                    aria-label={`Open ${plant.name} profile`}
                    prefetch
                  />
                  <div className="relative z-10 pointer-events-none">
                    {plant.photo_url ? (
                      <div className="h-52 w-full overflow-hidden bg-desert-dune relative">
                        <Image
                          src={plant.photo_url}
                          alt={plant.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          priority={false}
                          quality={75}
                        />
                      </div>
                    ) : (
                      <div className="flex h-40 items-center justify-center bg-desert-dune text-sm text-desert-dust">
                        No homepage photo — open profile to add
                      </div>
                    )}
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="text-xl">{plant.name}</CardTitle>
                        <Badge className="bg-desert-ridge text-desert-sage shrink-0">
                          {plant.container_type} • {plant.pot_size}
                        </Badge>
                      </div>
                      <p className="text-xs text-desert-sage mt-1">
                        Sun: {sunExposureLabel(plant.sun_exposure)}
                      </p>
                      {plant.location_in_garden?.trim() ? (
                        <p className="mt-0.5 text-xs text-desert-dust">
                          {plant.location_in_garden.trim()}
                        </p>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="text-sm text-desert-sage space-y-1">
                        <p>Water: {formatPlantCareInstant(plant.last_watered, 'card')}
                           <span className={showWaterDue ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}>
                             → Due {safeFormatDue(plant.last_watered, plant.watering_frequency_days)}
                           </span>
                        </p>
                        <p>
                          Fertilizer: {safeFormatDay(plant.last_fertilized)}
                          <span
                            className={cn(
                              showFertStress ? 'text-orange-600 dark:text-orange-400 font-medium' : '',
                            )}
                          >
                            {' '}
                            → Next (in season): {formatNextFertilizationDue(plant)}
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {fertU === 'off_season' ? (
                            <Badge variant="secondary" className="text-xs font-normal">
                              Fertilizer off-season
                            </Badge>
                          ) : null}
                          {fertU === 'overdue' ? (
                            <Badge className="bg-red-600 text-white hover:bg-red-600 text-xs">Fertilize now</Badge>
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

                      <div className="flex gap-2 pointer-events-auto">
                        <Button onClick={() => markWatered(plant.id, plant.name)} disabled={isDemoMode || isPlantCareDateToday(plant.last_watered)} className="flex-1 bg-oasis hover:bg-oasis-hover text-white rounded-full">
                          <Droplet className="mr-2 h-4 w-4" /> Watered Today
                        </Button>
                        <Button onClick={() => markFertilized(plant.id, plant.name)} disabled={isDemoMode || isPlantCareDateToday(plant.last_fertilized)} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-full">
                          <Sprout className="mr-2 h-4 w-4" /> Fertilized Today
                        </Button>
                      </div>

                      <div className="flex gap-3 pointer-events-auto">
                        <Button variant="outline" size="icon" onClick={() => openEditModal(plant)} disabled={isDemoMode} className="border-desert-border">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="text-red-600 border-desert-border" onClick={() => deletePlant(plant.id, plant.name)} disabled={isDemoMode}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="bg-desert-parchment border border-desert-border rounded-3xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Recent Activity</CardTitle>
            <Button variant="destructive" size="sm" onClick={clearActivityLog} disabled={isDemoMode}>
              <Trash className="h-4 w-4 mr-1" /> Clear Log
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
              {activities.length === 0 ? (
                <p className="text-center py-8 text-desert-dust">No activity yet</p>
              ) : (
                activities.map((log) => {
                  const when = formatActivityWhen(log.created_at);
                  const rel = activityRelativeTime(log.created_at);
                  return (
                    <div
                      key={log.id}
                      className="border-b border-desert-mist py-3.5 last:border-0 last:pb-0 first:pt-0"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium text-desert-ink leading-snug">
                            {activityPrimaryLine(log)}
                          </p>
                          {log.details ? (
                            <p className="text-sm text-desert-sage leading-relaxed">
                              {log.details}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-left sm:max-w-[11rem] sm:text-right">
                          <time
                            dateTime={log.created_at}
                            title={when}
                            className="block text-xs font-medium text-desert-dust"
                          >
                            {when}
                          </time>
                          <span className="mt-0.5 block text-[11px] text-desert-dust/85">
                            {rel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
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
