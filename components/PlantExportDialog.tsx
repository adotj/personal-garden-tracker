'use client';

import { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PlantEnvironment } from '@/lib/plant-environment';
import { plantEnvironmentLabel } from '@/lib/plant-environment';
import { supabase } from '@/lib/supabase';
import {
  type ExportEnvironmentFilter,
  fetchGardenExportData,
  gardenExportFilename,
  gardenExportToCsv,
  gardenExportToJson,
  triggerBrowserDownload,
} from '@/lib/garden-export';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type ExportFormat = 'json' | 'csv';

type PlantExportDialogProps = {
  defaultEnvironment: PlantEnvironment;
  disabled?: boolean;
};

const ENVIRONMENT_OPTIONS: { value: ExportEnvironmentFilter; label: string }[] = [
  { value: 'all', label: 'All plants' },
  { value: 'outdoor', label: 'Outdoor only' },
  { value: 'indoor', label: 'Indoor only' },
];

export function PlantExportDialog({ defaultEnvironment, disabled }: PlantExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [environmentFilter, setEnvironmentFilter] = useState<ExportEnvironmentFilter>(defaultEnvironment);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [busy, setBusy] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setEnvironmentFilter(defaultEnvironment);
    }
  };

  const runExport = async () => {
    setBusy(true);
    try {
      const result = await fetchGardenExportData(supabase, environmentFilter);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const { document } = result;
      if (document.plantCount === 0) {
        toast.info('No plants match that filter — nothing to export.');
        return;
      }

      const filename = gardenExportFilename(format, environmentFilter);
      if (format === 'json') {
        triggerBrowserDownload(gardenExportToJson(document), filename, 'application/json;charset=utf-8');
      } else {
        triggerBrowserDownload(gardenExportToCsv(document), filename, 'text/csv;charset=utf-8');
      }

      toast.success(
        `Downloaded ${document.plantCount} plant${document.plantCount === 1 ? '' : 's'} as ${format.toUpperCase()}.`,
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 rounded-full px-3 text-xs sm:text-sm"
          disabled={disabled}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(92vh,640px)] w-full max-w-[95vw] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-oasis">Export plant data</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-desert-sage">
          Read-only backup for import into another tool. Uses your signed-in session — nothing is changed on the
          server.
        </p>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="mb-2 block text-sm font-medium">Environment</Label>
            <div
              className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap"
              role="radiogroup"
              aria-label="Export environment filter"
            >
              {ENVIRONMENT_OPTIONS.map((opt) => {
                const active = environmentFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={busy}
                    className={cn(
                      'min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:min-w-[7.5rem]',
                      active
                        ? 'border-oasis bg-oasis/10 text-oasis ring-1 ring-oasis/30'
                        : 'border-desert-border bg-desert-parchment/60 text-desert-ink hover:bg-desert-mist/40 dark:bg-zinc-900/50',
                    )}
                    onClick={() => setEnvironmentFilter(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium">Format</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Export file format">
              {(
                [
                  {
                    value: 'json' as const,
                    title: 'JSON',
                    hint: 'Full fidelity — nested photos, logs, and journal notes.',
                    icon: FileJson,
                  },
                  {
                    value: 'csv' as const,
                    title: 'CSV',
                    hint: 'One row per plant; related logs in JSON columns.',
                    icon: FileSpreadsheet,
                  },
                ] as const
              ).map(({ value, title, hint, icon: Icon }) => {
                const active = format === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={busy}
                    className={cn(
                      'flex min-h-[4.5rem] flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                      active
                        ? 'border-oasis bg-oasis/10 ring-1 ring-oasis/30'
                        : 'border-desert-border bg-desert-parchment/60 hover:bg-desert-mist/40 dark:bg-zinc-900/50',
                    )}
                    onClick={() => setFormat(value)}
                  >
                    <span className="flex items-center gap-2 font-semibold text-desert-ink dark:text-zinc-100">
                      <Icon className="h-4 w-4 text-oasis" aria-hidden />
                      {title}
                    </span>
                    <span className="text-xs text-desert-dust dark:text-zinc-400">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-desert-border/70 bg-desert-dune/30 px-3 py-3 text-xs text-desert-dust dark:text-zinc-400">
            <p className="font-medium text-desert-ink dark:text-zinc-200">Included fields</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>All plant table columns (name, species, {plantEnvironmentLabel('outdoor').toLowerCase()}/indoor, pot, sun, watering &amp; fertilizer schedule, notes, photo URL, timestamps)</li>
              <li>Timeline photo URLs, fertilizer history, journal entries</li>
              <li>Up to 120 recent activity log rows per plant (by name)</li>
            </ul>
          </div>

          <Button
            type="button"
            className="w-full rounded-full bg-oasis py-6 text-base hover:bg-oasis-hover"
            disabled={busy}
            onClick={() => void runExport()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Preparing download…
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Download {format.toUpperCase()}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
