-- Base schema for fresh local installs (cloud project predates committed migrations).
-- Later migrations use ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  container_type text NOT NULL,
  pot_size text NOT NULL,
  watering_frequency_days integer NOT NULL,
  last_watered timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_fertilized date NOT NULL DEFAULT (timezone('utc', now()))::date,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  fertilizer_frequency_days integer NOT NULL DEFAULT 30,
  fertilizer_seasons text[] NOT NULL DEFAULT ARRAY['spring', 'summer', 'fall', 'winter']::text[],
  fertilizer_notes text,
  sun_exposure text NOT NULL DEFAULT 'full_sun',
  notes text,
  species text,
  location_in_garden text,
  environment text NOT NULL DEFAULT 'outdoor'
    CHECK (environment IN ('indoor', 'outdoor'))
);

CREATE INDEX IF NOT EXISTS plants_created_at_idx ON public.plants (created_at DESC);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  plant_name text,
  details text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);

COMMENT ON TABLE public.plants IS 'Garden plants (containers, watering, photos)';
COMMENT ON TABLE public.activity_logs IS 'Home dashboard activity feed';
