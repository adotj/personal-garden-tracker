-- Timestamped journal entries per plant (profile “Plant notes”); replaces editing plants.notes as a blob
CREATE TABLE IF NOT EXISTS public.plant_note_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES public.plants (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT plant_note_entries_body_not_blank CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS plant_note_entries_plant_created_idx
  ON public.plant_note_entries (plant_id, created_at DESC);

COMMENT ON TABLE public.plant_note_entries IS 'Append-only style notes on the plant profile; each row is one submission with timestamp';
