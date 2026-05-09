'use client';

import { formatDistanceToNow, format, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, Trash } from 'lucide-react';
import type { Activity } from '@/lib/garden-types';

function formatActivityWhen(iso: string): string {
  const d = new Date(iso);
  return isValid(d) ? format(d, "EEE, MMM d, yyyy 'at' h:mm a") : iso;
}

function activityRelativeTime(iso: string): string {
  const d = new Date(iso);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '';
}

function activityPrimaryLine(log: Activity): string {
  const name = log.plant_name?.trim();
  const quoted = name ? `“${name}”` : null;
  switch (log.action) {
    case 'Rainy Day':
      return 'Rainy day — watered every plant';
    case 'Plant Watered':
      return quoted ? `Watered ${quoted}` : 'Plant watered';
    case 'Plant Fertilized':
      return quoted ? `Fertilized ${quoted}` : 'Plant fertilized';
    case 'Fertilizer Schedule Updated':
      return quoted ? `Updated fertilizer schedule for ${quoted}` : 'Fertilizer schedule updated';
    case 'Plant Added':
      return quoted ? `Added ${quoted} to the garden` : 'Plant added';
    case 'Plant Edited':
      return quoted ? `Updated ${quoted}` : 'Plant updated';
    case 'Plant Deleted':
      return quoted ? `Removed ${quoted} from the garden` : 'Plant removed';
    case 'Photo Updated':
      return quoted ? `New homepage photo for ${quoted}` : 'Photo updated';
    default:
      return quoted ? `${log.action} — ${quoted}` : log.action;
  }
}

type ActivityLogProps = {
  activities: Activity[];
  isDemoMode: boolean;
  onClearActivityLog: () => void;
};

export function ActivityLog({
  activities,
  isDemoMode,
  onClearActivityLog,
}: ActivityLogProps) {
  return (
    <Card className="bg-desert-parchment border border-desert-border rounded-3xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Recent Activity</CardTitle>
        <Button variant="destructive" size="sm" onClick={onClearActivityLog} disabled={isDemoMode}>
          <Trash className="h-4 w-4 mr-1" /> Clear Log
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
          {activities.length === 0 ? (
            <p className="text-center py-8 text-desert-dust">No activity yet</p>
          ) : (
            activities.map((log) => {
              const when = formatActivityWhen(log.created_at);
              const rel = activityRelativeTime(log.created_at);
              return (
                <div
                  key={log.id}
                  className="border-b border-desert-mist py-3.5 last:border-0 last:pb-0 first:pt-0"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium text-desert-ink leading-snug">
                        {activityPrimaryLine(log)}
                      </p>
                      {log.details ? (
                        <p className="text-sm text-desert-sage leading-relaxed">
                          {log.details}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-left sm:max-w-[11rem] sm:text-right">
                      <time
                        dateTime={log.created_at}
                        title={when}
                        className="block text-xs font-medium text-desert-dust"
                      >
                        {when}
                      </time>
                      <span className="mt-0.5 block text-[11px] text-desert-dust/85">
                        {rel}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
