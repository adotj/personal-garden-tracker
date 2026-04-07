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
  const [error, setError] = useState<string | null>(null);

  // ... (keep the rest of your state and functions the same)

  const fetchPlants = async () => {
    try {
      console.log('Fetching plants from Supabase...');
      const { data, error } = await supabase
        .from('plants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase fetch error:', error);
        setError(error.message);
        toast.error('Failed to load plants: ' + error.message);
      } else {
        console.log('Fetched plants:', data?.length || 0);
        setPlants(data || []);
        setError(null);
      }
    } catch (err: any) {
      console.error('Unexpected fetch error:', err);
      setError(err.message || 'Unknown error');
      toast.error('Network error loading garden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  // ... rest of your component (add, edit, delete, markWatered, etc.)

  if (loading) return <div className="flex justify-center items-center h-screen text-xl">Loading your Laveen garden... 🌵</div>;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-600">
        <p className="text-xl mb-4">Failed to load garden</p>
        <p className="text-sm mb-6 max-w-md text-center">{error}</p>
        <Button onClick={fetchPlants}>Try Again</Button>
      </div>
    );
  }

  // ... rest of your UI (plant grid, modals, etc.)
}
