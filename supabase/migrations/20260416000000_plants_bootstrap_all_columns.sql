-- One-shot alignment for existing Supabase projects: run in SQL editor if inserts/updates fail.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS fertilizer_frequency_days integer NOT NULL DEFAULT 30;

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS fertilizer_seasons text[] NOT NULL DEFAULT ARRAY['spring', 'summer', 'fall', 'winter']::text[];

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS fertilizer_notes text;

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS sun_exposure text NOT NULL DEFAULT 'full_sun';

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS species text;

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS location_in_garden text;
