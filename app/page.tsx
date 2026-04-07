'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import type { Plant } from '@/lib/plant-types';
import { normalizePlantRow } from '@/lib/plant-helpers';
import { uploadPlantImage, deletePlantImageFromStorage } from '@/lib/storage-upload';
import { GARDEN_AUTH_KEY, GARDEN_MODE_KEY } from '@/lib/garden-session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Droplet, Edit, Trash2, Sun, History, Moon, Sun as SunIcon, Trash, Lock, AlertTriangle, Image, Loader2, X, Sprout, RefreshCw } from 'lucide-react';
import { format, addDays, differenceInDays, isValid } from 'date-fns';
import { toast, Toaster } from 'sonner';

type Activity = {
  id: string;
  action: string;
  plant_name?: string;
  details?: string;
  created_at: string;
};

type NewPlantForm = {
  name: string;
  species: string;
  container_type: string;
  pot_size: string;
  watering_frequency_days: number | '';
  fertilizer_frequency_days: number | '';
  last_watered: string;
  last_fertilized: string;
  notes: string;
  location_in_garden: string;
  photo_url: string | null;
};

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

function waterDueSoon(plant: Plant): boolean {
  if (!plant.last_watered) return true;
  const freq = plant.watering_frequency_days || 7;
  const last = new Date(plant.last_watered);
  const due = addDays(last, freq);
  if (!isValid(last) || !isValid(due)) return true;
  return differenceInDays(due, new Date()) <= 2;
}

