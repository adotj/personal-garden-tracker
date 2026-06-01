export type PlantEnvironment = 'indoor' | 'outdoor';

export const PLANT_ENVIRONMENTS: readonly PlantEnvironment[] = ['outdoor', 'indoor'] as const;

export function normalizePlantEnvironment(raw: unknown): PlantEnvironment {
  return raw === 'indoor' ? 'indoor' : 'outdoor';
}

export function plantEnvironmentLabel(env: PlantEnvironment): string {
  return env === 'indoor' ? 'Indoor' : 'Outdoor';
}

export function plantEnvironmentEmoji(env: PlantEnvironment): string {
  return env === 'indoor' ? '🪴' : '🌵';
}
