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

import { Plus, Droplet, Edit, Trash2, Sun, History, Moon, Sun as SunIcon, Trash, Lock, AlertTriangle, Image, Loader2, X, Sprout, RefreshCw, Search, XCircle } from 'lucide-react';
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

// ==================== HELPERS ====================
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

  // Search + Sort
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<'name-asc' | 'name-desc' | 'watered' | 'fertilized'>('name-asc');

  const mainRef = useRef<HTMLDivElement>(null);
  const editPhotoBaselineRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [newPlant, setNewPlant] = useState<NewPlantForm>({
    name: '', species: '', container_type: 'Grow Bag', pot_size: '10 gallon',
    watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0],
    fertilizer_frequency_days: 30, last_fertilized: new Date().toISOString().split('T')[0],
    notes: '', location_in_garden: '', photo_url: null,
  });

  const [editWaterDays, setEditWaterDays] = useState('');
  const [editFertDays, setEditFertDays] = useState('');
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);

  // Filtered + Sorted Plants
  const filteredPlants = plants
    .filter((plant) => plant.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortMode === 'name-asc') return a.name.localeCompare(b.name);
      if (sortMode === 'name-desc') return b.name.localeCompare(a.name);
      if (sortMode === 'watered') return new Date(b.last_watered || 0).getTime() - new Date(a.last_watered || 0).getTime();
      if (sortMode === 'fertilized') return new Date(b.last_fertilized || 0).getTime() - new Date(a.last_fertilized || 0).getTime();
      return 0;
    });

  const clearFilter = () => {
    setSearchTerm('');
    setSortMode('name-asc');
  };

  // ==================== AUTH & REFRESH ====================
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
    newMode ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsDemoMode(false);
    localStorage.removeItem(GARDEN_AUTH_KEY);
    localStorage.removeItem(GARDEN_MODE_KEY);
    toast.info('Logged out');
  };

  const handleRefresh = async () => {
    if (isDemoMode) return toast.info("Demo mode — using static data");
    setLoading(true);
    toast.loading("Refreshing...", { id: "refresh" });
    // Add your fetchPlants() and fetchActivities() here
    toast.success("Garden refreshed!", { id: "refresh" });
    setLoading(false);
  };

  // ==================== MODALS & ACTIONS ====================
  // Add your full addPlant, updatePlant, markWatered, markFertilized, deletePlant, openEditModal, etc. here
  // (They remain exactly as you had them before)

  if (loading) return <div className="h-screen flex items-center justify-center bg-desert-page dark:bg-zinc-950">Loading Garden...</div>;

  if (!isAuthenticated) {
    // Your login screen (unchanged)
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-desert-page text-desert-ink'}`}>
      <Toaster position="top-center" richColors />

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Search + Sort + Count */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-8">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search plants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={sortMode} onValueChange={(v) => setSortMode(v as any)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="name-desc">Name Z–A</SelectItem>
              <SelectItem value="watered">Last Watered</SelectItem>
              <SelectItem value="fertilized">Last Fertilized</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={clearFilter} className="gap-2">
            <XCircle className="h-4 w-4" />
            Clear
          </Button>

          <Badge variant="outline" className="text-base px-4 py-2">
            {filteredPlants.length} of {plants.length} plants
          </Badge>
        </div>

        {/* Plants Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {filteredPlants.map((plant) => {
            const showWaterDue = waterDueSoon(plant);
            const showFertDue = fertDueSoon(plant);

            return (
              <Card key={plant.id} className="relative bg-desert-parchment dark:bg-zinc-900 border border-desert-border dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                <Link href={`/plant/${plant.id}`} className="absolute inset-0 z-0" />
                <div className="relative z-10 pointer-events-none">
                  {plant.photo_url ? (
                    <div className="h-52 w-full overflow-hidden bg-desert-dune dark:bg-zinc-800">
                      <img src={plant.photo_url} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-desert-dune text-sm text-desert-dust dark:bg-zinc-800 dark:text-zinc-500">
                      No homepage photo
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-xl">{plant.name}</CardTitle>
                      <Badge className="bg-desert-ridge dark:bg-zinc-800 text-desert-sage dark:text-zinc-300">
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
                      <Button onClick={() => {/* markWatered call */}} disabled={isDemoMode} className="flex-1">
                        <Droplet className="mr-2 h-4 w-4" /> Watered Today
                      </Button>
                      <Button onClick={() => {/* markFertilized call */}} disabled={isDemoMode} className="flex-1 bg-amber-600 hover:bg-amber-700">
                        <Sprout className="mr-2 h-4 w-4" /> Fertilized Today
                      </Button>
                    </div>
                    <div className="flex gap-3 pointer-events-auto">
                      <Button variant="outline" size="icon" onClick={() => {/* openEditModal(plant) */}} disabled={isDemoMode}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="text-red-600" onClick={() => {/* deletePlant */}} disabled={isDemoMode}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Add Plant Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-oasis dark:text-emerald-400">Add New Plant</DialogTitle>
          </DialogHeader>
          {/* Paste your full Add Plant form here */}
        </DialogContent>
      </Dialog>

      {/* Edit Plant Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-oasis dark:text-emerald-400">Edit Plant</DialogTitle>
          </DialogHeader>
          {/* Paste your full Edit Plant form here */}
        </DialogContent>
      </Dialog>
    </div>
  );
}
