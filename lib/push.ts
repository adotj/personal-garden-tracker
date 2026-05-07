import webpush from 'web-push';

export type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type PushMessagePayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  timestamp?: number;
  requireInteraction?: boolean;
};

let vapidConfigured = false;

function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  const value = raw?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function ensureVapidConfiguration() {
  if (vapidConfigured) return;
  const publicKey = readRequiredEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const privateKey = readRequiredEnv('VAPID_PRIVATE_KEY');
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:notifications@laveen-garden.local';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export function getVapidPublicKey() {
  return readRequiredEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
}

export async function sendWebPushNotification(
  subscription: PushSubscriptionPayload,
  payload: PushMessagePayload,
) {
  ensureVapidConfiguration();
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
