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
      setNewPlant({
        name: '', species: '', container_type: 'Grow Bag', pot_size: '',
        watering_frequency_days: 3, last_watered: new Date().toISOString().split('T')[0],
        notes: '', location_in_garden: ''
      });
      fetchPlants();
    }
  };

  const updatePlant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlant) return;

    const { error } = await supabase
      .from('plants')
      .update(editingPlant)
      .eq('id', editingPlant.id);

    if (error) toast.error('Failed to update plant');
    else {
      toast.success('Plant updated successfully!');
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

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-xl bg-[#fcf9f4]">Loading your Laveen garden... 🌵</div>;
  }

  return (
    <div className="min-h-screen bg-[#fcf9f4] text-[#1c1c19]">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#fcf9f4] border-b border-[#e5e2dd]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🌵</span>
            <div>
              <div className="font-bold text-3xl tracking-tighter text-[#004c22]">Laveen Garden</div>
              <div className="text-xs text-[#707a6f] -mt-1">Sonoran Desert</div>
            </div>
          </div>

          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger>
              <Button className="bg-[#004c22] hover:bg-[#166534] text-white rounded-full px-6 py-2.5 flex items-center gap-2">
                <Plus className="h-4 w-4" /> New Plant
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-[#004c22]">Add New Plant</DialogTitle>
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
                        <SelectItem value="Pot">Pot</SelectItem>
                        <SelectItem value="Grow Bag">Grow Bag</SelectItem>
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
                <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] rounded-full py-3">
                  Add to Garden
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-[#004c22] tracking-tight">Morning, Laveen.</h1>
          <p className="text-[#707a6f] text-lg mt-2">Your desert sanctuary is thriving under today's sun.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {plants.map((plant) => {
            const dueSoon = !plant.last_watered || differenceInDays(addDays(new Date(plant.last_watered), plant.watering_frequency_days), new Date()) <= 2;
            return (
              <Card key={plant.id} className="bg-white border border-[#e5e2dd] shadow-sm hover:shadow transition-all rounded-3xl overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
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
                    <Button 
                      onClick={() => markWatered(plant.id, plant.name)} 
                      className="flex-1 bg-[#004c22] hover:bg-[#166534] text-white rounded-full"
                    >
                      <Droplet className="mr-2 h-4 w-4" /> Watered Today
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => openEditModal(plant)} className="border-[#e5e2dd]">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="text-red-600 border-[#e5e2dd]" onClick={() => deletePlant(plant.id, plant.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#004c22]">Edit Plant</DialogTitle>
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
              <Button type="submit" className="w-full bg-[#004c22] hover:bg-[#166534] rounded-full py-3">
                Save Changes
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
