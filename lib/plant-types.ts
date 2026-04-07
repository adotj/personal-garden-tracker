export type Plant = {
  id: string;
  name: string;
  species?: string;
  container_type: string;
  pot_size: string;
  watering_frequency_days: number;
  last_watered: string | null;
  fertilizer_frequency_days: number;
  last_fertilized: string | null;
  notes?: string;
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
