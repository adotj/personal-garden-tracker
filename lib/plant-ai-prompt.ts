import { format, isValid, parseISO } from 'date-fns';
import type { Plant, PlantNoteEntry } from '@/lib/plant-types';
import { sunExposureLabel } from '@/lib/plant-types';
import { formatPlantCareInstant } from '@/lib/plant-helpers';
import {
  fertilizerUrgency,
  formatNextFertilizationDue,
  normalizeFertilizerSeasons,
  seasonLabel,
} from '@/lib/fertilizer-schedule';

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'MMMM d, yyyy') : String(iso);
}

function describeFertilizerUrgency(plant: Plant): string {
  const u = fertilizerUrgency(plant);
  const map: Record<string, string> = {
    overdue: 'Overdue for fertilization (within an active fertilizer season).',
    due_soon: 'Due for fertilization within about a week.',
    due_month: 'Due for fertilization later this calendar month.',
    later: 'Next fertilization is not imminent by the app schedule.',
    off_season: 'Currently outside the plant’s configured fertilizer seasons.',
  };
  return map[u] ?? u;
}

/**
 * Plain-text prompt for pasting into an AI assistant for plant troubleshooting / care advice.
 */
export function buildPlantTroubleshootingPrompt(
  plant: Plant,
  opts?: { journalEntries?: PlantNoteEntry[]; maxJournalEntries?: number },
): string {
  const lines: string[] = [];
  const journal = opts?.journalEntries ?? [];
  const maxJ = opts?.maxJournalEntries ?? 15;
  const journalSlice = journal.slice(0, maxJ);

  lines.push('You are helping diagnose or advise on a container plant. Use the structured facts below.');
  lines.push('The grower may follow up with symptoms, photos, or questions.');
  lines.push('');
  lines.push('## Garden context');
  lines.push('- **Climate:** Low desert / hot, dry conditions (southwest US). Intense sun and heat stress small containers quickly.');
  lines.push('- **Setup:** Container garden (pots, grow bags, or raised containers), not in-ground landscape.');
  lines.push('');
  lines.push('## Plant identity');
  lines.push(`- **Name (as recorded):** ${plant.name}`);
  if (plant.species?.trim()) lines.push(`- **Species / cultivar (if provided):** ${plant.species.trim()}`);
  if (plant.location_in_garden?.trim()) lines.push(`- **Spot in garden:** ${plant.location_in_garden.trim()}`);
  lines.push('');
  lines.push('## Container & light');
  lines.push(`- **Container:** ${plant.container_type}, ${plant.pot_size}`);
  lines.push(`- **Sun exposure:** ${sunExposureLabel(plant.sun_exposure)}`);
  lines.push('');
  lines.push('## Watering');
  lines.push(`- **Scheduled interval:** every ${plant.watering_frequency_days} day(s)`);
  lines.push(
    `- **Last watered (recorded):** ${plant.last_watered ? formatPlantCareInstant(plant.last_watered, 'profile') : 'Not recorded'}`,
  );
  lines.push('');
  lines.push('## Fertilizing');
  const seasons = normalizeFertilizerSeasons(plant.fertilizer_seasons);
  lines.push(`- **Interval during active seasons:** every ${plant.fertilizer_frequency_days} day(s)`);
  lines.push(`- **Fertilizer seasons (Northern Hemisphere calendar):** ${seasons.map(seasonLabel).join(', ')}`);
  lines.push(`- **Last fertilized (recorded):** ${fmtDay(plant.last_fertilized)}`);
  lines.push(`- **App-estimated next fertilize (season-aware):** ${formatNextFertilizationDue(plant)}`);
  lines.push(`- **Schedule hint:** ${describeFertilizerUrgency(plant)}`);
  if (plant.fertilizer_notes?.trim()) lines.push(`- **Fertilizer / product notes:** ${plant.fertilizer_notes.trim()}`);
  lines.push('');
  if (plant.notes?.trim()) {
    lines.push('## Legacy note (single field, if any)');
    lines.push(plant.notes.trim());
    lines.push('');
  }
  if (journalSlice.length > 0) {
    lines.push('## Recent journal entries (newest listed first)');
    for (const e of journalSlice) {
      const d = parseISO(e.created_at);
      const stamp = isValid(d) ? format(d, 'yyyy-MM-dd HH:mm') : e.created_at;
      const oneLine = e.body.replace(/\s+/g, ' ').trim();
      lines.push(`- **${stamp}:** ${oneLine}`);
    }
    lines.push('');
  }
  lines.push('## What I need');
  lines.push(
    'Please be concise. Prioritize likely issues for this environment (heat, sun, watering, drainage, pests common in dry climates).',
  );
  lines.push('I will describe symptoms or share a photo description next.');
  return lines.join('\n');
}
