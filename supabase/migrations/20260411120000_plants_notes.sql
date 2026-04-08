-- Shared plant journal / care notes (e.g. observations for multiple gardeners)
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.plants.notes IS 'Free-form notes visible on the plant profile for collaboration';
