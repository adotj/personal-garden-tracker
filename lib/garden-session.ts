export const GARDEN_AUTH_KEY = 'gardenAuthenticated';
export const GARDEN_MODE_KEY = 'gardenMode';

export type GardenMode = 'demo' | 'real';

export function getGardenMode(): GardenMode | null {
  if (typeof window === 'undefined') return null;
  const m = localStorage.getItem(GARDEN_MODE_KEY);
  if (m === 'demo' || m === 'real') return m;
  return null;
}

export function isGardenAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(GARDEN_AUTH_KEY) === 'true';
}
