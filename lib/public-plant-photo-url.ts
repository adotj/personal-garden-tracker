/** Public storage path segment for the plant-photos bucket. */
const STORAGE_MARKER = '/storage/v1/object/public/plant-photos/';

/**
 * DB rows may store localhost URLs from import; phones cannot load those via `next/image`.
 * Rebuild the URL using the configured public Supabase API (e.g. Tailscale :8443).
 */
export function publicPlantPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return url;

  const markerIdx = url.indexOf(STORAGE_MARKER);
  if (markerIdx !== -1) {
    return base + url.slice(markerIdx);
  }

  const shortIdx = url.indexOf('/plant-photos/');
  if (shortIdx !== -1) {
    const path = url.slice(shortIdx + '/plant-photos/'.length);
    return `${base}${STORAGE_MARKER}${path}`;
  }

  return url;
}
