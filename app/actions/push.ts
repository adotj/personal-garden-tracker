'use server';

import type { ActionResult } from '@/lib/garden-types';
import { sendWebPushNotification, type PushSubscriptionPayload } from '@/lib/push';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type SavePushSubscriptionInput = {
  sessionId: string;
  subscription: PushSubscriptionPayload;
};

type SendTestPushInput = {
  sessionId: string;
  plantCount: number;
};

type PushRow = {
  id: string;
  subscription: unknown;
};

function normalizeSessionId(raw: string): string {
  return raw.trim().slice(0, 128);
}

function parseSubscription(raw: unknown): PushSubscriptionPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybe = raw as Partial<PushSubscriptionPayload>;
  if (!maybe.endpoint || typeof maybe.endpoint !== 'string') return null;
  if (!maybe.keys || typeof maybe.keys !== 'object') return null;
  if (typeof maybe.keys.p256dh !== 'string' || typeof maybe.keys.auth !== 'string') return null;
  return {
    endpoint: maybe.endpoint,
    expirationTime: maybe.expirationTime ?? null,
    keys: {
      p256dh: maybe.keys.p256dh,
      auth: maybe.keys.auth,
    },
  };
}

function isSubscriptionExpiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const statusCode = (error as { statusCode?: number }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function savePushSubscriptionAction(
  input: SavePushSubscriptionInput,
): Promise<ActionResult<null>> {
  try {
    const sessionId = normalizeSessionId(input.sessionId);
    if (!sessionId) return { ok: false, error: 'Missing local session id.' };
    const subscription = parseSubscription(input.subscription);
    if (!subscription) return { ok: false, error: 'Invalid subscription payload.' };

    const supabase = createSupabaseServerClient();
    const { data: existingRows, error: existingError } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('session_id', sessionId)
      .limit(200);

    if (existingError) return { ok: false, error: existingError.message || 'Failed to load subscriptions.' };

    const duplicateIds =
      (existingRows as PushRow[] | null)
        ?.filter((row) => {
          const existing = parseSubscription(row.subscription);
          return existing?.endpoint === subscription.endpoint;
        })
        .map((row) => row.id) ?? [];

    if (duplicateIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', duplicateIds);
      if (deleteError) return { ok: false, error: deleteError.message || 'Failed to replace subscription.' };
    }

    const { error: insertError } = await supabase.from('push_subscriptions').insert({
      session_id: sessionId,
      subscription,
    });
    if (insertError) return { ok: false, error: insertError.message || 'Failed to save subscription.' };

    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save subscription.' };
  }
}

export async function sendTestPushNotificationAction(
  input: SendTestPushInput,
): Promise<ActionResult<null>> {
  try {
    const sessionId = normalizeSessionId(input.sessionId);
    if (!sessionId) return { ok: false, error: 'Missing local session id.' };

    const supabase = createSupabaseServerClient();
    const { data: row, error: fetchError } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) return { ok: false, error: fetchError.message || 'Could not load subscription.' };
    if (!row) return { ok: false, error: 'Enable notifications first on this device.' };

    const subscription = parseSubscription((row as PushRow).subscription);
    if (!subscription) return { ok: false, error: 'Saved subscription is invalid. Re-enable notifications.' };

    try {
      await sendWebPushNotification(subscription, {
        title: 'Laveen Garden test notification 🌿',
        body:
          input.plantCount > 0
            ? `You have ${input.plantCount} plant${input.plantCount === 1 ? '' : 's'} in your garden.`
            : 'Your garden app is ready for reminders.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'laveen-garden-test',
        url: '/',
        timestamp: Date.now(),
      });
    } catch (pushError) {
      if (isSubscriptionExpiredError(pushError)) {
        await supabase.from('push_subscriptions').delete().eq('id', row.id);
        return { ok: false, error: 'Subscription expired. Enable notifications again.' };
      }
      throw pushError;
    }

    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to send test notification.' };
  }
}
