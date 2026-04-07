-- Timeline / gallery images per plant (growth history). Homepage “key” image stays on plants.photo_url.
-- Run in Supabase SQL editor if migrations are not applied automatically.

CREATE TABLE IF NOT EXISTS public.plant_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES public.plants (id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plant_photos_plant_id_created_at_idx
  ON public.plant_photos (plant_id, created_at DESC);

COMMENT ON TABLE public.plant_photos IS 'Historical photos for growth tracking; plants.photo_url is the card/homepage key image.';

-- Optional: backfill existing cover images into history (safe to re-run)
INSERT INTO public.plant_photos (plant_id, photo_url)
SELECT p.id, p.photo_url
FROM public.plants p
WHERE p.photo_url IS NOT NULL AND trim(p.photo_url) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.plant_photos x WHERE x.plant_id = p.id AND x.photo_url = p.photo_url
  );

-- If your project uses RLS, add policies mirroring `plants` (example — adjust to your security model):
-- ALTER TABLE public.plant_photos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "plant_photos_all" ON public.plant_photos FOR ALL USING (true) WITH CHECK (true);
