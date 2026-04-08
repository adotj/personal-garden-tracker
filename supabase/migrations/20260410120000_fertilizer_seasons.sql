-- Season-aware fertilizer: which months to schedule + optional notes + application log
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS fertilizer_seasons text[] NOT NULL DEFAULT ARRAY['spring', 'summer', 'fall', 'winter']::text[];

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS fertilizer_notes text;

COMMENT ON COLUMN public.plants.fertilizer_seasons IS 'Northern hemisphere: winter=Dec–Feb, spring=Mar–May, summer=Jun–Aug, fall=Sep–Nov';
COMMENT ON COLUMN public.plants.fertilizer_notes IS 'Optional product or method notes (e.g. 10-10-10)';

CREATE TABLE IF NOT EXISTS public.fertilizer_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES public.plants (id) ON DELETE CASCADE,
  applied_on date NOT NULL DEFAULT (timezone('utc', now()))::date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS fertilizer_logs_plant_applied_idx
  ON public.fertilizer_logs (plant_id, applied_on DESC);

COMMENT ON TABLE public.fertilizer_logs IS 'Optional history of fertilizer applications; plants.last_fertilized remains the schedule anchor';
