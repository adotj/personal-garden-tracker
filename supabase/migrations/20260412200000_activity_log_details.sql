-- Optional longer descriptions for the home “Recent activity” feed
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS details text;

COMMENT ON COLUMN public.activity_logs.details IS 'Extra context shown under the action in the activity feed';