function fertDueSoon(plant: Plant): boolean {
  if (!plant.last_fertilized) return true;
  const freq = plant.fertilizer_frequency_days || 30;
  const last = new Date(plant.last_fertilized);
  const due = addDays(last, freq);
  if (!isValid(last) || !isValid(due)) return true;
  return differenceInDays(due, new Date()) <= 7;
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

  // Pull-to-refresh
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);

  const editPhotoBaselineRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [newPlant, setNewPlant] = useState<NewPlantForm>({
    name: '',
    species: '',
    container_type: 'Grow Bag',
    pot_size: '10 gallon',
    watering_frequency_days: 3,
    fertilizer_frequency_days: 30,
    last_watered: new Date().toISOString().split('T')[0],
    last_fertilized: new Date().toISOString().split('T')[0],
    notes: '',
    location_in_garden: '',
    photo_url: null,
  });

  const [editWaterDays, setEditWaterDays] = useState('');
  const [editFertDays, setEditFertDays] = useState('');
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);

  // ==================== REFRESH FUNCTIONS ====================
  const handleRefresh = async () => {
    if (isDemoMode) {
      toast.info("Demo mode — using static data");
      return;
    }
    setLoading(true);
    toast.loading("Refreshing garden...", { id: "refresh-toast" });

    try {
      await Promise.all([fetchPlants(), fetchActivities()]);
      toast.success("Garden refreshed! 🌵", { id: "refresh-toast" });
    } catch (err) {
      toast.error("Refresh failed", { id: "refresh-toast" });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY !== 0 || isDemoMode) return;
    setIsPulling(true);
    setPullDistance(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const touch = e.touches[0];
    const distance = Math.max(0, touch.clientY);
    setPullDistance(Math.min(distance * 0.6, 180));
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    setIsPulling(false);
    if (pullDistance > 120) {
      toast.loading("Refreshing...", { id: "pull-refresh" });
      await handleRefresh();
      toast.success("Garden refreshed!", { id: "pull-refresh" });
    }
    setPullDistance(0);
  };

  // ==================== AUTH & INITIAL LOAD ====================
  useEffect(() => {
    const savedDark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDark);
    if (savedDark) document.documentElement.classList.add('dark');

    if (localStorage.getItem(GARDEN_AUTH_KEY) === 'true') {
      setIsAuthenticated(true);
      if (localStorage.getItem(GARDEN_MODE_KEY) === 'demo') {
        setIsDemoMode(true);
        loadDemoPlants();
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
      { id: 'demo1', name: 'Demo Desert Rose', container_type: 'Pot', pot_size: '10gal', watering_frequency_days: 7, last_watered: '2026-04-01', fertilizer_frequency_days: 30, last_fertilized: '2026-03-15', photo_url: null },
      { id: 'demo2', name: 'Demo Saguaro', container_type: 'Grow Bag', pot_size: '10 gallon', watering_frequency_days: 14, last_watered: '2026-03-25', fertilizer_frequency_days: 60, last_fertilized: '2026-02-01', photo_url: null },
      { id: 'demo3', name: 'Demo Prickly Pear', container_type: 'Raised Bed', pot_size: 'Large', watering_frequency_days: 10, last_watered: '2026-04-03', fertilizer_frequency_days: 45, last_fertilized: '2026-03-20', photo_url: null },
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
    const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(25);
    setActivities(data || []);
  };

  useEffect(() => {
    if (isAuthenticated && !isDemoMode) {
      fetchPlants();
      fetchActivities();
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=33.3625&longitude=-112.1695' +
        '&current=temperature_2m,wind_speed_10m,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
        '&temperature_unit=fahrenheit&timezone=America/Phoenix';
      fetch(url)
        .then(res => res.json())
        .then((data) => {
          const current = data?.current;
          const daily = data?.daily;
          if (!current || !daily?.time?.length) return;
          let condition = "Sunny";
          if (current.weather_code >= 51) condition = "Rain";
          else if (current.weather_code >= 3) condition = "Cloudy";
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
        })
        .catch(() => console.error('Weather fetch failed'));
    }
  }, [isAuthenticated, isDemoMode]);

  const getWeatherCondition = (code: number): string => {
    if (code === 0) return "Sunny";
    if (code <= 3) return "Cloudy";
    if (code <= 48) return "Fog";
    if (code <= 67 || code <= 82) return "Rain";
    if (code <= 86) return "Snow";
    return "Cloudy";
  };

  const getWeatherIcon = (code: number): string => {
    if (code === 0) return "☀️";
    if (code <= 3) return "⛅";
    if (code <= 48) return "🌫️";
    if (code <= 67 || code <= 82) return "🌧️";
    if (code <= 86) return "❄️";
    return "☁️";
  };

  const isWriteDisabled = isDemoMode;

  const logActivity = async (action: string, plant_name?: string) => {
    if (isWriteDisabled) return;
    await supabase.from('activity_logs').insert([{ action, plant_name }]);
  };

  // ==================== PHOTO & FORM HANDLERS ====================
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
      return;
    }

    if (isEdit && editingPlant) {
      setEditingPlant({ ...editingPlant, photo_url: photoUrl });
      await logActivity('Photo Updated', editingPlant.name);
    } else {
      setNewPlant({ ...newPlant, photo_url: photoUrl });
    }
    toast.success('Photo uploaded successfully!');
  };

  const removePreview = (isEdit = false) => {
    if (isEdit) {
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
      setEditPreviewUrl(null);
      if (editingPlant) setEditingPlant({ ...editingPlant, photo_url: null });
    } else {
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
      setNewPreviewUrl(null);
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

  // ==================== ADD PLANT (with safe photo handling) ====================
  const addPlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) return;
    e.preventDefault();

    const waterDays = newPlant.watering_frequency_days === '' ? 3 : Math.max(1, Number(newPlant.watering_frequency_days));
    const fertDays = newPlant.fertilizer_frequency_days === '' ? 30 : Math.max(1, Number(newPlant.fertilizer_frequency_days));

    const row = { 
      ...newPlant, 
      watering_frequency_days: waterDays, 
      fertilizer_frequency_days: fertDays 
    };

    const { data: inserted, error } = await supabase.from('plants').insert([row]).select('id').single();

    if (error) {
      toast.error('Failed to add plant');
      console.error(error);
      return;
    }

    // Safe photo gallery insert
    if (inserted?.id && row.photo_url) {
      const { error: photoError } = await supabase.from('plant_photos').insert({
        plant_id: inserted.id,
        photo_url: row.photo_url,
      });
      if (photoError) {
        console.error('plant_photos insert failed:', photoError);
        toast.warning('Plant added, but photo timeline entry failed');
      }
    }

    await logActivity('Plant Added', newPlant.name);
    toast.success('Plant added successfully! 🌱');

    if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);

    setIsAddModalOpen(false);
    setNewPlant({
      name: '',
      species: '',
      container_type: 'Grow Bag',
      pot_size: '10 gallon',
      watering_frequency_days: 3,
      fertilizer_frequency_days: 30,
      last_watered: new Date().toISOString().split('T')[0],
      last_fertilized: new Date().toISOString().split('T')[0],
      notes: '',
      location_in_garden: '',
      photo_url: null,
    });
    setNewPreviewUrl(null);

    fetchPlants();
    fetchActivities();
  };

  // ==================== UPDATE PLANT (with safe photo handling) ====================
  const updatePlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) return;
    e.preventDefault();
    if (!editingPlant) return;

    const wf = Math.max(1, parseInt(editWaterDays, 10) || editingPlant.watering_frequency_days);
    const ff = Math.max(1, parseInt(editFertDays, 10) || editingPlant.fertilizer_frequency_days);

    const payload = { ...editingPlant, watering_frequency_days: wf, fertilizer_frequency_days: ff };

    const { error } = await supabase.from('plants').update(payload).eq('id', editingPlant.id);

    if (error) {
      toast.error('Failed to update plant');
      console.error(error);
      return;
    }

    // Safe photo gallery insert
    if (payload.photo_url && payload.photo_url !== editPhotoBaselineRef.current) {
      const { error: photoError } = await supabase.from('plant_photos').insert({
        plant_id: editingPlant.id,
        photo_url: payload.photo_url,
      });
      if (photoError) {
        console.error('plant_photos insert failed:', photoError);
        toast.warning('Plant updated, but new photo timeline entry failed');
      }
    }

    editPhotoBaselineRef.current = null;
    await logActivity('Plant Edited', editingPlant.name);
    toast.success('Plant updated successfully!');

    if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    setIsEditModalOpen(false);
    setEditingPlant(null);
    setEditPreviewUrl(null);
    fetchPlants();
    fetchActivities();
  };

  const markWatered = async (id: string, name: string) => { /* keep your original implementation */ };
  const markFertilized = async (id: string, name: string) => { /* keep your original */ };
  const deletePlant = async (id: string, name: string) => { /* keep your original */ };
  const openEditModal = (plant: Plant) => { /* keep your original */ };
  const clearActivityLog = async () => { /* keep your original */ };

  // ==================== RENDER ====================
  if (loading) return <div className="h-screen flex items-center justify-center bg-desert-page dark:bg-zinc-950">Loading Garden...</div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-desert-page dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-desert-parchment dark:bg-zinc-900 rounded-3xl shadow-xl shadow-desert-border/20 p-10 ring-1 ring-desert-border/30">
          <div className="flex justify-center mb-6"><Lock className="h-12 w-12 text-oasis dark:text-emerald-400" /></div>
          <h1 className="text-4xl font-bold text-center text-oasis dark:text-emerald-400 mb-2">Laveen Garden</h1>
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <Input 
              type="password" 
              value={enteredPassword} 
              onChange={(e) => setEnteredPassword(e.target.value)} 
              placeholder="demo (demo mode)" 
              required 
              className="text-lg py-6" 
            />
            <Button type="submit" className="w-full bg-oasis hover:bg-oasis-hover dark:bg-emerald-600 py-6 text-lg rounded-full">
              Enter Garden
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-desert-page text-desert-ink'}`}>
      <Toaster position="top-center" richColors />

      {isDemoMode && (
        <div className="bg-amber-950/90 text-amber-100 py-3 px-6 flex items-center justify-center gap-2 font-medium border-b border-amber-900/50">
          <AlertTriangle className="h-5 w-5" /> DEMO MODE — All changes are temporary
        </div>
      )}

      <header className="sticky top-0 z-50 bg-desert-parchment/95 dark:bg-zinc-900/95 backdrop-blur border-b border-desert-border dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🌵</span>
            <div className="font-bold text-3xl tracking-tighter text-oasis dark:text-emerald-400">Laveen Garden</div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {darkMode ? <SunIcon className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={loading || isDemoMode}>
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger>
                <Button className="bg-oasis hover:bg-oasis-hover dark:bg-emerald-600 rounded-full" disabled={isDemoMode}>
                  <Plus className="h-4 w-4 mr-1" /> New Plant
                </Button>
              </DialogTrigger>
              {/* Your full Add Plant Dialog content goes here - unchanged from your original */}
              {/* ... paste your original DialogContent for adding a plant ... */}
            </Dialog>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        className="max-w-7xl mx-auto px-6 py-10 relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to refresh indicator */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center transition-all duration-200 pointer-events-none"
          style={{ 
            top: pullDistance > 0 ? `${Math.min(pullDistance, 120)}px` : '-60px', 
            opacity: pullDistance > 60 ? 1 : 0 
          }}
        >
          <div className="bg-white/95 dark:bg-zinc-800/95 backdrop-blur shadow-md rounded-2xl px-6 py-2 flex items-center gap-3">
            <Loader2 className={`h-5 w-5 ${pullDistance > 120 ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium">
              {pullDistance > 120 ? 'Releasing to refresh...' : 'Pull down to refresh'}
            </span>
          </div>
        </div>

        {/* Paste the rest of your main content here: weather card, plants grid, activity log */}
        {/* (weather, plants.map, activity card - copy from your original code) */}

      </main>

      {/* Edit Dialog - paste your original edit dialog here */}
    </div>
  );
}
