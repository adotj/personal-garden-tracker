/**
 * One-time garden cloud → local Supabase import (public tables + optional storage URLs rewrite).
 *
 * Requires homelab/.env.import:
 *   CLOUD_SUPABASE_URL=https://ofhlfbilojlbqmddfwpx.supabase.co
 *   CLOUD_SERVICE_ROLE_KEY=...
 *   LOCAL_SUPABASE_URL=http://127.0.0.1:54321
 *   LOCAL_SERVICE_ROLE_KEY=...  (from: npx supabase status -o env)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const importEnvPath = resolve(__dirname, '../../homelab/.env.import');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = { ...process.env, ...loadEnvFile(importEnvPath) };
const cloudUrl = env.CLOUD_SUPABASE_URL;
const cloudKey = env.CLOUD_SERVICE_ROLE_KEY;
const localUrl = env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321';
/** URLs stored in DB should be reachable from phones (Tailscale), not 127.0.0.1. */
const localPublicUrl = (env.LOCAL_PUBLIC_SUPABASE_URL || env.PHOTO_PUBLIC_BASE || localUrl).replace(
  /\/$/,
  '',
);
const localKey = env.LOCAL_SERVICE_ROLE_KEY;

if (!cloudUrl || !cloudKey || !localKey) {
  console.error(
    'Missing env. Copy homelab/.env.import.example → homelab/.env.import and set CLOUD_SERVICE_ROLE_KEY + LOCAL_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

const cloud = createClient(cloudUrl, cloudKey, { auth: { persistSession: false } });
const local = createClient(localUrl, localKey, { auth: { persistSession: false } });

const LOCAL_API_PREFIX = `${localPublicUrl}/storage/v1/object/public/plant-photos/`;

function rewritePhotoUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const i = url.indexOf('/plant-photos/');
  if (i === -1) return url;
  return LOCAL_API_PREFIX + url.slice(i + '/plant-photos/'.length);
}

const PLANT_COLUMNS = [
  'id',
  'created_at',
  'name',
  'species',
  'container_type',
  'pot_size',
  'watering_frequency_days',
  'last_watered',
  'last_fertilized',
  'photo_url',
  'location_in_garden',
  'notes',
  'fertilizer_frequency_days',
  'fertilizer_seasons',
  'fertilizer_notes',
  'sun_exposure',
  'environment',
];

function pickPlant(row) {
  const out = {};
  for (const k of PLANT_COLUMNS) {
    if (row[k] !== undefined) out[k] = row[k];
  }
  if (out.photo_url) out.photo_url = rewritePhotoUrl(out.photo_url);
  if (out.last_watered && String(out.last_watered).length === 10) {
    out.last_watered = `${out.last_watered}T12:00:00.000Z`;
  }
  return out;
}

async function copyTable(table, transform = (r) => r, batchSize = 200) {
  let from = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await cloud.from(table).select('*').range(from, from + batchSize - 1);
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    const rows = data.map(transform);
    const { error: insErr } = await local.from(table).upsert(rows, { onConflict: 'id' });
    if (insErr) throw new Error(`${table} write: ${insErr.message}`);
    total += rows.length;
    from += batchSize;
    if (data.length < batchSize) break;
  }
  console.log(`${table}: ${total} rows`);
}

async function copyStorageObjects() {
  const { data: list, error } = await cloud.storage.from('plant-photos').list('', { limit: 1000 });
  if (error) {
    console.warn('storage list:', error.message);
    return;
  }
  let n = 0;
  for (const item of list ?? []) {
    if (!item.name || item.name.endsWith('/')) continue;
    const path = item.name;
    const { data: blob, error: dlErr } = await cloud.storage.from('plant-photos').download(path);
    if (dlErr) {
      console.warn('skip download', path, dlErr.message);
      continue;
    }
    const { error: upErr } = await local.storage.from('plant-photos').upload(path, blob, {
      upsert: true,
      contentType: blob.type || 'image/jpeg',
    });
    if (upErr) {
      console.warn('skip upload', path, upErr.message);
      continue;
    }
    n++;
  }
  console.log(`plant-photos storage: ${n} files copied`);
}

async function main() {
  console.log('Importing public data cloud → local...');
  await copyTable('plants', pickPlant);
  await copyTable('plant_photos', (r) => ({
    ...r,
    photo_url: rewritePhotoUrl(r.photo_url),
  }));
  await copyTable('activity_logs');
  await copyTable('plant_note_entries');
  await copyTable('fertilizer_logs');
  await copyStorageObjects();
  console.log('Done. Create auth user if needed: npx supabase auth admin create-user --email you@example.com');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
