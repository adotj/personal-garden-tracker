'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Droplet, Edit, Trash2, Sun, History, Moon, Sun as SunIcon, Trash, Lock, AlertTriangle, Image, Loader2, X, Sprout } from 'lucide-react';
import { format, addDays, differenceInDays } from 'date-fns';
import { toast, Toaster } from 'sonner';

type Plant = {
  id: string;
  name: string;
  species?: string;
  container_type: string;
  pot_size: string;
  watering_frequency_days: number;
  last_watered: string | null;
  fertilizer_frequency_days: number;
  last_fertilized: string | null;
  notes?: string;
  location_in_garden?: string;
  photo_url?: string | null;
};

type Activity = {
  id: string;
  action: string;
  plant_name?: string;
  details?: string;
  created_at: string;
};

const DEMO_PASSWORD = "demo";
const REAL_PASSWORD = "REMOVED_OLD_PASSWORD";

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
  const [weather, setWeather] = useState<any>(null);           // current + daily forecast
  const [darkMode, setDarkMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [newPlant, setNewPlant] = useState({
    name: '', species: '', container_type: 'Grow Bag', pot_size: '10 gallon',
    watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0],
    fertilizer_frequency_days: 30, last_fertilized: new Date().toISOString().split('T')[0],
    notes: '', location_in_garden: '', photo_url: null as string | null,
  });
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedDark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDark);
    if (savedDark) document.documentElement.classList.add('dark');

    if (localStorage.getItem('gardenAuthenticated') === 'true') setIsAuthenticated(true);
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
      localStorage.setItem('gardenAuthenticated', 'true');
      toast.success('Demo Mode Activated');
      loadDemoPlants();
    } else if (enteredPassword === REAL_PASSWORD) {
      setIsAuthenticated(true);
      setIsDemoMode(false);
      localStorage.setItem('gardenAuthenticated', 'true');
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
    localStorage.removeItem('gardenAuthenticated');
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
    const { data } = await supabase.from('plants').select('*').order('created_at', { ascending: false });
    setPlants(data || []);
  };

  const fetchActivities = async () => {
    const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(25);
    setActivities(data || []);
  };

  // Updated weather fetch with 3-day forecast
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
        .then(data => {
          const current = data.current;
          let condition = "Sunny";
          if (current.weather_code >= 51) condition = "Rain";
          else if (current.weather_code >= 3) condition = "Cloudy";

          const daily = data.daily;

          setWeather({
            temperature: Math.round(current.temperature_2m),
            condition,
            windSpeed: Math.round(current.wind_speed_10m),
            forecast: daily.time.slice(0, 3).map((date: string, i: number) => ({
              date: format(new Date(date), 'EEE'),
              high: Math.round(daily.temperature_2m_max[i]),
              low: Math.round(daily.temperature_2m_min[i]),
              code: daily.weather_code[i],
              condition: getWeatherCondition(daily.weather_code[i]),
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

  const isWriteDisabled = isDemoMode;

  const logActivity = async (action: string, plant_name?: string) => {
    if (isWriteDisabled) return;
    await supabase.from('activity_logs').insert([{ action, plant_name }]);
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    if (isWriteDisabled) return null;
    try {
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('plant-photos').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('plant-photos').getPublicUrl(fileName);
      return data.publicUrl;
    } catch {
      toast.error('Photo upload failed');
      return null;
    }
  };

  const deletePhoto = async (photoUrl: string | null) => {
    if (isWriteDisabled || !photoUrl) return;
    try {
      const fileName = photoUrl.split('/').pop() || '';
      await supabase.storage.from('plant-photos').remove([fileName]);
    } catch {}
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    if (isWriteDisabled) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    if (isEdit) setEditPreviewUrl(previewUrl);
    else setNewPreviewUrl(previewUrl);

    setIsUploading(true);
    const photoUrl = await uploadPhoto(file);
    setIsUploading(false);

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
    const { error } = await supabase.from('plants').insert([newPlant]);
    if (error) toast.error('Failed to add plant');
    else {
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
    const { error } = await supabase.from('plants').update(editingPlant).eq('id', editingPlant.id);
    if (error) toast.error('Failed to update plant');
    else {
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
    fetchPlants();
    fetchActivities();
  };

  const markFertilized = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('plants').update({ last_fertilized: today }).eq('id', id);
    await logActivity('Plant Fertilized', name);
    toast.success(`🌱 ${name} fertilized today!`);
    fetchPlants();
    fetchActivities();
  };

  const deletePlant = async (id: string, name: string) => {
    if (isWriteDisabled) return;
    if (!confirm(`Delete ${name} and its photo?`)) return;
    const plantToDelete = plants.find(p => p.id === id);
    if (plantToDelete?.photo_url) await deletePhoto(plantToDelete.photo_url);
    const { error } = await supabase.from('plants').delete().eq('id', id);
    if (error) toast.error('Failed to delete plant');
    else {
      await logActivity('Plant Deleted', name);
      toast.success(`${name} and its photo deleted`);
      fetchPlants();
      fetchActivities();
    }
  };

  const openEditModal = (plant: Plant) => {
    if (isWriteDisabled) return;
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#fcf9f4] dark:bg-zinc-950">Loading Garden...</div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#fcf9f4] dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-xl p-10">
          <div className="flex justify-center mb-6"><Lock className="h-12 w-12 text-[#004c22] dark:text-emerald-400" /></div>
          <h1 className="text-4xl font-bold text-center text-[#004c22] dark:text-emerald-400 mb-2">Laveen Garden</h1>
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <Input type="password" value={enteredPassword} onChange={(e) => setEnteredPassword(e.target.value)} placeholder="demo (demo mode)" required className="text-lg py-6" />
            <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 py-6 text-lg rounded-full">Enter Garden</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-[#fcf9f4] text-[#1c1c19]'}`}>
      <Toaster position="top-center" richColors />

      {isDemoMode && (
        <div className="bg-orange-500 text-white py-3 px-6 flex items-center justify-center gap-2 font-medium">
          <AlertTriangle className="h-5 w-5" /> DEMO MODE — All changes are temporary
        </div>
      )}

      <header className="sticky top-0 z-50 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-b border-[#e5e2dd] dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🌵</span>
            <div className="font-bold text-3xl tracking-tighter text-[#004c22] dark:text-emerald-400">Laveen Garden</div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {darkMode ? <SunIcon className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger>
                <Button className="bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 rounded-full" disabled={isDemoMode}>
                  <Plus className="h-4 w-4 mr-1" /> New Plant
                </Button>
              </DialogTrigger>
              {/* Add modal remains the same as previous version with fertilizer fields and photo preview */}
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#004c22] dark:text-emerald-400">Add New Plant</DialogTitle>
                </DialogHeader>
                <form onSubmit={addPlant} className="space-y-5">
                  {/* ... same fields as before including fertilizer ... */}
                  {/* (omitted for brevity - copy from previous full file if needed) */}
                  <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 rounded-full py-3" disabled={isDemoMode || isUploading}>
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
          <div className="mb-12 bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-[#e5e2dd] dark:border-zinc-800 shadow-sm">
            <div className="flex items-center gap-8 mb-8">
              <Sun className="h-12 w-12 text-amber-500" />
              <div>
                <div className="text-7xl font-light">{weather.temperature}°F</div>
                <div className="text-2xl text-[#707a6f] dark:text-zinc-400">{weather.condition}</div>
              </div>
              <div className="text-sm text-[#707a6f] dark:text-zinc-400">
                Wind: {weather.windSpeed} mph
              </div>
            </div>

            {/* 3-Day Forecast */}
            <div className="grid grid-cols-3 gap-4">
              {weather.forecast?.map((day: any, index: number) => (
                <div key={index} className="text-center bg-[#f8f6f2] dark:bg-zinc-800 rounded-2xl p-4">
                  <div className="font-medium text-sm mb-1">{day.date}</div>
                  <div className="text-3xl font-light mb-1">{day.high}°</div>
                  <div className="text-sm text-[#707a6f] dark:text-zinc-400">{day.low}°</div>
                  <div className="text-xs mt-2 text-[#707a6f] dark:text-zinc-400">{day.condition}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rest of your plant grid, activity log, and modals remain the same as the previous fertilizer version */}

        {/* (Plant cards with water + fertilizer buttons, edit/delete, etc.) */}
      </main>

      {/* Edit modal also updated with fertilizer fields - same as previous version */}

    </div>
  );
}
