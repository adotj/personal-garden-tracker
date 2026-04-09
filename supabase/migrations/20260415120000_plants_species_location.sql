-- Optional plant metadata (form state already had these; inserts referenced missing columns)
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS species text;

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS location_in_garden text;

COMMENT ON COLUMN public.plants.species IS 'Species or cultivar name (optional)';
COMMENT ON COLUMN public.plants.location_in_garden IS 'Where the container sits in the yard (optional)';
