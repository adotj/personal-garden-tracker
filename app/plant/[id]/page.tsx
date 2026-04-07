'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Plant, PlantPhoto } from '@/lib/plant-types';
import { normalizePlantRow } from '@/lib/plant-helpers';
import { uploadPlantImage, deletePlantImageFromStorage } from '@/lib/storage-upload';
import { GARDEN_AUTH_KEY, GARDEN_MODE_KEY, type GardenMode } from '@/lib/garden-session';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Image as ImageIcon, Loader2, Moon, Sun as SunIcon } from 'lucide-react';
import { format, addDays, differenceInDays, isValid } from 'date-fns';
import { toast, Toaster } from 'sonner';

const DEMO_PLANT_MAP: Record<string, Plant> = {
  demo1: {
    id: 'demo1',
    name: 'Demo Desert Rose',
    container_type: 'Pot',
    pot_size: '10gal',
    watering_frequency_days: 7,
    last_watered: '2026-04-01',
    fertilizer_frequency_days: 30,
    last_fertilized: '2026-03-15',
    photo_url: 'https://picsum.photos/seed/demorose/800/600',
  },
  demo2: {
    id: 'demo2',
    name: 'Demo Saguaro',
    container_type: 'Grow Bag',
    pot_size: '10 gallon',
    watering_frequency_days: 14,
    last_watered: '2026-03-25',
    fertilizer_frequency_days: 60,
    last_fertilized: '2026-02-01',
    photo_url: 'https://picsum.photos/seed/demosaguaro/800/600',
  },
  demo3: {
    id: 'demo3',
    name: 'Demo Prickly Pear',
    container_type: 'Raised Bed',
    pot_size: 'Large',
    watering_frequency_days: 10,
    last_watered: '2026-04-03',
    fertilizer_frequency_days: 45,
    last_fertilized: '2026-03-20',
    photo_url: 'https://picsum.photos/seed/demopear/800/600',
  },
};

function demoGalleryFor(id: string): PlantPhoto[] {
  const base = DEMO_PLANT_MAP[id];
  if (!base?.photo_url) return [];
  const older = `${base.photo_url.split('/').slice(0, -1).join('/')}/seed/${id}older/800/600`;
  return [
    { id: `${id}-h2`, plant_id: id, photo_url: base.photo_url, created_at: new Date().toISOString() },
    { id: `${id}-h1`, plant_id: id, photo_url: older, created_at: new Date(Date.now() - 86400000 * 60).toISOString() },
  ];
}

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

