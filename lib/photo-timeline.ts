/** Value for `<input type="datetime-local" />` in local time. */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local string to ISO for PostgREST `timestamptz`. */
export function datetimeLocalToIsoUtc(value: string): string | null {
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

/** Prefer file last-modified (often EXIF-related on mobile); else now. */
export function defaultPhotoTimelineFromFile(file: File): string {
  if (typeof file.lastModified === 'number' && file.lastModified > 0) {
    return toDatetimeLocalValue(new Date(file.lastModified));
  }
  return toDatetimeLocalValue(new Date());
}
