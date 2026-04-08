'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Plant } from '@/lib/plant-types';
import { deletePlantImageFromStorage } from '@/lib/storage-upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast, Toaster } from 'sonner';
import { ArrowLeft, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';

export default function PlantProfile() {
  const params = useParams();
  const router = useRouter();
  const plantId = params.id as string;

  const [plant, setPlant] = useState<Plant | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!plantId) return;
    fetchPlant();
    fetchPhotos();
    fetchActivities();
  }, [plantId]);

  const fetchPlant = async () => {
    const { data, error } = await supabase
      .from('plants')
      .select('*')
      .eq('id', plantId)
      .single();

    if (error) {
      toast.error('Plant not found');
      router.push('/');
      return;
    }
    setPlant(data);
    setLoading(false);
  };

  const fetchPhotos = async () => {
    const { data } = await supabase
      .from('plant_photos')
      .select('*')
      .eq('plant_id', plantId)
      .order('created_at', { ascending: false });
    setPhotos(data || []);
  };

  const fetchActivities = async () => {
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('plant_name', plant?.name || '')
      .order('created_at', { ascending: false })
      .limit(30);
    setActivities(data || []);
  };

  // ==================== DELETE PHOTO ====================
  const deletePhoto = async (photoId: string, photoUrl: string) => {
    if (!confirm('Delete this photo permanently? This action cannot be undone.')) return;

    setDeletingId(photoId);

    try {
      const storageError = await deletePlantImageFromStorage(photoUrl);

      if (storageError) {
        console.error('Storage delete failed:', storageError);
        toast.error('Failed to delete image from storage');
        return;
      }

      const { error: dbError } = await supabase
        .from('plant_photos')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;

      // If this was the homepage photo, clear it
      if (plant?.photo_url === photoUrl) {
        await supabase.from('plants').update({ photo_url: null }).eq('id', plantId);
        setPlant(prev => prev ? { ...prev, photo_url: null } : null);
      }

      setPhotos(prev => prev.filter(p => p.id !== photoId));
      toast.success('Photo deleted successfully');

    } catch (err: any) {
      console.error('Delete photo error:', err);
      toast.error('Failed to delete photo');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-desert-page dark:bg-zinc-950">
        Loading plant profile...
      </div>
    );
  }

  if (!plant) {
    return <div className="min-h-screen flex items-center justify-center">Plant not found</div>;
  }

  return (
    <div className="min-h-screen bg-desert-page dark:bg-zinc-950 text-desert-ink dark:text-white">
      <Toaster position="top-center" richColors />

      <header className="sticky top-0 z-50 bg-desert-parchment/95 dark:bg-zinc-900/95 backdrop-blur border-b border-desert-border dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-oasis dark:text-emerald-400">{plant.name}</h1>
            <Badge className="mt-1">
              {plant.container_type} • {plant.pot_size}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-12">
        {/* Homepage Photo */}
        {plant.photo_url && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5" /> Homepage Photo
            </h2>
            <div className="relative rounded-3xl overflow-hidden border border-desert-border dark:border-zinc-700">
              <img 
                src={plant.photo_url} 
                alt={plant.name} 
                className="w-full max-h-[420px] object-cover" 
              />
            </div>
          </div>
        )}

        {/* Photo History */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              📸 Photo History
            </h2>
            <p className="text-sm text-desert-dust dark:text-zinc-500">
              {photos.length} additional photos
            </p>
          </div>

          {photos.length === 0 ? (
            <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
              <CardContent className="py-12 text-center">
                <p className="text-desert-dust dark:text-zinc-500">No additional photos yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {photos.map((photo) => (
                <div 
                  key={photo.id} 
                  className="relative group rounded-2xl overflow-hidden border border-desert-border dark:border-zinc-700 shadow-sm"
                >
                  <img 
                    src={photo.photo_url} 
                    alt="Plant growth" 
                    className="w-full aspect-square object-cover" 
                  />
                  
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deletePhoto(photo.id, photo.photo_url)}
                    disabled={deletingId === photo.id}
                  >
                    {deletingId === photo.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <p className="text-white text-xs">
                      {format(new Date(photo.created_at), 'MMM d, yyyy • h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity History */}
        <Card className="bg-desert-parchment dark:bg-zinc-900 border-desert-border dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🌱 Growth & Activity History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-center py-12 text-desert-dust dark:text-zinc-500">
                No activity logged for this plant yet.
              </p>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {activities.map((log) => (
                  <div 
                    key={log.id} 
                    className="flex justify-between items-start p-5 bg-white/60 dark:bg-zinc-800/60 rounded-2xl border border-desert-mist dark:border-zinc-700"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-lg">{log.action}</div>
                    </div>
                    <div className="text-right text-xs text-desert-dust dark:text-zinc-500 whitespace-nowrap ml-4">
                      {format(new Date(log.created_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
