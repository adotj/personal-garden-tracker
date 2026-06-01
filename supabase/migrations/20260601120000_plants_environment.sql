-- Separate outdoor garden plants from indoor houseplants.
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'outdoor'
  CHECK (environment IN ('indoor', 'outdoor'));

CREATE INDEX IF NOT EXISTS plants_environment_created_idx
  ON public.plants (environment, created_at DESC);
