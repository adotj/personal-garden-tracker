-- Harden personal-garden tables with RLS.
-- Policies allow any authenticated user (single-owner personal app).
-- Anonymous clients cannot read/write. Storage policies for plant-photos
-- should be configured in the Supabase dashboard to match (authenticated upload/delete).

ALTER TABLE IF EXISTS public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plant_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fertilizer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plant_note_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plants') THEN
    DROP POLICY IF EXISTS plants_authenticated_all ON public.plants;
    CREATE POLICY plants_authenticated_all ON public.plants
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_logs') THEN
    DROP POLICY IF EXISTS activity_logs_authenticated_all ON public.activity_logs;
    CREATE POLICY activity_logs_authenticated_all ON public.activity_logs
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plant_photos') THEN
    DROP POLICY IF EXISTS plant_photos_authenticated_all ON public.plant_photos;
    CREATE POLICY plant_photos_authenticated_all ON public.plant_photos
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fertilizer_logs') THEN
    DROP POLICY IF EXISTS fertilizer_logs_authenticated_all ON public.fertilizer_logs;
    CREATE POLICY fertilizer_logs_authenticated_all ON public.fertilizer_logs
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plant_note_entries') THEN
    DROP POLICY IF EXISTS plant_note_entries_authenticated_all ON public.plant_note_entries;
    CREATE POLICY plant_note_entries_authenticated_all ON public.plant_note_entries
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
