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
    const { data, error } = await supabase.from('plants').select('*').order('created_at', { ascending: false });
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
    if (error) toast.error('Failed to add');
    else {
      toast.success('Plant added! 🌱');
      setIsAddModalOpen(false);
      setNewPlant({ name: '', species: '', container_type: 'Grow Bag', pot_size: '', watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0], notes: '', location_in_garden: '' });
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
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-amber-50 to-orange-50 p-6">
      <Toaster position="top-center" richColors />

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-5xl font-bold text-emerald-950">🌵 Laveen Garden Tracker</h1>
            <p className="text-emerald-700">Pots & Grow Bags • Desert Watering</p>
          </div>
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-emerald-700 hover:bg-emerald-800">
                <Plus className="mr-2 h-5 w-5" /> Add New Plant
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Plant</DialogTitle></DialogHeader>
              <form onSubmit={addPlant} className="space-y-4">
                <div>
                  <Label>Plant Name *</Label>
                  <Input required value={newPlant.name} onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Container Type</Label>
                    <Select value={newPlant.container_type} onValueChange={(v) => setNewPlant({ ...newPlant, container_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pot">Pot</SelectItem>
                        <SelectItem value="Grow Bag">Grow Bag</SelectItem>
                        <SelectItem value="Raised Bed">Raised Bed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Size *</Label>
                    <Input required value={newPlant.pot_size} onChange={(e) => setNewPlant({ ...newPlant, pot_size: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Water every (days) *</Label>
                  <Input type="number" min="1" required value={newPlant.watering_frequency_days} onChange={(e) => setNewPlant({ ...newPlant, watering_frequency_days: parseInt(e.target.value) || 3 })} />
                </div>
                <Button type="submit" className="w-full bg-emerald-700">Add Plant</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plants.map((plant) => {
            const dueSoon = !plant.last_watered || differenceInDays(addDays(new Date(plant.last_watered), plant.watering_frequency_days), new Date()) <= 2;
            return (
              <Card key={plant.id} className={`border-2 ${dueSoon ? 'border-orange-500 shadow-lg' : 'border-emerald-100'}`}>
                <CardHeader>
                  <div className="flex justify-between">
                    <CardTitle>{plant.name}</CardTitle>
                    <Badge>{plant.container_type} • {plant.pot_size}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm">
                    <p>Last watered: {plant.last_watered ? format(new Date(plant.last_watered), 'MMM d') : 'Never'}</p>
                    <p className={dueSoon ? 'text-orange-600 font-medium' : ''}>
                      Next due: {plant.last_watered ? format(addDays(new Date(plant.last_watered), plant.watering_frequency_days), 'MMM d') : '—'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => markWatered(plant.id, plant.name)} className="flex-1 bg-emerald-700">
                      <Droplet className="mr-2 h-4 w-4" /> Watered Today
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => openEditModal(plant)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="text-red-500" onClick={() => deletePlant(plant.id, plant.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Basic Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Plant</DialogTitle></DialogHeader>
          {editingPlant && (
            <div className="space-y-4">
              <Input value={editingPlant.name} onChange={(e) => setEditingPlant({ ...editingPlant, name: e.target.value })} />
              <Input value={editingPlant.pot_size} onChange={(e) => setEditingPlant({ ...editingPlant, pot_size: e.target.value })} />
              <Button onClick={() => { /* simple save logic later */ alert('Save coming soon'); setIsEditModalOpen(false); }} className="w-full">
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
