'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { savePushSubscriptionAction, sendTestPushNotificationAction } from '@/app/actions/push';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type PushNotificationCardProps = {
  isDemoMode: boolean;
  plantCount: number;
};

type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const PUSH_SESSION_KEY = 'gardenPushSessionId';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function getOrCreatePushSessionId() {
  const existing = localStorage.getItem(PUSH_SESSION_KEY)?.trim();
  if (existing) return existing;
  const generated = crypto.randomUUID();
  localStorage.setItem(PUSH_SESSION_KEY, generated);
  return generated;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function normalizeSubscription(subscription: PushSubscription | null): PushSubscriptionPayload | null {
  if (!subscription) return null;
  const raw = subscription.toJSON() as {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
  };
  if (
    !raw.endpoint ||
    !raw.keys ||
    typeof raw.keys.p256dh !== 'string' ||
    typeof raw.keys.auth !== 'string'
  ) {
    return null;
  }
  return {
    endpoint: raw.endpoint,
    expirationTime: raw.expirationTime ?? null,
    keys: {
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    },
  };
}

export function PushNotificationCard({ isDemoMode, plantCount }: PushNotificationCardProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const inspect = async () => {
      const supported =
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        window.isSecureContext;

      if (!supported) {
        if (!cancelled) {
          setIsSupported(false);
          setChecking(false);
        }
        return;
      }

      setIsSupported(true);
      setPermission(Notification.permission);

      try {
        const registration = await navigator.serviceWorker.ready;
        const current = await registration.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(Boolean(normalizeSubscription(current)));
      } catch {
        if (!cancelled) setIsSubscribed(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void inspect();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle = useMemo(() => {
    if (!isSupported) return 'Push notifications are not supported on this browser/device.';
    if (permission === 'granted' && isSubscribed) return 'Notifications are enabled on this device.';
    if (permission === 'denied') return 'Notifications are blocked in browser settings.';
    return 'Get native-style reminders right from your Home Screen.';
  }, [isSupported, permission, isSubscribed]);

  const enableNotifications = async () => {
    if (isDemoMode) {
      toast.info('Push notifications are disabled in demo mode.');
      return;
    }
    if (!isSupported) {
      toast.error('This browser does not support push notifications.');
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      toast.error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.');
      return;
    }

    setEnabling(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        toast.info('Allow notifications to enable reminders.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }

      const normalized = normalizeSubscription(subscription);
      if (!normalized) {
        toast.error('Could not read the push subscription.');
        return;
      }

      const result = await savePushSubscriptionAction({
        sessionId: getOrCreatePushSessionId(),
        subscription: normalized,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setIsSubscribed(true);
      toast.success('Notifications enabled. You can send a test now.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enable notifications.');
    } finally {
      setEnabling(false);
    }
  };

  const sendTest = async () => {
    if (isDemoMode) {
      toast.info('Push notifications are disabled in demo mode.');
      return;
    }
    setSending(true);
    try {
      const result = await sendTestPushNotificationAction({
        sessionId: getOrCreatePushSessionId(),
        plantCount,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Test notification sent.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send test notification.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="mb-10 border-desert-border bg-desert-parchment/95 shadow-sm dark:bg-zinc-900 dark:border-zinc-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {permission === 'granted' && isSubscribed ? (
            <Bell className="h-5 w-5 text-oasis dark:text-emerald-400" />
          ) : (
            <BellOff className="h-5 w-5 text-desert-dust dark:text-zinc-300" />
          )}
          Mobile notifications
        </CardTitle>
        <p className="text-sm text-desert-dust dark:text-zinc-300">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          className="rounded-full bg-oasis hover:bg-oasis-hover"
          disabled={isDemoMode || enabling || checking || !isSupported}
          onClick={() => void enableNotifications()}
        >
          {enabling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
          {permission === 'granted' && isSubscribed ? 'Notifications enabled' : 'Enable notifications'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-desert-border"
          disabled={isDemoMode || sending || checking || !isSupported}
          onClick={() => void sendTest()}
        >
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send test notification
        </Button>
      </CardContent>
    </Card>
  );
}
