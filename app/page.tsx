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

// ─── Color tokens (light mode) ────────────────────────────────────────────────
// bg-page      : #e4ddd2   warm sand
// bg-surface   : #ede7db   parchment card
// bg-header    : #ddd7cb   slightly darker header
// bg-inset     : #d8d2c5   forecast/badge backgrounds
// border       : #c9c3b5   muted warm border
// text-primary : #25241c   near-black warm
// text-muted   : #6b6559   warm taupe
// green-primary: #2d5c3e   deep sage green
// green-hover  : #1a3d29
// ─────────────────────────────────────────────────────────────────────────────

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
  const [weather, setWeather] = useState<any>(null);
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
        ? '10 gallon' : editingPlant.pot_size;
      setEditingPlant({ ...editingPlant, container_type: safeValue, pot_size: newSize });
    } else {
      const newSize = safeValue === 'Grow Bag' && !['3 gallon', '5 gallon', '10 gallon', '20 gallon'].includes(newPlant.pot_size)
        ? '10 gallon' : newPlant.pot_size;
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
      toast.success(`${name} deleted`);
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

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#e4ddd2] dark:bg-zinc-950 text-[#25241c] dark:text-white">
      Loading Garden...
    </div>
  );

  // ─── Login screen ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#e4ddd2] dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#ede7db] dark:bg-zinc-900 rounded-3xl shadow-lg border border-[#c9c3b5] dark:border-zinc-800 p-10">
          <div className="flex justify-center mb-6">
            <Lock className="h-12 w-12 text-[#2d5c3e] dark:text-emerald-400" />
          </div>
          <h1 className="text-4xl font-bold text-center text-[#2d5c3e] dark:text-emerald-400 mb-2">Laveen Garden</h1>
          <p className="text-center text-[#6b6559] dark:text-zinc-400 mb-8 text-sm">Private Garden Tracker</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <Input
              type="password"
              value={enteredPassword}
              onChange={(e) => setEnteredPassword(e.target.value)}
              placeholder="Enter password (try: demo)"
              required
              className="text-lg py-6 bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700 placeholder:text-[#9a9186]"
            />
            <Button
              type="submit"
              className="w-full bg-[#2d5c3e] hover:bg-[#1a3d29] dark:bg-emerald-600 py-6 text-lg rounded-full text-white"
            >
              Enter Garden
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Main app ──────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-[#e4ddd2] text-[#25241c]'}`}>
      <Toaster position="top-center" richColors />

      {/* Demo banner */}
      {isDemoMode && (
        <div className="bg-amber-700 text-amber-50 py-3 px-6 flex items-center justify-center gap-2 font-medium text-sm">
          <AlertTriangle className="h-4 w-4" /> DEMO MODE — All changes are temporary
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#ddd7cb]/95 dark:bg-zinc-900/95 backdrop-blur border-b border-[#c9c3b5] dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🌵</span>
            <div>
              <div className="font-bold text-3xl tracking-tighter text-[#2d5c3e] dark:text-emerald-400">Laveen Garden</div>
              <div className="text-xs text-[#6b6559] dark:text-zinc-500 -mt-0.5">Sonoran Desert</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDarkMode}
              className="text-[#6b6559] hover:text-[#25241c] hover:bg-[#ccc6b8] dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {darkMode ? <SunIcon className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-[#c9c3b5] dark:border-zinc-700 text-[#25241c] dark:text-zinc-200 hover:bg-[#ccc6b8] dark:hover:bg-zinc-800"
            >
              Logout
            </Button>

            {/* Add Plant Modal */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger>
                <Button
                  className="bg-[#2d5c3e] hover:bg-[#1a3d29] dark:bg-emerald-600 rounded-full text-white"
                  disabled={isDemoMode}
                >
                  <Plus className="h-4 w-4 mr-1" /> New Plant
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-[#ede7db] dark:bg-zinc-900 border-[#c9c3b5] dark:border-zinc-800">
                <DialogHeader>
                  <DialogTitle className="text-[#2d5c3e] dark:text-emerald-400">Add New Plant</DialogTitle>
                </DialogHeader>
                <form onSubmit={addPlant} className="space-y-5">
                  <div>
                    <Label className="text-[#25241c] dark:text-zinc-200">Plant Name</Label>
                    <Input
                      required
                      value={newPlant.name}
                      onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })}
                      className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[#25241c] dark:text-zinc-200">Container Type</Label>
                      <Select value={newPlant.container_type} onValueChange={(v) => handleContainerTypeChange(v)}>
                        <SelectTrigger className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Grow Bag">Grow Bag</SelectItem>
                          <SelectItem value="Pot">Pot</SelectItem>
                          <SelectItem value="Raised Bed">Raised Bed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[#25241c] dark:text-zinc-200">Size</Label>
                      {newPlant.container_type === 'Grow Bag' ? (
                        <Select value={newPlant.pot_size} onValueChange={(v) => setNewPlant({ ...newPlant, pot_size: v || '10 gallon' })}>
                          <SelectTrigger className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3 gallon">3 gallon</SelectItem>
                            <SelectItem value="5 gallon">5 gallon</SelectItem>
                            <SelectItem value="10 gallon">10 gallon</SelectItem>
                            <SelectItem value="20 gallon">20 gallon</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          required
                          value={newPlant.pot_size}
                          onChange={(e) => setNewPlant({ ...newPlant, pot_size: e.target.value })}
                          className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                        />
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[#25241c] dark:text-zinc-200">Water every (days)</Label>
                      <Input
                        type="number" min="1" required
                        value={newPlant.watering_frequency_days}
                        onChange={(e) => setNewPlant({ ...newPlant, watering_frequency_days: parseInt(e.target.value) || 3 })}
                        className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                      />
                    </div>
                    <div>
                      <Label className="text-[#25241c] dark:text-zinc-200">Fertilize every (days)</Label>
                      <Input
                        type="number" min="1" required
                        value={newPlant.fertilizer_frequency_days}
                        onChange={(e) => setNewPlant({ ...newPlant, fertilizer_frequency_days: parseInt(e.target.value) || 30 })}
                        className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[#25241c] dark:text-zinc-200">Plant Photo (optional)</Label>
                    <Button
                      type="button" variant="outline"
                      className="w-full flex items-center justify-center gap-2 py-6 border-[#c9c3b5] dark:border-zinc-700 bg-[#ddd7cb] dark:bg-zinc-800 hover:bg-[#ccc6b8] dark:hover:bg-zinc-700 text-[#25241c] dark:text-zinc-200"
                      onClick={() => triggerFileInput(false)}
                      disabled={isDemoMode || isUploading}
                    >
                      {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Image className="h-5 w-5" />}
                      {isUploading ? 'Uploading Photo...' : 'Choose Photo'}
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e)} className="hidden" />
                    {newPreviewUrl && (
                      <div className="mt-4 relative">
                        <img src={newPreviewUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-xl border border-[#c9c3b5] dark:border-zinc-700" />
                        <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => removePreview(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#2d5c3e] hover:bg-[#1a3d29] dark:bg-emerald-600 rounded-full py-3 text-white"
                    disabled={isDemoMode || isUploading}
                  >
                    {isUploading ? 'Uploading Photo...' : 'Add to Garden'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">

        {/* Weather widget */}
        {weather && (
          <div className="mb-12 bg-[#ede7db] dark:bg-zinc-900 rounded-3xl p-8 border border-[#c9c3b5] dark:border-zinc-800 shadow-sm">
            <div className="flex items-center gap-8 mb-8">
              <Sun className="h-12 w-12 text-amber-600" />
              <div>
                <div className="text-7xl font-light text-[#25241c] dark:text-white">{weather.temperature}°F</div>
                <div className="text-xl text-[#6b6559] dark:text-zinc-400">{weather.condition}</div>
              </div>
              <div className="text-sm text-[#6b6559] dark:text-zinc-400">
                Wind: {weather.windSpeed} mph
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {weather.forecast?.map((day: any, index: number) => (
                <div
                  key={index}
                  className="text-center bg-[#d8d2c5] dark:bg-zinc-800 rounded-2xl p-5 border border-[#c9c3b5] dark:border-zinc-700"
                >
                  <div className="font-medium text-sm mb-2 text-[#25241c] dark:text-zinc-200">{day.date}</div>
                  <div className="text-4xl mb-3">{day.icon}</div>
                  <div className="text-3xl font-light mb-1 text-[#25241c] dark:text-white">{day.high}°</div>
                  <div className="text-sm text-[#6b6559] dark:text-zinc-400">{day.low}°</div>
                  <div className="text-xs mt-2 text-[#6b6559] dark:text-zinc-400">{day.condition}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plant grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {plants.map((plant) => {
            const waterDueSoon = !plant.last_watered ||
              differenceInDays(addDays(new Date(plant.last_watered), plant.watering_frequency_days), new Date()) <= 2;
            const fertDueSoon = !plant.last_fertilized ||
              differenceInDays(addDays(new Date(plant.last_fertilized), plant.fertilizer_frequency_days), new Date()) <= 7;
            return (
              <Card
                key={plant.id}
                className="bg-[#ede7db] dark:bg-zinc-900 border border-[#c9c3b5] dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {plant.photo_url && (
                  <div className="h-52 bg-[#d8d2c5] dark:bg-zinc-800">
                    <img src={plant.photo_url} alt={plant.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl text-[#25241c] dark:text-white">{plant.name}</CardTitle>
                    <Badge className="bg-[#d8d2c5] dark:bg-zinc-800 text-[#4a473e] dark:text-zinc-300 border-0 text-xs">
                      {plant.container_type} · {plant.pot_size}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="text-sm text-[#4a473e] dark:text-zinc-400 space-y-1.5">
                    <p>
                      <span className="text-[#6b6559] dark:text-zinc-500">Water: </span>
                      {plant.last_watered ? format(new Date(plant.last_watered), 'MMM d') : 'Never'}
                      <span className={`ml-1 ${waterDueSoon ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-[#6b6559] dark:text-zinc-500'}`}>
                        → Due {plant.last_watered ? format(addDays(new Date(plant.last_watered), plant.watering_frequency_days), 'MMM d') : ''}
                      </span>
                    </p>
                    <p>
                      <span className="text-[#6b6559] dark:text-zinc-500">Fertilizer: </span>
                      {plant.last_fertilized ? format(new Date(plant.last_fertilized), 'MMM d') : 'Never'}
                      <span className={`ml-1 ${fertDueSoon ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-[#6b6559] dark:text-zinc-500'}`}>
                        → Due {plant.last_fertilized ? format(addDays(new Date(plant.last_fertilized), plant.fertilizer_frequency_days), 'MMM d') : ''}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => markWatered(plant.id, plant.name)}
                      disabled={isDemoMode}
                      className="flex-1 bg-[#2d5c3e] hover:bg-[#1a3d29] dark:bg-emerald-600 text-white rounded-full text-sm"
                    >
                      <Droplet className="mr-1.5 h-4 w-4" /> Watered
                    </Button>
                    <Button
                      onClick={() => markFertilized(plant.id, plant.name)}
                      disabled={isDemoMode}
                      className="flex-1 bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-full text-sm"
                    >
                      <Sprout className="mr-1.5 h-4 w-4" /> Fertilized
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEditModal(plant)}
                      disabled={isDemoMode}
                      className="border-[#c9c3b5] dark:border-zinc-700 hover:bg-[#d8d2c5] dark:hover:bg-zinc-800 text-[#25241c] dark:text-zinc-200"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-red-700 dark:text-red-400 border-[#c9c3b5] dark:border-zinc-700 hover:bg-[#d8d2c5] dark:hover:bg-zinc-800"
                      onClick={() => deletePlant(plant.id, plant.name)}
                      disabled={isDemoMode}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Activity log */}
        <Card className="bg-[#ede7db] dark:bg-zinc-900 border border-[#c9c3b5] dark:border-zinc-800 rounded-3xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-[#25241c] dark:text-white">
              <History className="h-5 w-5" /> Recent Activity
            </CardTitle>
            <Button
              variant="destructive"
              size="sm"
              onClick={clearActivityLog}
              disabled={isDemoMode}
              className="bg-red-700 hover:bg-red-800 dark:bg-red-700"
            >
              <Trash className="h-4 w-4 mr-1" /> Clear Log
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activities.length === 0 ? (
                <p className="text-center py-8 text-[#6b6559] dark:text-zinc-400">No activity yet</p>
              ) : (
                activities.map((log) => (
                  <div
                    key={log.id}
                    className="flex justify-between text-sm border-b border-[#ccc6b8] dark:border-zinc-800 pb-3 last:border-0"
                  >
                    <div>
                      <span className="font-medium text-[#25241c] dark:text-zinc-200">{log.action}</span>
                      {log.plant_name && (
                        <span className="ml-2 text-[#2d5c3e] dark:text-emerald-400">— {log.plant_name}</span>
                      )}
                    </div>
                    <span className="text-xs text-[#6b6559] dark:text-zinc-500 whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md bg-[#ede7db] dark:bg-zinc-900 border-[#c9c3b5] dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-[#2d5c3e] dark:text-emerald-400">Edit Plant</DialogTitle>
          </DialogHeader>
          {editingPlant && (
            <form onSubmit={updatePlant} className="space-y-5">
              <div>
                <Label className="text-[#25241c] dark:text-zinc-200">Plant Name</Label>
                <Input
                  value={editingPlant.name}
                  onChange={(e) => setEditingPlant({ ...editingPlant, name: e.target.value })}
                  className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[#25241c] dark:text-zinc-200">Container Type</Label>
                  <Select value={editingPlant.container_type} onValueChange={(v) => handleContainerTypeChange(v, true)}>
                    <SelectTrigger className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Grow Bag">Grow Bag</SelectItem>
                      <SelectItem value="Pot">Pot</SelectItem>
                      <SelectItem value="Raised Bed">Raised Bed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[#25241c] dark:text-zinc-200">Size</Label>
                  {editingPlant.container_type === 'Grow Bag' ? (
                    <Select value={editingPlant.pot_size} onValueChange={(v) => setEditingPlant({ ...editingPlant, pot_size: v || '10 gallon' })}>
                      <SelectTrigger className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3 gallon">3 gallon</SelectItem>
                        <SelectItem value="5 gallon">5 gallon</SelectItem>
                        <SelectItem value="10 gallon">10 gallon</SelectItem>
                        <SelectItem value="20 gallon">20 gallon</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={editingPlant.pot_size}
                      onChange={(e) => setEditingPlant({ ...editingPlant, pot_size: e.target.value })}
                      className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[#25241c] dark:text-zinc-200">Water every (days)</Label>
                  <Input
                    type="number" min="1"
                    value={editingPlant.watering_frequency_days}
                    onChange={(e) => setEditingPlant({ ...editingPlant, watering_frequency_days: parseInt(e.target.value) || 3 })}
                    className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                  />
                </div>
                <div>
                  <Label className="text-[#25241c] dark:text-zinc-200">Fertilize every (days)</Label>
                  <Input
                    type="number" min="1"
                    value={editingPlant.fertilizer_frequency_days}
                    onChange={(e) => setEditingPlant({ ...editingPlant, fertilizer_frequency_days: parseInt(e.target.value) || 30 })}
                    className="bg-[#ddd7cb] dark:bg-zinc-800 border-[#c9c3b5] dark:border-zinc-700"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[#25241c] dark:text-zinc-200">Update Photo</Label>
                <Button
                  type="button" variant="outline"
                  className="w-full flex items-center justify-center gap-2 py-6 border-[#c9c3b5] dark:border-zinc-700 bg-[#ddd7cb] dark:bg-zinc-800 hover:bg-[#ccc6b8] dark:hover:bg-zinc-700 text-[#25241c] dark:text-zinc-200"
                  onClick={() => triggerFileInput(true)}
                  disabled={isDemoMode || isUploading}
                >
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Image className="h-5 w-5" />}
                  {isUploading ? 'Uploading Photo...' : 'Choose New Photo'}
                </Button>
                <input ref={editFileInputRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, true)} className="hidden" />
                {editPreviewUrl && (
                  <div className="mt-4 relative">
                    <img src={editPreviewUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-xl border border-[#c9c3b5] dark:border-zinc-700" />
                    <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => removePreview(true)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-[#2d5c3e] hover:bg-[#1a3d29] dark:bg-emerald-600 rounded-full py-3 text-white"
                disabled={isDemoMode || isUploading}
              >
                {isUploading ? 'Uploading Photo...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

