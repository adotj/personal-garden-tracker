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
import { Plus, Droplet, Edit, Trash2, Sun, History, Moon, Sun as SunIcon, Trash, Lock, AlertTriangle, Image, Loader2, X, Sprout } from 'lucide-react';
import { format, addDays, differenceInDays, isValid } from 'date-fns';
import { toast, Toaster } from 'sonner';

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
  const editPhotoBaselineRef = useRef<string | null>(null);

  const [newPlant, setNewPlant] = useState<NewPlantForm>({
    name: '', species: '', container_type: 'Grow Bag', pot_size: '10 gallon',
    watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0],
    fertilizer_frequency_days: 30, last_fertilized: new Date().toISOString().split('T')[0],
    notes: '', location_in_garden: '', photo_url: null as string | null,
  });
  const [editWaterDays, setEditWaterDays] = useState('');
  const [editFertDays, setEditFertDays] = useState('');
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);

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

    if (photoUrl) {
      if (isEdit && editingPlant) {
        setEditingPlant({ ...editingPlant, photo_url: photoUrl });
        await logActivity('Photo Updated', editingPlant.name);
      } else {
        setNewPlant({ ...newPlant, photo_url: photoUrl });
      }
      toast.success('Photo uploaded successfully!');
    }
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

  const addPlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) return;
    e.preventDefault();
    const waterDays =
      newPlant.watering_frequency_days === ''
        ? 3
        : Math.max(1, Number(newPlant.watering_frequency_days));
    const fertDays =
      newPlant.fertilizer_frequency_days === ''
        ? 30
        : Math.max(1, Number(newPlant.fertilizer_frequency_days));
    const row = { ...newPlant, watering_frequency_days: waterDays, fertilizer_frequency_days: fertDays };
    const { data: inserted, error } = await supabase.from('plants').insert([row]).select('id').single();
    if (error) toast.error('Failed to add plant');
    else {
      if (inserted?.id && row.photo_url) {
        const { error: gErr } = await supabase.from('plant_photos').insert({ plant_id: inserted.id, photo_url: row.photo_url });
        if (gErr) console.error('plant_photos insert:', gErr);
      }
      await logActivity('Plant Added', newPlant.name);
      toast.success('Plant added successfully! 🌱');
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
      setIsAddModalOpen(false);
      setNewPlant({ name: '', species: '', container_type: 'Grow Bag', pot_size: '10 gallon', watering_frequency_days: 3, fertilizer_frequency_days: 30, last_watered: new Date().toISOString().split('T')[0], last_fertilized: new Date().toISOString().split('T')[0], notes: '', location_in_garden: '', photo_url: null });
      setNewPreviewUrl(null);
      fetchPlants();
      fetchActivities();
    }
  };

  const updatePlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) return;
    e.preventDefault();
    if (!editingPlant) return;
    const baseline = editPhotoBaselineRef.current;
    const wf = Math.max(1, parseInt(editWaterDays, 10) || editingPlant.watering_frequency_days);
    const ff = Math.max(1, parseInt(editFertDays, 10) || editingPlant.fertilizer_frequency_days);
    const payload = { ...editingPlant, watering_frequency_days: wf, fertilizer_frequency_days: ff };
    const { error } = await supabase.from('plants').update(payload).eq('id', editingPlant.id);
    if (error) toast.error('Failed to update plant');
    else {
      if (
        payload.photo_url &&
        payload.photo_url !== baseline
      ) {
        const { error: gErr } = await supabase.from('plant_photos').insert({
          plant_id: editingPlant.id,
          photo_url: payload.photo_url,
        });
        if (gErr) console.error('plant_photos insert:', gErr);
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
    }
  };

  const markWatered = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('plants').update({ last_watered: today }).eq('id', id);
    await logActivity('Plant Watered', name);
    toast.success(`✅ ${name} watered today!`);
    fetchPlants();        // ← Refresh to show updated date
    fetchActivities();
  };

  const markFertilized = async (id: string, name: string) => {
    if (isWriteDisabled) return;

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
      await logActivity('Plant Deleted', name);
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-desert-page dark:bg-zinc-950">Loading Garden...</div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-desert-page dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-desert-parchment dark:bg-zinc-900 rounded-3xl shadow-xl shadow-desert-border/20 p-10 ring-1 ring-desert-border/30">
          <div className="flex justify-center mb-6"><Lock className="h-12 w-12 text-oasis dark:text-emerald-400" /></div>
          <h1 className="text-4xl font-bold text-center text-oasis dark:text-emerald-400 mb-2">Laveen Garden</h1>
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <Input type="password" value={enteredPassword} onChange={(e) => setEnteredPassword(e.target.value)} placeholder="demo (demo mode)" required className="text-lg py-6" />
            <Button type="submit" className="w-full bg-oasis hover:bg-oasis-hover dark:bg-emerald-600 py-6 text-lg rounded-full">Enter Garden</Button>
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
            <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger>
                <Button className="bg-oasis hover:bg-oasis-hover dark:bg-emerald-600 rounded-full" disabled={isDemoMode}>
                  <Plus className="h-4 w-4 mr-1" /> New Plant
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-oasis dark:text-emerald-400">Add New Plant</DialogTitle>
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
                  <div>
                    <Label>Homepage photo (optional)</Label>
                    <p className="text-xs text-desert-dust dark:text-zinc-500 mb-2">Shown on the garden grid; add more on the plant profile.</p>
                    <Button type="button" variant="outline" className="w-full flex items-center justify-center gap-2 py-6" onClick={() => triggerFileInput(false)} disabled={isDemoMode || isUploading}>
                      {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Image className="h-5 w-5" />}
                      {isUploading ? 'Uploading Photo...' : 'Choose Photo'}
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e)} className="hidden" />

                    {newPreviewUrl && (
                      <div className="mt-4 relative">
                        <img src={newPreviewUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-xl border border-desert-border dark:border-zinc-700" />
                        <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => removePreview(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Button type="submit" className="w-full bg-oasis hover:bg-oasis-hover dark:bg-emerald-600 rounded-full py-3" disabled={isDemoMode || isUploading}>
                    {isUploading ? 'Uploading Photo...' : 'Add to Garden'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {weather && (
          <div className="mb-12 bg-desert-parchment dark:bg-zinc-900 rounded-3xl p-8 border border-desert-border dark:border-zinc-800 shadow-sm">
            <div className="flex items-center gap-8 mb-8">
              <Sun className="h-12 w-12 text-amber-500" />
              <div>
                <div className="text-7xl font-light">{weather.temperature}°F</div>
                <div className="text-2xl text-desert-dust dark:text-zinc-400">{weather.condition}</div>
              </div>
              <div className="text-sm text-desert-dust dark:text-zinc-400">
                Wind: {weather.windSpeed} mph
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {weather.forecast?.map((day: any, index: number) => (
                <div key={index} className="text-center bg-desert-dune dark:bg-zinc-800 rounded-2xl p-5 border border-desert-mist dark:border-zinc-700">
                  <div className="font-medium text-sm mb-2">{day.date}</div>
                  <div className="text-4xl mb-3">{day.icon}</div>
                  <div className="text-3xl font-light mb-1">{day.high}°</div>
                  <div className="text-sm text-desert-dust dark:text-zinc-400">{day.low}°</div>
                  <div className="text-xs mt-2 text-desert-dust dark:text-zinc-400">{day.condition}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {plants.map((plant) => {
            const showWaterDue = waterDueSoon(plant);
            const showFertDue = fertDueSoon(plant);

            return (
              <Card key={plant.id} className="relative bg-desert-parchment dark:bg-zinc-900 border border-desert-border dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                <Link
                  href={`/plant/${plant.id}`}
                  className="absolute inset-0 z-0 rounded-3xl"
                  aria-label={`Open ${plant.name} profile`}
                  prefetch
                />
                <div className="relative z-10 pointer-events-none">
                  {plant.photo_url ? (
                    <div className="h-52 w-full overflow-hidden bg-desert-dune dark:bg-zinc-800">
                      <img src={plant.photo_url} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-desert-dune text-sm text-desert-dust dark:bg-zinc-800 dark:text-zinc-500">
                      No homepage photo — open profile to add
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-xl">{plant.name}</CardTitle>
                      <Badge className="bg-desert-ridge dark:bg-zinc-800 text-desert-sage dark:text-zinc-300 shrink-0">
                        {plant.container_type} • {plant.pot_size}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="text-sm text-desert-sage dark:text-zinc-400 space-y-1">
                      <p>Water: {safeFormatDay(plant.last_watered)} 
                         <span className={showWaterDue ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}>
                           → Due {safeFormatDue(plant.last_watered, plant.watering_frequency_days)}
                         </span>
                      </p>
                      <p>Fertilizer: {safeFormatDay(plant.last_fertilized)} 
                         <span className={showFertDue ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}>
                           → Due {safeFormatDue(plant.last_fertilized, plant.fertilizer_frequency_days)}
                         </span>
                      </p>
                    </div>

                    <div className="flex gap-2 pointer-events-auto">
                      <Button onClick={() => markWatered(plant.id, plant.name)} disabled={isDemoMode} className="flex-1 bg-oasis hover:bg-oasis-hover dark:bg-emerald-600 text-white rounded-full">
                        <Droplet className="mr-2 h-4 w-4" /> Watered Today
                      </Button>
                      <Button onClick={() => markFertilized(plant.id, plant.name)} disabled={isDemoMode} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-full">
                        <Sprout className="mr-2 h-4 w-4" /> Fertilized Today
                      </Button>
                    </div>

                    <div className="flex gap-3 pointer-events-auto">
                      <Button variant="outline" size="icon" onClick={() => openEditModal(plant)} disabled={isDemoMode} className="border-desert-border dark:border-zinc-700">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="text-red-600 border-desert-border dark:border-zinc-700" onClick={() => deletePlant(plant.id, plant.name)} disabled={isDemoMode}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="bg-desert-parchment dark:bg-zinc-900 border border-desert-border dark:border-zinc-800 rounded-3xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Recent Activity</CardTitle>
            <Button variant="destructive" size="sm" onClick={clearActivityLog} disabled={isDemoMode}>
              <Trash className="h-4 w-4 mr-1" /> Clear Log
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activities.length === 0 ? (
                <p className="text-center py-8 text-desert-dust dark:text-zinc-400">No activity yet</p>
              ) : (
                activities.map((log) => (
                  <div key={log.id} className="flex justify-between text-sm border-b border-desert-mist dark:border-zinc-800 pb-3 last:border-0">
                    <div>
                      <span className="font-medium">{log.action}</span>
                      {log.plant_name && <span className="ml-2 text-oasis dark:text-emerald-400">— {log.plant_name}</span>}
                    </div>
                    <span className="text-xs text-desert-dust dark:text-zinc-500">{format(new Date(log.created_at), 'MMM d, h:mm a')}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-oasis dark:text-emerald-400">Edit Plant</DialogTitle>
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
              <div>
                <Label>Homepage photo</Label>
                <p className="text-xs text-desert-dust dark:text-zinc-500 mb-2">Replaces the card image; previous shots stay in the profile timeline when you save.</p>
                <Button type="button" variant="outline" className="w-full flex items-center justify-center gap-2 py-6" onClick={() => triggerFileInput(true)} disabled={isDemoMode || isUploading}>
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Image className="h-5 w-5" />}
                  {isUploading ? 'Uploading Photo...' : 'Choose New Photo'}
                </Button>
                <input ref={editFileInputRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, true)} className="hidden" />

                {editPreviewUrl && (
                  <div className="mt-4 relative">
                    <img src={editPreviewUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-xl border border-desert-border dark:border-zinc-700" />
                    <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => removePreview(true)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full bg-oasis hover:bg-oasis-hover dark:bg-emerald-600 rounded-full py-3" disabled={isDemoMode || isUploading}>
                {isUploading ? 'Uploading Photo...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
