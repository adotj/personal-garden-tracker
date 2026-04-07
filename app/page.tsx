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
import { Plus, Droplet, Edit, Trash2, Sun, History, Moon, Sun as SunIcon, Trash, Lock, Wind, AlertTriangle } from 'lucide-react';
import { format, addDays, differenceInDays, startOfDay } from 'date-fns';
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

const SHARED_PASSWORD = "REMOVED_OLD_PASSWORD";

export default function LaveenGardenTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [plants, setPlants] = useState<Plant[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [weather, setWeather] = useState<{
    temperature: number;
    condition: string;
    windSpeed: number;
    high: number;
    low: number;
  } | null>(null);
  const [currentTime] = useState(new Date());
  const [darkMode, setDarkMode] = useState(false);

  const [newPlant, setNewPlant] = useState({
    name: '', species: '', container_type: 'Grow Bag', pot_size: '',
    watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0],
    notes: '', location_in_garden: '', photo_url: null as string | null,
  });

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
    if (enteredPassword === SHARED_PASSWORD) {
      setIsAuthenticated(true);
      localStorage.setItem('gardenAuthenticated', 'true');
      toast.success('Welcome back to the garden 🌵');
    } else {
      toast.error('Incorrect password');
      setEnteredPassword('');
    }
  };

  const fetchPlants = async () => {
    const { data } = await supabase.from('plants').select('*').order('created_at', { ascending: false });
    setPlants(data || []);
  };

  const fetchActivities = async () => {
    const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(20);
    setActivities(data || []);
  };

  const logActivity = async (action: string, plant_name?: string, details?: string) => {
    await supabase.from('activity_logs').insert([{ action, plant_name, details }]);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPlants();
      fetchActivities();
      // Laveen Coordinates
      fetch('https://api.open-meteo.com/v1/forecast?latitude=33.3625&longitude=-112.1695&current=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/Phoenix')
        .then(res => res.json())
        .then(data => {
          setWeather({
            temperature: Math.round(data.current.temperature_2m),
            condition: data.current.temperature_2m > 95 ? "Extreme Heat" : "Clear",
            windSpeed: Math.round(data.current.wind_speed_10m),
            high: Math.round(data.daily.temperature_2m_max[0]),
            low: Math.round(data.daily.temperature_2m_min[0]),
          });
        });
    }
  }, [isAuthenticated]);

  const markWatered = async (id: string, name: string) => {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('plants').update({ last_watered: today }).eq('id', id);
    await logActivity('Watered', name);
    toast.success(`✅ ${name} watered!`);
    fetchPlants();
    fetchActivities();
  };

  const addPlant = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('plants').insert([newPlant]);
    if (error) toast.error('Error adding plant');
    else {
      await logActivity('Added', newPlant.name);
      setIsAddModalOpen(false);
      fetchPlants();
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#fcf9f4] dark:bg-zinc-950">Loading Garden...</div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#fcf9f4] dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-xl p-10 border border-[#e5e2dd] dark:border-zinc-800">
          <div className="flex justify-center mb-6"><Lock className="h-10 w-10 text-[#004c22] dark:text-emerald-500" /></div>
          <h1 className="text-3xl font-bold text-center text-[#004c22] dark:text-emerald-400 mb-8">Laveen Garden</h1>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input type="password" value={enteredPassword} onChange={(e) => setEnteredPassword(e.target.value)} placeholder="Password" required className="rounded-xl" />
            <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 rounded-xl">Enter</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-[#fcf9f4] text-[#1c1c19]'}`}>
      <Toaster position="top-center" richColors />

      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-[#e5e2dd] dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🌵</span>
            <span className="font-bold text-2xl tracking-tight text-[#004c22] dark:text-emerald-400">Laveen Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="rounded-full">
              {darkMode ? <SunIcon className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 rounded-full"><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader><DialogTitle>New Backyard Plant</DialogTitle></DialogHeader>
                <form onSubmit={addPlant} className="space-y-4 pt-4">
                  <div className="space-y-2"><Label>Plant Name</Label><Input required placeholder="e.g., VDB Fig" value={newPlant.name} onChange={e => setNewPlant({...newPlant, name: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Type</Label>
                      <Select value={newPlant.container_type} onValueChange={v => setNewPlant({...newPlant, container_type: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="Grow Bag">Grow Bag</SelectItem><SelectItem value="Pot">Pot</SelectItem><SelectItem value="Raised Bed">Raised Bed</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Size</Label><Input placeholder="5gal" value={newPlant.pot_size} onChange={e => setNewPlant({...newPlant, pot_size: e.target.value})} /></div>
                  </div>
                  <div className="space-y-2"><Label>Base Frequency (Days)</Label><Input type="number" value={newPlant.watering_frequency_days} onChange={e => setNewPlant({...newPlant, watering_frequency_days: parseInt(e.target.value)})} /></div>
                  <Button type="submit" className="w-full bg-[#004c22] dark:bg-emerald-600">Save Plant</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-[#004c22] dark:text-emerald-400 mb-6">Good morning, Alvester.</h1>
          {weather && (
            <div className="bg-white dark:bg-zinc-900 border border-[#e5e2dd] dark:border-zinc-800 rounded-3xl p-6 flex flex-wrap items-center gap-8 shadow-sm">
              <div className="flex items-center gap-4">
                <Sun className="h-10 w-10 text-amber-500" />
                <div>
                  <div className="text-5xl font-light">{weather.temperature}°</div>
                  <div className="text-sm text-zinc-500 uppercase tracking-widest">{weather.condition}</div>
                </div>
              </div>
              <div className="h-10 w-px bg-zinc-200 dark:bg-zinc-800 hidden md:block" />
              <div className="flex gap-6 text-sm text-zinc-600 dark:text-zinc-400">
                <div><span className="block text-zinc-400">High/Low</span>{weather.high}° / {weather.low}°</div>
                <div><span className="block text-zinc-400">Wind</span>{weather.windSpeed} mph</div>
              </div>
              {weather.temperature > 100 && (
                <Badge variant="destructive" className="ml-auto animate-pulse bg-orange-600">Extreme Heat Alert</Badge>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plants.map((plant) => {
            // HEAT AWARE LOGIC
            const temp = weather?.temperature || 90;
            const wind = weather?.windSpeed || 0;
            let heatFactor = 1.0;
            
            if (temp >= 108) heatFactor = 0.4; // Massive acceleration for desert peaks
            else if (temp >= 100) heatFactor = 0.6;
            else if (temp >= 92) heatFactor = 0.8;

            // Grow Bag + Wind = Extra evaporation
            if (plant.container_type === 'Grow Bag' && wind > 15) heatFactor -= 0.1;

            const adjFreq = Math.max(1, Math.round(plant.watering_frequency_days * heatFactor));
            const lastWatered = plant.last_watered ? startOfDay(new Date(plant.last_watered)) : startOfDay(new Date(0));
            const nextDue = addDays(lastWatered, adjFreq);
            const diff = differenceInDays(nextDue, startOfDay(new Date()));
            
            const isDue = diff <= 0;
            const isAdjusted = heatFactor < 1.0;

            return (
              <Card key={plant.id} className={`rounded-3xl overflow-hidden border-2 transition-all ${isDue ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-none' : 'border-[#e5e2dd] dark:border-zinc-800'}`}>
                {plant.photo_url && <img src={plant.photo_url} alt="" className="h-48 w-full object-cover" />}
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xl font-bold">{plant.name}</CardTitle>
                  <Badge variant="secondary" className="rounded-full">{plant.container_type}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div className="text-sm">
                      <p className="text-zinc-500">Next Due</p>
                      <p className={`text-lg font-bold ${isDue ? 'text-orange-600' : ''}`}>
                        {format(nextDue, 'MMM do')}
                        {isDue && <span className="ml-2 text-xs uppercase">Overdue</span>}
                      </p>
                    </div>
                    {isAdjusted && (
                      <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full border border-amber-200">
                        <SunIcon className="h-3 w-3" /> HEAT ADJ
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => markWatered(plant.id, plant.name)} className="flex-1 bg-[#004c22] hover:bg-[#166534] dark:bg-emerald-600 rounded-xl py-6">
                      <Droplet className="h-4 w-4 mr-2" /> Watered Today
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-xl h-12 w-12 border-zinc-200 dark:border-zinc-700">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {plant.container_type === 'Grow Bag' && wind > 15 && isDue && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
                      <Wind className="h-3 w-3" /> Wind is drying out fabric pots!
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12">
          <Card className="rounded-3xl border-[#e5e2dd] dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5" /> Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map(log => (
                  <div key={log.id} className="flex justify-between text-sm border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                    <div>
                      <span className="font-bold text-[#004c22] dark:text-emerald-500">{log.action}</span>
                      <span className="mx-2 text-zinc-400">•</span>
                      <span>{log.plant_name}</span>
                    </div>
                    <span className="text-zinc-400 text-xs">{format(new Date(log.created_at), 'MMM d, h:mm a')}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
