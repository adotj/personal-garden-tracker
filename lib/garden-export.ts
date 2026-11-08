import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlantEnvironment } from '@/lib/plant-environment';
import { normalizePlantEnvironment } from '@/lib/plant-environment';
import type { Activity } from '@/lib/garden-types';
import type { FertilizerLogRow, Plant, PlantNoteEntry, PlantPhoto } from '@/lib/plant-types';
import { normalizePlantRow } from '@/lib/plant-helpers';

export type ExportEnvironmentFilter = 'all' | PlantEnvironment;

export const EXPORT_VERSION = 1 as const;

export type ExportPlantRecord = Record<string, unknown> & {
  timeline_photos: PlantPhoto[];
  fertilizer_logs: FertilizerLogRow[];
  note_entries: PlantNoteEntry[];
  activity_logs: Activity[];
};

export type GardenExportDocument = {
  exportVersion: typeof EXPORT_VERSION;
  exportedAt: string;
  app: 'laveen-garden-tracker';
  environmentFilter: ExportEnvironmentFilter;
  plantCount: number;
  plants: ExportPlantRecord[];
};

export type GardenExportResult =
  | { ok: true; document: GardenExportDocument }
  | { ok: false; error: string };

type PlantRowRaw = Record<string, unknown>;

function environmentMatches(row: PlantRowRaw, filter: ExportEnvironmentFilter): boolean {
  if (filter === 'all') return true;
  const env = normalizePlantEnvironment(row.environment as Plant['environment'] | undefined);
  return env === filter;
}

function toCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function serializeCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x === 'string')) return value.join(', ');
    return JSON.stringify(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Stable plant scalar columns for CSV (extras from `select *` are appended after these). */
const CSV_SCALAR_PREFERRED_ORDER = [
  'id',
  'name',
  'species',
  'environment',
  'container_type',
  'pot_size',
  'sun_exposure',
  'location_in_garden',
  'watering_frequency_days',
  'last_watered',
  'fertilizer_frequency_days',
  'last_fertilized',
  'fertilizer_seasons',
  'fertilizer_notes',
  'notes',
  'photo_url',
  'created_at',
] as const;

const CSV_RELATED_COLUMNS = [
  'timeline_photo_count',
  'timeline_photo_urls',
  'fertilizer_logs_json',
  'note_entries_json',
  'activity_logs_json',
] as const;

export function getCsvHeaderColumns(document: GardenExportDocument): string[] {
  const scalarKeys = new Set<string>();
  for (const plant of document.plants) {
    for (const key of Object.keys(plant)) {
      if (
        key === 'timeline_photos' ||
        key === 'fertilizer_logs' ||
        key === 'note_entries' ||
        key === 'activity_logs'
      ) {
        continue;
      }
      scalarKeys.add(key);
    }
  }

  const orderedScalars: string[] = [];
  for (const key of CSV_SCALAR_PREFERRED_ORDER) {
    if (scalarKeys.has(key)) {
      orderedScalars.push(key);
      scalarKeys.delete(key);
    }
  }
  orderedScalars.push(...[...scalarKeys].sort());

  return [...orderedScalars, ...CSV_RELATED_COLUMNS];
}

export function csvHeaderRow(document: GardenExportDocument): string {
  return getCsvHeaderColumns(document).map((h) => toCsvCell(h)).join(',');
}

function plantToCsvRow(plant: ExportPlantRecord, headerColumns: string[]): string {
  const timeline = plant.timeline_photos ?? [];
  const timelineUrls = timeline.map((p) => p.photo_url).filter(Boolean).join('|');

  const relatedValues: Record<(typeof CSV_RELATED_COLUMNS)[number], string> = {
    timeline_photo_count: String(timeline.length),
    timeline_photo_urls: timelineUrls,
    fertilizer_logs_json: JSON.stringify(plant.fertilizer_logs ?? []),
    note_entries_json: JSON.stringify(plant.note_entries ?? []),
    activity_logs_json: JSON.stringify(plant.activity_logs ?? []),
  };

  return headerColumns
    .map((col) => {
      if (col in relatedValues) return toCsvCell(relatedValues[col as keyof typeof relatedValues]);
      const raw = plant[col];
      return toCsvCell(serializeCellValue(raw));
    })
    .join(',');
}

export function gardenExportToCsv(document: GardenExportDocument): string {
  const headerColumns = getCsvHeaderColumns(document);
  const headerLine = headerColumns.map((h) => toCsvCell(h)).join(',');
  const body = document.plants.map((p) => plantToCsvRow(p, headerColumns)).join('\n');
  return `${headerLine}\n${body}\n`;
}

export function gardenExportToJson(document: GardenExportDocument): string {
  return JSON.stringify(document, null, 2);
}

export function gardenExportFilename(
  format: 'json' | 'csv',
  environmentFilter: ExportEnvironmentFilter,
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const zone = environmentFilter === 'all' ? 'all-plants' : environmentFilter;
  return `laveen-garden-export_${zone}_${stamp}.${format}`;
}

export function triggerBrowserDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Read-only export: loads plants and related rows through the authenticated Supabase client (RLS).
 */
export async function fetchGardenExportData(
  supabase: SupabaseClient,
  environmentFilter: ExportEnvironmentFilter,
): Promise<GardenExportResult> {
  let plantQuery = supabase
    .from('plants')
    .select(
      `*,
      plant_photos ( id, plant_id, photo_url, created_at ),
      fertilizer_logs ( id, plant_id, applied_on, notes, created_at ),
      plant_note_entries ( id, plant_id, body, created_at )`,
    )
    .order('created_at', { ascending: false });

  if (environmentFilter !== 'all') {
    plantQuery = plantQuery.eq('environment', environmentFilter);
  }

  const { data: plantRows, error: plantError } = await plantQuery;
  if (plantError) {
    return { ok: false, error: plantError.message || 'Could not load plants for export' };
  }

  const rawPlants = (plantRows ?? []) as Array<
    PlantRowRaw & {
      plant_photos?: PlantPhoto[] | null;
      fertilizer_logs?: FertilizerLogRow[] | null;
      plant_note_entries?: PlantNoteEntry[] | null;
    }
  >;

  const filtered = rawPlants.filter((row) => environmentMatches(row, environmentFilter));
  if (filtered.length === 0) {
    const document: GardenExportDocument = {
      exportVersion: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'laveen-garden-tracker',
      environmentFilter,
      plantCount: 0,
      plants: [],
    };
    return { ok: true, document };
  }

  const plantNames = [
    ...new Set(filtered.map((r) => (typeof r.name === 'string' ? r.name.trim() : '')).filter(Boolean)),
  ];

  const activitiesByPlantName = new Map<string, Activity[]>();
  if (plantNames.length > 0) {
    const { data: activityRows, error: activityError } = await supabase
      .from('activity_logs')
      .select('*')
      .in('plant_name', plantNames)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (activityError) {
      return { ok: false, error: activityError.message || 'Could not load activity log for export' };
    }

    for (const row of (activityRows ?? []) as Activity[]) {
      const name = row.plant_name?.trim();
      if (!name) continue;
      const list = activitiesByPlantName.get(name) ?? [];
      if (list.length >= 120) continue;
      list.push(row);
      activitiesByPlantName.set(name, list);
    }
  }

  const plants: ExportPlantRecord[] = filtered.map((row) => {
    const {
      plant_photos,
      fertilizer_logs,
      plant_note_entries,
      ...scalar
    } = row;

    const exportRow: ExportPlantRecord = {
      ...scalar,
      ...normalizePlantRow(scalar as Plant),
      timeline_photos: [...(plant_photos ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
      fertilizer_logs: [...(fertilizer_logs ?? [])].sort(
        (a, b) => new Date(b.applied_on).getTime() - new Date(a.applied_on).getTime(),
      ),
      note_entries: [...(plant_note_entries ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
      activity_logs: activitiesByPlantName.get(typeof row.name === 'string' ? row.name.trim() : '') ?? [],
    };

    return exportRow;
  });

  return {
    ok: true,
    document: {
      exportVersion: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'laveen-garden-tracker',
      environmentFilter,
      plantCount: plants.length,
      plants,
    },
  };
}
