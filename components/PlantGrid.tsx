'use client';

import { useEffect, useState } from 'react';
import type { Plant } from '@/lib/plant-types';
import { PlantCard } from '@/components/PlantCard';
import type { Forecast } from '@/lib/weather';
import { fetchPhoenixForecast } from '@/lib/weather';

type PlantGridProps = {
  plants: Plant[];
  isDemoMode: boolean;
  onMarkWatered: (id: string, name: string) => void;
  onMarkFertilized: (id: string, name: string) => void;
  onEdit: (plant: Plant) => void;
  onDelete: (id: string, name: string) => void;
};

export function PlantGrid({
  plants,
  isDemoMode,
  onMarkWatered,
  onMarkFertilized,
  onEdit,
  onDelete,
}: PlantGridProps) {
  const [forecast, setForecast] = useState<Forecast | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPhoenixForecast()
      .then((data) => {
        if (!cancelled) setForecast(data);
      })
      .catch(() => {
        if (!cancelled) setForecast(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mb-16 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {plants.map((plant) => (
        <PlantCard
          key={plant.id}
          plant={plant}
          forecast={forecast}
          isDemoMode={isDemoMode}
          onMarkWatered={onMarkWatered}
          onMarkFertilized={onMarkFertilized}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
