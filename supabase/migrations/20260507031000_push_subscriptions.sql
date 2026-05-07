-- Stores Web Push subscriptions for authenticated users (future) or local sessions (phase 1).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT push_subscriptions_identity_required CHECK (
    user_id IS NOT NULL OR (session_id IS NOT NULL AND length(trim(session_id)) > 0)
  ),
  CONSTRAINT push_subscriptions_subscription_is_object CHECK (
    jsonb_typeof(subscription) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS push_subscriptions_session_created_idx
  ON public.push_subscriptions (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_created_idx
  ON public.push_subscriptions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON public.push_subscriptions ((subscription->>'endpoint'));
