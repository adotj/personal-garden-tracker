-- Sun / shade placement for container plants (desert gardening)
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS sun_exposure text NOT NULL DEFAULT 'full_sun';

COMMENT ON COLUMN public.plants.sun_exposure IS 'Light level: full_sun | partial_sun | partial_shade | full_shade';
