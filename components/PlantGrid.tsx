'use client';

import type { Plant } from '@/lib/plant-types';
import { PlantCard } from '@/components/PlantCard';

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
  return (
    <div className="mb-16 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {plants.map((plant) => (
        <PlantCard
          key={plant.id}
          plant={plant}
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
