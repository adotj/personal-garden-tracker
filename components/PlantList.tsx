'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // shadcn Card (adjust if you use a custom PlantCard)

type Plant = {
  id: string;
  name: string;
  // Add any other fields your plants have (e.g. photo_url, container, species, etc.)
  // Example:
  // photo_url?: string;
  // container?: string;
  // watering_frequency?: number;
};

interface PlantListProps {
  plants: Plant[];
}

export function PlantList({ plants }: PlantListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filter by name + sort by name (client-side – works great even with a fairly large collection)
  const filteredAndSortedPlants = useMemo(() => {
    let filtered = plants.filter((plant) =>
      plant.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (nameA < nameB) return sortOrder === 'asc' ? -1 : 1;
      if (nameA > nameB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [plants, searchTerm, sortOrder]);

  const totalPlants = plants.length;

  return (
    <div className="space-y-6">
      {/* Header with total count + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Plants</h2>
          <p className="text-muted-foreground text-lg">
            Total plants uploaded: <span className="font-semibold text-foreground">{totalPlants}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Filter by name */}
          <Input
            placeholder="Filter by plant name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72"
          />

          {/* Sort by name */}
          <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Sort by name" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Name A–Z</SelectItem>
              <SelectItem value="desc">Name Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Plants grid */}
      {filteredAndSortedPlants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">No plants match your filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedPlants.map((plant) => (
            // ←←← REPLACE THIS CARD WITH YOUR EXISTING PLANT CARD COMPONENT IF YOU HAVE ONE
            // Example: <PlantCard key={plant.id} plant={plant} />
            <Card key={plant.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="p-0">
                {/* If you have photo_url, uncomment and adjust the image source */}
                {/* {plant.photo_url && (
                  <img
                    src={plant.photo_url}
                    alt={plant.name}
                    className="w-full h-48 object-cover"
                  />
                )} */}
              </CardHeader>
              <CardContent className="p-4">
                <CardTitle className="text-xl">{plant.name}</CardTitle>
                {/* Add any other plant details you normally show in a card here */}
                {/* Example:
                <p className="text-sm text-muted-foreground mt-1">{plant.container}</p>
                */}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
