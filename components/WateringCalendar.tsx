'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Plant } from '@/lib/plant-types';
import { buildWateringCalendar } from '@/lib/watering-calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Droplet } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

type Props = {
  plants: Plant[];
  numDays?: number;
};

export function WateringCalendar({ plants, numDays = 14 }: Props) {
  const rows = useMemo(() => buildWateringCalendar(plants, numDays), [plants, numDays]);
  const today = useMemo(() => new Date(), []);

  if (plants.length === 0) return null;

  const rangeLabel = `${format(rows[0]?.at ?? today, 'MMM d')} – ${format(rows[rows.length - 1]?.at ?? today, 'MMM d, yyyy')}`;

  return (
    <Card className="mb-10 border-sky-800/20 bg-gradient-to-br from-sky-50/90 to-desert-parchment dark:from-sky-950/35 dark:to-zinc-900 dark:border-sky-900/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          Watering — next {numDays} days
        </CardTitle>
        <p className="text-sm text-desert-dust dark:text-zinc-400">
          Based on each plant’s last watered date and water-every interval. {rangeLabel}. If a plant had no last
          watered date, it shows on the first day only — set dates on the plant or profile after you water.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const isToday = isSameDay(row.at, today);
          return (
            <div
              key={row.dateKey}
              className={cn(
                'rounded-2xl border px-3 py-3 sm:px-4',
                isToday
                  ? 'border-sky-500/60 bg-sky-50/90 dark:border-sky-500/40 dark:bg-sky-950/50'
                  : 'border-desert-mist/80 bg-white/60 dark:border-zinc-700 dark:bg-zinc-800/40',
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <Droplet className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
                  <time
                    dateTime={row.dateKey}
                    className={cn(
                      'text-sm font-semibold',
                      isToday ? 'text-sky-800 dark:text-sky-200' : 'text-desert-ink dark:text-zinc-200',
                    )}
                  >
                    {format(row.at, 'EEEE, MMM d')}
                    {isToday ? (
                      <Badge className="ml-2 align-middle bg-sky-600 text-white hover:bg-sky-600 text-[10px] px-1.5 py-0">
                        Today
                      </Badge>
                    ) : null}
                  </time>
                </div>
                <div className="min-w-0 flex-1">
                  {row.plants.length === 0 ? (
                    <p className="text-sm text-desert-dust dark:text-zinc-500">Nothing scheduled</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {row.plants.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/plant/${p.id}`}
                            className="inline-flex items-center rounded-full border border-desert-border bg-white/90 px-2.5 py-1 text-xs font-medium text-oasis hover:bg-sky-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-emerald-400 dark:hover:bg-zinc-700"
                          >
                            {p.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
