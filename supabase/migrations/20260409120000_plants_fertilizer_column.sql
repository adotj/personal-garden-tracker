-- Ensures fertilize-interval exists (fixes PATCH when column was never added)
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS fertilizer_frequency_days integer NOT NULL DEFAULT 30;
