export type FertilizerSeason = 'winter' | 'spring' | 'summer' | 'fall';

/** Where the container sits — important for desert heat / scorch */
export type SunExposure = 'full_sun' | 'partial_sun' | 'partial_shade' | 'full_shade';

export const SUN_EXPOSURE_OPTIONS: readonly { value: SunExposure; label: string; hint: string }[] = [
  {
    value: 'full_sun',
    label: 'Full sun',
    hint: '6+ hours direct sun (typical open patio or yard)',
  },
  {
    value: 'partial_sun',
    label: 'Partial sun',
    hint: 'Mix of direct sun and shade during the day',
  },
  {
    value: 'partial_shade',
    label: 'Partial shade',
    hint: 'Filtered light, brief direct sun, or bright shade',
  },
  {
    value: 'full_shade',
    label: 'Full shade',
    hint: 'Mostly indirect light; little or no direct sun',
  },
] as const;

export function sunExposureLabel(v: string | null | undefined): string {
  const found = SUN_EXPOSURE_OPTIONS.find((o) => o.value === v);
  return found?.label ?? 'Full sun';
}

export type Plant = {
  id: string;
  name: string;
  species?: string;
  container_type: string;
  pot_size: string;
  /** Light conditions for this container placement */
  sun_exposure?: SunExposure | null;
  watering_frequency_days: number;
  last_watered: string | null;
  /** Days between fertilizer applications during active {@link fertilizer_seasons} */
  fertilizer_frequency_days: number;
  /** Last fertilization date (`yyyy-MM-dd`), nullable */
  last_fertilized: string | null;
  /** Which seasons (NH calendar) allow fertilizing; empty/omit means all seasons at runtime */
  fertilizer_seasons?: FertilizerSeason[] | null;
  /** Optional product / method notes */
  fertilizer_notes?: string | null;
  /** Legacy single-field note (optional); new journal uses {@link PlantNoteEntry} */
  notes?: string | null;
  location_in_garden?: string;
  /** Shown on homepage / plant cards — the “key” photo */
  photo_url?: string | null;
};

export type PlantPhoto = {
  id: string;
  plant_id: string;
  photo_url: string;
  created_at: string;
};

export type FertilizerLogRow = {
  id: string;
  plant_id: string;
  applied_on: string;
  notes: string | null;
  created_at: string;
};

/** One timestamped note on the plant profile journal */
export type PlantNoteEntry = {
  id: string;
  plant_id: string;
  body: string;
  created_at: string;
};
