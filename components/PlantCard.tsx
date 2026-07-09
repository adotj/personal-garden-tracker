'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { Plant } from '@/lib/plant-types';
import { format, differenceInCalendarDays, isValid } from 'date-fns';
import { fertilizerDueSoonOrOverdue, fertilizerUrgency, formatNextFertilizationDue } from '@/lib/fertilizer-schedule';
import { formatPlantCareInstant, isPlantCareDateToday } from '@/lib/plant-helpers';
import { baseWateringDueDate } from '@/lib/watering-schedule';
import { calculateWateringAdjustment } from '@/lib/weather';
import type { Forecast } from '@/lib/weather';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Droplet, Edit, Leaf, MapPin, Sprout, Trash2 } from 'lucide-react';

function safeFormatDue(due: Date | null): string {
  if (!due || !isValid(due)) return '';
  return format(due, 'MMM d');
}

function waterStatus(due: Date | null): {
  label: string;
  tone: 'overdue' | 'soon' | 'ok' | 'unknown';
} {
  if (!due || !isValid(due)) return { label: 'Set a watering date', tone: 'unknown' };
  const days = differenceInCalendarDays(due, new Date());
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, tone: 'overdue' };
  if (days === 0) return { label: 'Due today', tone: 'soon' };
  if (days <= 2) return { label: `Due in ${days}d`, tone: 'soon' };
  return { label: `Due ${safeFormatDue(due)}`, tone: 'ok' };
}

type PlantCardProps = {
  plant: Plant;
  forecast: Forecast | null;
  isDemoMode: boolean;
  onMarkWatered: (id: string, name: string) => void;
  onMarkFertilized: (id: string, name: string) => void;
  onEdit: (plant: Plant) => void;
  onDelete: (id: string, name: string) => void;
};

