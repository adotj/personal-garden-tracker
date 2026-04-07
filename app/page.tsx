'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Droplet, Edit, Trash2, Sun, History, Moon, Sun as SunIcon, Trash, Lock, AlertTriangle } from 'lucide-react';
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [darkMode, setDarkMode] = useState(false);

  const [newPlant, setNewPlant] = useState({
    name: '', species: '', container_type: 'Grow Bag', pot_size: '',
    watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0],
    notes: '', location_in_garden: '', photo_url: null as string | null,
  });

  // Load preferences
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
      { id: 'demo1', name: 'Demo Desert Rose', container_type: 'Pot', pot_size: '10gal', watering_frequency_days: 7, last_watered: '2026-04-01', photo_url: null },
      { id: 'demo2', name: 'Demo Saguaro', container_type: 'Grow Bag', pot_size: '15gal', watering_frequency_days: 14, last_watered: '2026-03-25', photo_url: null },
      { id: 'demo3', name: 'Demo Prickly Pear', container_type: 'Raised Bed', pot_size: 'Large', watering_frequency_days: 10, last_watered: '2026-04-03', photo_url: null },
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

      fetch('https://api.open-meteo.com/v1/forecast?latitude=33.3625&longitude=-112.1695&current=temperature_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America/Phoenix')
        .then(res => res.json())
        .then(data => {
          const current = data.current;
          let condition = "Sunny";
          if (current.weather_code >= 51) condition = "Rain";
          else if (current.weather_code >= 3) condition = "Cloudy";

          setWeather({
            temperature: Math.round(current.temperature_2m),
            condition,
            windSpeed: Math.round(current.wind_speed_10m),
            high: Math.round(data.daily.temperature_2m_max[0]),
            low: Math.round(data.daily.temperature_2m_min[0]),
          });
        });
    }
  }, [isAuthenticated, isDemoMode]);

  const isWriteDisabled = isDemoMode;

  const logActivity = async (action: string, plant_name?: string) => {
    if (isWriteDisabled) return;
    await supabase.from('activity_logs').insert([{ action, plant_name }]);
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    if (isWriteDisabled) {
      toast.info('Demo Mode: Photo upload is disabled');
      return null;
    }
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
    if (isWriteDisabled) {
      toast.info('Demo Mode: Photo upload is disabled');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const photoUrl = await uploadPhoto(file);
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

  const addPlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) {
      toast.info('Demo Mode: Adding plants is disabled');
      return;
    }
    e.preventDefault();
    const { error } = await supabase.from('plants').insert([newPlant]);
    if (error) toast.error('Failed to add plant');
    else {
      await logActivity('Plant Added', newPlant.name);
      toast.success('Plant added successfully! 🌱');
      setIsAddModalOpen(false);
      setNewPlant({ name: '', species: '', container_type: 'Grow Bag', pot_size: '', watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0], notes: '', location_in_garden: '', photo_url: null });
      fetchPlants();
      fetchActivities();
    }
  };

  const updatePlant = async (e: React.FormEvent) => {
    if (isWriteDisabled) {
      toast.info('Demo Mode: Editing is disabled');
      return;
    }
    e.preventDefault();
    if (!editingPlant) return;
    const { error } = await supabase.from('plants').update(editingPlant).eq('id', editingPlant.id);
    if (error) toast.error('Failed to update plant');
    else {
      await logActivity('Plant Edited', editingPlant.name);
      toast.success('Plant updated successfully!');
      setIsEditModalOpen(false);
      setEditingPlant(null);
      fetchPlants();
      fetchActivities();
    }
  };

  const markWatered = async (id: string, name: string) => {
    if (isWriteDisabled) {
      toast.info('Demo Mode: Watering is disabled');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('plants').update({ last_watered: today }).eq('id', id);
    await logActivity('Plant Watered', name);
    toast.success(`✅ ${name} watered today!`);
    fetchPlants();
    fetchActivities();
  };

  const deletePlant = async (id: string, name: string) => {
    if (isWriteDisabled) {
      toast.info('Demo Mode: Deleting is disabled');
      return;
    }
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
    if (isWriteDisabled) {
      toast.info('Demo Mode: Editing is disabled');
      return;
    }
    setEditingPlant({ ...plant });
    setIsEditModalOpen(true);
  };

  const clearActivityLog = async () => {
    if (isWriteDisabled) {
      toast.info('Demo Mode: Clearing log is disabled');
      return;
    }
    if (!confirm('Clear the entire activity log? This cannot be undone.')) return;
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
            <Input 
              type="password" 
              value={enteredPassword} 
              onChange={(e) => setEnteredPassword(e.target.value)} 
              placeholder="demo or REMOVED_OLD_PASSWORD" 
              required 
              className="text-lg py-6" 
            />
            <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 py-6 text-lg rounded-full">
              Enter Garden
            </Button>
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
          <AlertTriangle className="h-5 w-5" />
          DEMO MODE — All changes are temporary and will not be saved
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
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#004c22] dark:text-emerald-400">Add New Plant</DialogTitle>
                </DialogHeader>
                <form onSubmit={addPlant} className="space-y-5">
                  <div>
                    <Label>Plant Name</Label>
                    <Input required value={newPlant.name} onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Container Type</Label>
                      <Select value={newPlant.container_type} onValueChange={(v) => setNewPlant({ ...newPlant, container_type: v || 'Grow Bag' })}>
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
                      <Input required value={newPlant.pot_size} onChange={(e) => setNewPlant({ ...newPlant, pot_size: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Water every (days)</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      required 
                      value={newPlant.watering_frequency_days} 
                      onChange={(e) => setNewPlant({ ...newPlant, watering_frequency_days: parseInt(e.target.value) || 3 })} 
                    />
                  </div>
                  <div>
                    <Label>Plant Photo (optional)</Label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handlePhotoUpload(e)} 
                      className="w-full text-sm border border-gray-300 dark:border-zinc-700 rounded-lg p-2" 
                    />
                  </div>
                  <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 rounded-full py-3" disabled={isDemoMode}>
                    Add to Garden
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {weather && (
          <div className="mb-12 bg-white dark:bg-zinc-900 rounded-3xl p-6 flex items-center gap-8 border border-[#e5e2dd] dark:border-zinc-800 shadow-sm">
            <Sun className="h-10 w-10 text-amber-500" />
            <div>
              <div className="text-6xl font-light">{weather.temperature}°F</div>
              <div className="text-[#707a6f] dark:text-zinc-400">{weather.condition}</div>
            </div>
            <div className="text-sm text-[#707a6f] dark:text-zinc-400 space-y-1">
              <div>Wind: {weather.windSpeed} mph</div>
              <div>High: {weather.high}°F • Low: {weather.low}°F</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {plants.map((plant) => {
            const dueSoon = !plant.last_watered || differenceInDays(addDays(new Date(plant.last_watered), plant.watering_frequency_days), new Date()) <= 2;
            return (
              <Card key={plant.id} className="bg-white dark:bg-zinc-900 border border-[#e5e2dd] dark:border-zinc-800 rounded-3xl overflow-hidden">
                {plant.photo_url && (
                  <div className="h-52 bg-gray-100 dark:bg-zinc-800">
                    <img src={plant.photo_url} alt={plant.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl">{plant.name}</CardTitle>
                    <Badge className="bg-[#f0ede8] dark:bg-zinc-800 text-[#404940] dark:text-zinc-300">
                      {plant.container_type} • {plant.pot_size}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-sm text-[#404940] dark:text-zinc-400">
                    <p>Last watered: {plant.last_watered ? format(new Date(plant.last_watered), 'MMM d') : 'Never'}</p>
                    <p className={dueSoon ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}>
                      Next due: {plant.last_watered ? format(addDays(new Date(plant.last_watered), plant.watering_frequency_days), 'MMM d') : '—'}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      onClick={() => markWatered(plant.id, plant.name)} 
                      disabled={isDemoMode}
                      className="flex-1 bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 text-white rounded-full"
                    >
                      <Droplet className="mr-2 h-4 w-4" /> Watered Today
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => openEditModal(plant)} disabled={isDemoMode} className="border-[#e5e2dd] dark:border-zinc-700">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="text-red-600 border-[#e5e2dd] dark:border-zinc-700" onClick={() => deletePlant(plant.id, plant.name)} disabled={isDemoMode}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Activity Log */}
        <Card className="bg-white dark:bg-zinc-900 border border-[#e5e2dd] dark:border-zinc-800 rounded-3xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Recent Activity
            </CardTitle>
            <Button variant="destructive" size="sm" onClick={clearActivityLog} disabled={isDemoMode}>
              <Trash className="h-4 w-4 mr-1" /> Clear Log
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activities.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-zinc-400">No activity yet</p>
              ) : (
                activities.map((log) => (
                  <div key={log.id} className="flex justify-between text-sm border-b border-gray-100 dark:border-zinc-800 pb-3 last:border-0">
                    <div>
                      <span className="font-medium">{log.action}</span>
                      {log.plant_name && <span className="ml-2 text-[#004c22] dark:text-emerald-400">— {log.plant_name}</span>}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-zinc-500">
                      {format(new Date(log.created_at), 'MMM d, h:mm a')}
                    </span>
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
            <DialogTitle className="text-[#004c22] dark:text-emerald-400">Edit Plant</DialogTitle>
          </DialogHeader>
          {editingPlant && (
            <form onSubmit={updatePlant} className="space-y-5">
              <div>
                <Label>Plant Name</Label>
                <Input value={editingPlant.name} onChange={(e) => setEditingPlant({ ...editingPlant, name: e.target.value })} />
              </div>
              <div>
                <Label>Size</Label>
                <Input value={editingPlant.pot_size} onChange={(e) => setEditingPlant({ ...editingPlant, pot_size: e.target.value })} />
              </div>
              <div>
                <Label>Water every (days)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={editingPlant.watering_frequency_days} 
                  onChange={(e) => setEditingPlant({ ...editingPlant, watering_frequency_days: parseInt(e.target.value) || 3 })} 
                />
              </div>
              <div>
                <Label>Update Photo</Label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handlePhotoUpload(e, true)} 
                  className="w-full text-sm border border-gray-300 dark:border-zinc-700 rounded-lg p-2" 
                />
              </div>
              <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 rounded-full py-3" disabled={isDemoMode}>
                Save Changes
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
