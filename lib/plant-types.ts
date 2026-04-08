export type FertilizerSeason = 'winter' | 'spring' | 'summer' | 'fall';

export type Plant = {
  id: string;
  name: string;
  species?: string;
  container_type: string;
  pot_size: string;
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