export function PlantCard({
  plant,
  forecast,
  isDemoMode,
  onMarkWatered,
  onMarkFertilized,
  onEdit,
  onDelete,
}: PlantCardProps) {
  const baseDueDate = baseWateringDueDate(plant.last_watered, plant.watering_frequency_days);
  const wateringAdjustment = baseDueDate && forecast ? calculateWateringAdjustment(plant, forecast) : null;
  const displayDueDate = wateringAdjustment?.adjustedDueDate ?? baseDueDate;
  const water = waterStatus(displayDueDate);
  const showFertStress = fertilizerDueSoonOrOverdue(plant);
  const fertU = fertilizerUrgency(plant);
  const wateredToday = isPlantCareDateToday(plant.last_watered);
  const fertilizedToday = isPlantCareDateToday(plant.last_fertilized);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-desert-border/70',
        'bg-desert-parchment/90 shadow-[0_1px_0_rgba(47,43,38,0.06)]',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-oasis/35 hover:shadow-md',
        'focus-within:ring-2 focus-within:ring-oasis/30',
        water.tone === 'overdue' && 'border-l-[3px] border-l-orange-600',
        water.tone === 'soon' && 'border-l-[3px] border-l-amber-500',
      )}
    >
      <div className="relative">
        {plant.photo_url ? (
          <Link
            href={`/plant/${plant.id}`}
            className="relative block aspect-[4/3] overflow-hidden bg-desert-dune"
            aria-label={`Open ${plant.name} profile`}
          >
            <Image
              src={plant.photo_url}
              alt={plant.name}
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              priority={false}
              quality={70}
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-desert-ink/45 via-transparent to-transparent"
              aria-hidden
            />
          </Link>
        ) : (
          <Link
            href={`/plant/${plant.id}`}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-desert-dune to-desert-mist text-desert-dust"
            aria-label={`Open ${plant.name} profile`}
          >
            <Leaf className="h-7 w-7 opacity-60" aria-hidden />
            <span className="text-[11px] font-medium">Add a photo</span>
          </Link>
        )}

        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide shadow-sm backdrop-blur-sm',
              water.tone === 'overdue' && 'bg-orange-700/90 text-white',
              water.tone === 'soon' && 'bg-amber-600/90 text-white',
              water.tone === 'ok' && 'bg-oasis/90 text-white',
              water.tone === 'unknown' && 'bg-desert-ink/70 text-white',
            )}
          >
            {water.label}
          </span>
          {fertU === 'overdue' ? (
            <span className="rounded-md bg-red-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm">
              Fertilize
            </span>
          ) : fertU === 'due_soon' ? (
            <span className="rounded-md bg-amber-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm">
              Fert soon
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0 space-y-0.5">
          <Link
            href={`/plant/${plant.id}`}
            className="line-clamp-2 font-heading text-sm font-semibold leading-snug text-oasis transition-colors hover:text-oasis-hover"
          >
            {plant.name}
          </Link>
          {plant.species?.trim() ? (
            <p className="line-clamp-1 text-[11px] italic text-desert-dust">{plant.species.trim()}</p>
          ) : null}
          <p className="line-clamp-1 text-[11px] text-desert-sage">
            {plant.container_type} · {plant.pot_size}
          </p>
          {plant.location_in_garden?.trim() ? (
            <p className="flex items-center gap-1 text-[11px] text-desert-dust">
              <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              <span className="line-clamp-1">{plant.location_in_garden.trim()}</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-0.5 text-[11px] leading-snug">
          <p className={cn(water.tone === 'overdue' || water.tone === 'soon' ? 'font-medium text-orange-700 dark:text-orange-300' : 'text-desert-sage')}>
            Water {safeFormatDue(displayDueDate) || '—'}
            {wateredToday ? <span className="text-oasis"> · done today</span> : null}
          </p>
          <p className={cn(showFertStress ? 'font-medium text-amber-800 dark:text-amber-300' : 'text-desert-sage')}>
            Fert {formatNextFertilizationDue(plant)}
            {fertilizedToday ? <span className="text-oasis"> · done today</span> : null}
          </p>
          {plant.last_watered ? (
            <p className="text-desert-dust/90">Last water {formatPlantCareInstant(plant.last_watered, 'card')}</p>
          ) : null}
        </div>

        {wateringAdjustment && wateringAdjustment.daysShift !== 0 ? (
          <p
            className={cn(
              'rounded-lg px-2 py-1 text-[10px] leading-snug',
              wateringAdjustment.daysShift < 0
                ? 'bg-orange-500/10 text-orange-900 dark:text-orange-200'
                : 'bg-sky-500/10 text-sky-900 dark:text-sky-200',
            )}
          >
            {wateringAdjustment.reason}
          </p>
        ) : null}

        <div className="mt-auto flex gap-1.5 pt-1">
          <Button
            size="sm"
            onClick={() => onMarkWatered(plant.id, plant.name)}
            disabled={isDemoMode || wateredToday}
            aria-label={wateredToday ? `${plant.name} already watered today` : `Mark ${plant.name} watered`}
            className={cn(
              'h-9 min-h-9 flex-1 rounded-xl px-2 text-xs font-semibold transition-transform active:scale-[0.98]',
              wateredToday
                ? 'bg-oasis/25 text-oasis hover:bg-oasis/25'
                : 'bg-oasis text-white hover:bg-oasis-hover',
            )}
          >
            <Droplet className="mr-1 h-3.5 w-3.5" />
            {wateredToday ? 'Watered' : 'Water'}
          </Button>
          <Button
            size="sm"
            onClick={() => onMarkFertilized(plant.id, plant.name)}
            disabled={isDemoMode || fertilizedToday || fertU === 'off_season'}
            title={fertU === 'off_season' ? 'Fertilizer off-season' : undefined}
            aria-label={
              fertU === 'off_season'
                ? `${plant.name} fertilizer off-season`
                : fertilizedToday
                  ? `${plant.name} already fertilized today`
                  : `Mark ${plant.name} fertilized`
            }
            className={cn(
              'h-9 min-h-9 flex-1 rounded-xl px-2 text-xs font-semibold transition-transform active:scale-[0.98]',
              fertU === 'off_season'
                ? 'bg-desert-mist text-desert-dust'
                : fertilizedToday
                  ? 'bg-amber-600/25 text-amber-900 dark:text-amber-200'
                  : 'bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500',
            )}
          >
            <Sprout className="mr-1 h-3.5 w-3.5" />
            {fertilizedToday ? 'Fed' : fertU === 'off_season' ? 'Off' : 'Fert'}
          </Button>
        </div>

        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 border-desert-border/80 text-xs"
            onClick={() => onEdit(plant)}
            disabled={isDemoMode}
            aria-label={`Edit ${plant.name}`}
          >
            <Edit className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-desert-border/80 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => onDelete(plant.id, plant.name)}
            disabled={isDemoMode}
            aria-label={`Delete ${plant.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
