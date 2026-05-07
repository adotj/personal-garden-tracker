'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { Plant } from '@/lib/plant-types';
import { format, addDays, differenceInDays, isValid } from 'date-fns';
import { fertilizerDueSoonOrOverdue, fertilizerUrgency, formatNextFertilizationDue } from '@/lib/fertilizer-schedule';
import { isPlantCareDateToday } from '@/lib/plant-helpers';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Droplet, Edit, Sprout, Trash2 } from 'lucide-react';

function safeFormatDue(iso: string | null, freqDays: number): string {
  if (!iso || freqDays < 1) return '';
  const last = new Date(iso);
  const due = addDays(last, freqDays);
  if (!isValid(last) || !isValid(due)) return '';
  return format(due, 'MMM d');
}

function waterDueSoon(plant: Plant): boolean {
  if (!plant.last_watered) return true;
  const freq = plant.watering_frequency_days || 7;
  const last = new Date(plant.last_watered);
  const due = addDays(last, freq);
  if (!isValid(last) || !isValid(due)) return true;
  return differenceInDays(due, new Date()) <= 2;
}

type PlantCardProps = {
  plant: Plant;
  isDemoMode: boolean;
  onMarkWatered: (id: string, name: string) => void;
  onMarkFertilized: (id: string, name: string) => void;
  onEdit: (plant: Plant) => void;
  onDelete: (id: string, name: string) => void;
};

export function PlantCard({
  plant,
  isDemoMode,
  onMarkWatered,
  onMarkFertilized,
  onEdit,
  onDelete,
}: PlantCardProps) {
  const showWaterDue = waterDueSoon(plant);
  const showFertStress = fertilizerDueSoonOrOverdue(plant);
  const fertU = fertilizerUrgency(plant);

  return (
    <Card
      className="overflow-hidden border border-desert-border bg-desert-parchment/95 shadow-sm"
    >
      <CardContent className="space-y-2 p-3">
        {plant.photo_url ? (
          <Link
            href={`/plant/${plant.id}`}
            className="relative block h-20 overflow-hidden rounded-lg bg-desert-dune"
            aria-label={`Open ${plant.name} profile`}
          >
            <Image
              src={plant.photo_url}
              alt={plant.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              priority={false}
              quality={70}
            />
          </Link>
        ) : (
          <div className="flex h-20 items-center justify-center rounded-lg bg-desert-dune text-[11px] text-desert-dust">
            No photo
          </div>
        )}
        <Link
          href={`/plant/${plant.id}`}
          className="line-clamp-2 text-sm font-semibold leading-tight text-oasis hover:underline"
        >
          {plant.name}
        </Link>
        <p className="line-clamp-1 text-xs text-desert-dust">
          {plant.container_type} • {plant.pot_size}
        </p>
        {plant.location_in_garden?.trim() ? (
          <p className="line-clamp-1 text-[11px] text-desert-dust">
            {plant.location_in_garden.trim()}
          </p>
        ) : null}
        <div className="space-y-1 text-[11px]">
          <p
            className={cn(
              showWaterDue
                ? 'font-medium text-orange-600 dark:text-orange-400'
                : 'text-desert-sage',
            )}
          >
            Water due {safeFormatDue(plant.last_watered, plant.watering_frequency_days) || '—'}
          </p>
          <p
            className={cn(
              showFertStress
                ? 'font-medium text-orange-600 dark:text-orange-400'
                : 'text-desert-sage',
            )}
          >
            Fert {formatNextFertilizationDue(plant)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {fertU === 'off_season' ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              Off-season
            </Badge>
          ) : null}
          {fertU === 'overdue' ? (
            <Badge className="bg-red-600 text-[10px] text-white hover:bg-red-600">Fertilize now</Badge>
          ) : null}
          {fertU === 'due_soon' ? (
            <Badge className="bg-amber-600 text-[10px] text-white hover:bg-amber-600">Due soon</Badge>
          ) : null}
          {fertU === 'due_month' ? (
            <Badge variant="outline" className="border-amber-600 text-[10px] text-amber-800 dark:text-amber-300">
              Due this month
            </Badge>
          ) : null}
        </div>
        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            onClick={() => onMarkWatered(plant.id, plant.name)}
            disabled={isDemoMode || isPlantCareDateToday(plant.last_watered)}
            className="h-7 flex-1 rounded-full px-2 text-xs bg-oasis text-white hover:bg-oasis-hover"
          >
            <Droplet className="mr-1 h-3.5 w-3.5" />
            Water
          </Button>
          <Button
            size="sm"
            onClick={() => onMarkFertilized(plant.id, plant.name)}
            disabled={isDemoMode || isPlantCareDateToday(plant.last_fertilized)}
            className="h-7 flex-1 rounded-full px-2 text-xs bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400 disabled:opacity-100 disabled:bg-amber-700/90 disabled:text-amber-50 dark:disabled:bg-amber-500/65 dark:disabled:text-amber-50"
          >
            <Sprout className="mr-1 h-3.5 w-3.5" />
            Fert
          </Button>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 border-desert-border"
            onClick={() => onEdit(plant)}
            disabled={isDemoMode}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 border-desert-border text-red-600"
            onClick={() => onDelete(plant.id, plant.name)}
            disabled={isDemoMode}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
