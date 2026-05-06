import type { FertilizerSeason, Plant, SunExposure } from '@/lib/plant-types';

export type Activity = {
  id: string;
  action: string;
  plant_name?: string;
  details?: string;
  created_at: string;
};

export type WeatherForecastDay = {
  date: string;
  high: number;
  low: number;
  condition: string;
  icon: string;
};

export type GardenWeather = {
  temperature: number;
  condition: string;
  windSpeed: number;
  forecast: WeatherForecastDay[];
};

export type NewPlantForm = {
  name: string;
  species: string;
  container_type: string;
  pot_size: string;
  sun_exposure: SunExposure;
  watering_frequency_days: number | '';
  fertilizer_frequency_days: number | '';
  last_watered: string;
  last_fertilized: string;
  fertilizer_seasons: FertilizerSeason[];
  fertilizer_notes: string;
  location_in_garden: string;
  photo_url: string | null;
};

export type AddPlantInput = {
  plant: {
    name: string;
    container_type: string;
    pot_size: string;
    sun_exposure: SunExposure;
    watering_frequency_days: number;
    fertilizer_frequency_days: number;
    last_watered: string;
    last_fertilized: string;
    fertilizer_seasons: FertilizerSeason[];
    fertilizer_notes: string;
    location_in_garden: string;
    photo_url: string | null;
  };
  photoTimelineAt: string;
};

export type UpdatePlantInput = {
  plant: Plant;
  photoBaseline: string | null;
  photoTimelineAt: string;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