export default function PlantProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [plant, setPlant] = useState<Plant | null>(null);
  const [photos, setPhotos] = useState<PlantPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [mode, setMode] = useState<GardenMode | null>(null);
  const [uploading, setUploading] = useState(false);
  const [setAsHomepage, setSetAsHomepage] = useState(false);
  const [lightbox, setLightbox] = useState<PlantPhoto | null>(null);

  useEffect(() => {
    setDarkMode(localStorage.getItem('darkMode') === 'true');
    if (localStorage.getItem(GARDEN_AUTH_KEY) !== 'true') {
      router.replace('/');
      return;
    }
    const m = localStorage.getItem(GARDEN_MODE_KEY) as GardenMode | null;
    setMode(m === 'demo' || m === 'real' ? m : 'real');
  }, [router]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const isDemo = localStorage.getItem(GARDEN_MODE_KEY) === 'demo';
    if (isDemo && DEMO_PLANT_MAP[id]) {
      setPlant(DEMO_PLANT_MAP[id]);
      setPhotos(demoGalleryFor(id));
      setLoading(false);
      return;
    }

    const { data: p, error: pe } = await supabase.from('plants').select('*').eq('id', id).maybeSingle();
    if (pe || !p) {
      toast.error('Plant not found');
      setPlant(null);
      setPhotos([]);
      setLoading(false);
      return;
    }
    setPlant(normalizePlantRow(p as Plant));

    const { data: ph, error: phe } = await supabase
      .from('plant_photos')
      .select('*')
      .eq('plant_id', id)
      .order('created_at', { ascending: false });

    if (phe) {
      console.error(phe);
      setPhotos([]);
    } else {
      setPhotos((ph as PlantPhoto[]) || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
    next ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark');
  };

  const isDemo = mode === 'demo';
  const isWriteDisabled = isDemo;

  const onPickPhoto = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !plant || isWriteDisabled) return;

    setUploading(true);
    const url = await uploadPlantImage(file);
    if (!url) {
      toast.error('Upload failed');
      setUploading(false);
      return;
    }

    const { data: row, error } = await supabase
      .from('plant_photos')
      .insert([{ plant_id: plant.id, photo_url: url }])
      .select('*')
      .single();

    if (error) {
      toast.error(error.message || 'Could not save photo — add the plant_photos table in Supabase');
      await deletePlantImageFromStorage(url);
      setUploading(false);
      return;
    }

    setPhotos((prev) => [row as PlantPhoto, ...prev]);

    if (setAsHomepage) {
      const prevCover = plant.photo_url;
      await supabase.from('plants').update({ photo_url: url }).eq('id', plant.id);
      setPlant({ ...plant, photo_url: url });
      if (prevCover && prevCover !== url) {
        /* keep old file in storage for gallery history */
      }
    }

    setSetAsHomepage(false);
    toast.success('Photo added');
    setUploading(false);
  };

  const setHomepageFromGallery = async (photo: PlantPhoto) => {
    if (!plant || isWriteDisabled) return;
    const { error } = await supabase.from('plants').update({ photo_url: photo.photo_url }).eq('id', plant.id);
    if (error) {
      toast.error('Could not update homepage photo');
      return;
    }
    setPlant({ ...plant, photo_url: photo.photo_url });
    toast.success('Homepage photo updated');
  };

  if (!id || loading || mode === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-desert-page dark:bg-zinc-950 text-desert-ink dark:text-white">
        Loading…
      </div>
    );
  }

  if (!plant) {
    return (
      <div className={`min-h-screen ${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-desert-page text-desert-ink'}`}>
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="mb-6 text-desert-dust">This plant could not be loaded.</p>
          <Link href="/" className={cn(buttonVariants({ variant: 'outline' }))}>
            Back to garden
          </Link>
        </div>
      </div>
    );
  }

  const showWaterDue = waterDueSoon(plant);
  const showFertDue = fertDueSoon(plant);
  const timeline = [...photos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-desert-page text-desert-ink'}`}>
      <Toaster position="top-center" richColors />

      <header className="sticky top-0 z-40 border-b border-desert-border bg-desert-parchment/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            aria-label="Back to garden"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-oasis dark:text-emerald-400 sm:text-2xl">{plant.name}</h1>
            <p className="truncate text-sm text-desert-dust dark:text-zinc-400">Plant profile & growth history</p>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="shrink-0">
            {darkMode ? <SunIcon className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8 overflow-hidden rounded-3xl border border-desert-border bg-desert-parchment shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {plant.photo_url ? (
            <button
              type="button"
              onClick={() =>
                setLightbox({
                  id: 'cover',
                  plant_id: plant.id,
                  photo_url: plant.photo_url!,
                  created_at: new Date().toISOString(),
                })
              }
              className="relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oasis"
            >
              <img
                src={plant.photo_url}
                alt=""
                className="max-h-[min(56vh,520px)] w-full object-contain bg-desert-dune dark:bg-zinc-800"
              />
              <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                Homepage photo
              </span>
            </button>
          ) : (
            <div className="flex h-48 items-center justify-center bg-desert-dune text-sm text-desert-dust dark:bg-zinc-800">
              No homepage photo yet — add one below or from Edit on the dashboard
            </div>
          )}
        </div>

        <Card className="mb-10 border-desert-border bg-desert-parchment dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-lg">Care snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-desert-sage dark:text-zinc-400">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-desert-ridge text-desert-sage dark:bg-zinc-800 dark:text-zinc-300">
                {plant.container_type} • {plant.pot_size}
              </Badge>
            </div>
            <p>
              Water: {safeFormatDay(plant.last_watered)}
              <span className={showWaterDue ? ' font-medium text-orange-600 dark:text-orange-400' : ''}>
                {' '}
                → Due {safeFormatDue(plant.last_watered, plant.watering_frequency_days)}
              </span>
            </p>
            <p>
              Fertilizer: {safeFormatDay(plant.last_fertilized)}
              <span className={showFertDue ? ' font-medium text-orange-600 dark:text-orange-400' : ''}>
                {' '}
                → Due {safeFormatDue(plant.last_fertilized, plant.fertilizer_frequency_days)}
              </span>
            </p>
            {plant.notes ? <p className="pt-2 text-desert-ink dark:text-zinc-200">{plant.notes}</p> : null}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-desert-ink dark:text-zinc-100">Growth & photo history</h2>
              <p className="text-sm text-desert-dust dark:text-zinc-500">
                Add dated snapshots to track progress. Homepage uses the key photo above unless you choose another.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-desert-sage dark:text-zinc-400">
                <input
                  type="checkbox"
                  className="size-4 rounded border-desert-border bg-desert-parchment accent-oasis dark:border-zinc-600 dark:bg-zinc-800"
                  checked={setAsHomepage}
                  onChange={(e) => setSetAsHomepage(e.target.checked)}
                  disabled={isWriteDisabled || uploading}
                />
                Also set as homepage photo
              </label>
              <Button
                type="button"
                variant="outline"
                className="border-desert-border dark:border-zinc-700"
                disabled={isWriteDisabled || uploading}
                onClick={onPickPhoto}
              >
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                Add timeline photo
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>
          </div>

          {timeline.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-desert-border bg-desert-parchment/50 py-12 text-center text-sm text-desert-dust dark:border-zinc-700 dark:bg-zinc-900/50">
              No timeline photos yet. Upload progress shots over the seasons.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {timeline.map((ph) => (
                <li key={ph.id} className="group relative overflow-hidden rounded-2xl border border-desert-border bg-desert-dune dark:border-zinc-700 dark:bg-zinc-800">
                  <button
                    type="button"
                    onClick={() => setLightbox(ph)}
                    className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oasis"
                  >
                    <img src={ph.photo_url} alt="" className="aspect-square w-full object-cover transition group-hover:opacity-95" />
                    <span className="mt-1 block px-2 pb-2 text-center text-xs text-desert-dust dark:text-zinc-500">
                      {format(new Date(ph.created_at), 'MMM d, yyyy')}
                    </span>
                  </button>
                  {!isWriteDisabled && plant.photo_url !== ph.photo_url ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute right-2 top-2 h-7 text-xs opacity-0 transition group-hover:opacity-100 sm:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHomepageFromGallery(ph);
                      }}
                    >
                      Use on homepage
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-h-[min(92vh,900px)] w-[min(96vw,56rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
          {lightbox && (
            <>
              <DialogHeader className="border-b border-desert-border px-4 py-3 dark:border-zinc-700">
                <DialogTitle className="text-desert-ink dark:text-zinc-100">{plant.name}</DialogTitle>
                <DialogDescription className="sr-only">Full size photo</DialogDescription>
              </DialogHeader>
              <div className="flex max-h-[min(85vh,820px)] items-center justify-center overflow-auto bg-desert-page p-3 dark:bg-zinc-950 sm:p-4">
                <img
                  src={lightbox.photo_url}
                  alt=""
                  className="max-h-[min(80vh,780px)] w-full object-contain"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
