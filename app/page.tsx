'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const [error, setError] = useState<string | null>(null);

  const fetchPlants = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: supabaseError } = await supabase
        .from('plants')
        .select('*')
        .order('created_at', { ascending: false });

      if (supabaseError) {
        console.error('Supabase Error:', supabaseError);
        setError(`Database error: ${supabaseError.message}`);
        toast.error(`Failed to load plants: ${supabaseError.message}`);
      } else {
        console.log('Successfully loaded', data?.length || 0, 'plants');
        setPlants(data || []);
      }
    } catch (err: any) {
      console.error('Unexpected error:', err);
      setError(err.message || 'Unknown error occurred');
      toast.error('Unexpected error loading garden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-xl bg-gradient-to-br from-emerald-50 to-amber-50">
        Loading your Laveen garden... 🌵
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-6 text-center bg-gradient-to-br from-emerald-50 to-amber-50">
        <p className="text-2xl text-red-600 mb-4">Failed to load garden</p>
        <p className="text-red-700 mb-8 max-w-md">{error}</p>
        <Button onClick={fetchPlants} className="bg-emerald-700">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-amber-50 to-orange-50 p-6">
      <Toaster position="top-center" richColors />

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-5xl font-bold text-emerald-950 flex items-center gap-4">
              🌵 Laveen Garden Tracker
            </h1>
            <p className="text-emerald-700 mt-2">Pots & Grow Bags • Desert Watering</p>
          </div>
          <Button size="lg" className="bg-emerald-700 hover:bg-emerald-800">
            <Plus className="mr-2" /> Add New Plant
          </Button>
        </div>

        {plants.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-3xl text-emerald-700">Your garden is empty 🌱</p>
            <p className="mt-4 text-emerald-600">Add your first plant to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plants.map((plant) => (
              <Card key={plant.id} className="border-emerald-100">
                <CardHeader>
                  <div className="flex justify-between">
                    <CardTitle>{plant.name}</CardTitle>
                    <Badge>{plant.container_type} • {plant.pot_size}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p>Water every {plant.watering_frequency_days} days</p>
                  <Button className="mt-4 w-full" onClick={() => alert('Watered today! (coming soon)')}>
                    Watered Today
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
