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
import { Textarea } from '@/components/ui/textarea';
import { Plus, Droplet, Edit, Trash2 } from 'lucide-react';
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
};

export default function LaveenGardenTracker() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);

  const [newPlant, setNewPlant] = useState({
    name: '',
    species: '',
    container_type: 'Grow Bag',
    pot_size: '',
    watering_frequency_days: 3,
    last_watered: new Date().toISOString().split('T')[0],
    notes: '',
    location_in_garden: '',
  });

  const fetchPlants = async () => {
    const { data, error } = await supabase
      .from('plants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) toast.error('Failed to load plants');
    else setPlants(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  const addPlant = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('plants').insert([newPlant]);
    if (error) toast.error('Failed to add plant');
    else {
      toast.success('Plant added successfully! 🌱');
      setIsAddModalOpen(false);
      setNewPlant({ name: '', species: '', container_type: 'Grow Bag', pot_size: '', watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0], notes: '', location_in_garden: '' });
      fetchPlants();
    }
  };

  const updatePlant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlant) return;
    const { error } = await supabase.from('plants').update(editingPlant).eq('id', editingPlant.id);
    if (error) toast.error('Failed to update');
    else {
      toast.success('Plant updated!');
      setIsEditModalOpen(false);
      setEditingPlant(null);
      fetchPlants();
    }
  };

  const markWatered = async (id: string, name: string) => {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('plants').update({ last_watered: today }).eq('id', id);
    toast.success(`✅ ${name} watered today!`);
    fetchPlants();
  };

  const deletePlant = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    await supabase.from('plants').delete().eq('id', id);
    toast.success(`${name} deleted`);
    fetchPlants();
  };

  const openEditModal = (plant: Plant) => {
    setEditingPlant({ ...plant });
    setIsEditModalOpen(true);
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-xl">Loading your Laveen garden... 🌵</div>;

  return (
    <div className="min-h-screen bg-[#fcf9f4] text-[#1c1c19]">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#fcf9f4] border-b border-[#e5e2dd]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🌵</div>
            <div>
              <div className="font-bold text-2xl tracking-tight text-[#004c22]">Laveen Garden</div>
              <div className="text-xs text-[#707a6f] -mt-1">Sonoran Desert Tracker</div>
            </div>
          </div>
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger>
              <Button className="bg-[#004c22] hover:bg-[#166534] text-white flex items-center gap-2">
                <Plus className="h-4 w-4" /> New Plant
              </Button>
            </DialogTrigger>
            {/* Add modal - keep your existing one or we can improve later */}
            <DialogContent className="sm:max-w-md">
              {/* ... your add form ... */}
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-[#004c22] mb-2">Morning, Laveen.</h1>
          <p className="text-[#707a6f] text-lg">Your desert sanctuary is thriving.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {plants.map((plant) => {
            const dueSoon = !plant.last_watered || differenceInDays(addDays(new Date(plant.last_watered), plant.watering_frequency_days), new Date()) <= 2;
            return (
              <Card key={plant.id} className="bg-white border border-[#e5e2dd] shadow-sm hover:shadow-md transition-shadow rounded-3xl overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex justify-between">
                    <CardTitle className="text-xl">{plant.name}</CardTitle>
                    <Badge className="bg-[#f0ede8] text-[#404940]">{plant.container_type} • {plant.pot_size}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-sm text-[#404940]">
                    <p>Last watered: {plant.last_watered ? format(new Date(plant.last_watered), 'MMM d') : 'Never'}</p>
                    <p className={dueSoon ? 'text-[#ac3400] font-medium' : ''}>
                      Next due: {plant.last_watered ? format(addDays(new Date(plant.last_watered), plant.watering_frequency_days), 'MMM d') : '—'}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={() => markWatered(plant.id, plant.name)} className="flex-1 bg-[#004c22] hover:bg-[#166534]">
                      <Droplet className="mr-2 h-4 w-4" /> Watered Today
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => openEditModal(plant)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="text-red-600" onClick={() => deletePlant(plant.id, plant.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
