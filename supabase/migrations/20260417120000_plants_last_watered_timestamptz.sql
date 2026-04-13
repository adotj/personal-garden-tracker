-- Preserve time when logging watering (app sends ISO timestamps from "Watered" actions).
-- If `last_watered` is still `date`, Postgres truncates time; widen to timestamptz once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plants'
      AND column_name = 'last_watered'
      AND udt_name = 'date'
  ) THEN
    ALTER TABLE public.plants
      ALTER COLUMN last_watered TYPE timestamp with time zone
      USING (last_watered::timestamptz);
  END IF;
END $$;
