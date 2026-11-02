import { DEFAULT_SEVERITY } from './config.ts';
import { textHash } from './text.ts';
import type { Area, Category, Incident, Source, Substance } from './types.ts';

/**
 * DEMO DATA ONLY. Generates illustrative incidents so the app can be shown before real records are
 * ingested. Every record is attributed to the fictional "Watcher Demo Dataset" source (never to a real
 * outlet), carries is_demo = true, and is labelled "[DEMO]" in its summary.
 */
export const DEMO_SOURCE: Source = {
  id: 'demo',
  name: 'Watcher Demo Dataset (illustrative, not real)',
  type: 'demo',
  base_url: 'https://example.org/watcher-demo',
  credibility_weight: 1,
};

export interface DemoProfile {
  area_id: string;
  /** Incidents across 24 months. Below the engine's minimum gives "insufficient_data" on purpose. */
  count: number;
  categories: Partial<Record<Category, number>>;
  substances: Partial<Record<Substance, number>>;
  /** Share of incidents in the evening/night. */
  darkShare: number;
  /** >1 skews incidents toward recent months. */
  recencyBias: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T extends string>(weights: Partial<Record<T, number>>, r: number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

const DAY_MS = 86_400_000;

export function generateDemoIncidents(areas: Area[], profiles: DemoProfile[], now = new Date()): Incident[] {
  const out: Incident[] = [];
  // Anchor to the start of the UTC day so the set is stable within a day.
  const anchor = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  for (const profile of profiles) {
    const area = areas.find((a) => a.id === profile.area_id);
    if (!area) continue;
    const rand = mulberry32(parseInt(textHash(area.id).slice(0, 8), 16));
    for (let n = 0; n < profile.count; n++) {
      const category = pick(profile.categories, rand());
      const withSubstance = category === 'drug_offence' || rand() < 0.45;
      const substance = withSubstance && Object.keys(profile.substances).length ? pick(profile.substances, rand()) : null;
      const ageDays = Math.floor(Math.pow(rand(), profile.recencyBias) * 720) + 1;
      const dark = rand() < profile.darkShare;
      // Lusaka local hour -> UTC (UTC+2).
      const localHour = dark ? [18, 19, 20, 22, 23, 0, 1, 2][Math.floor(rand() * 8)]! : 6 + Math.floor(rand() * 11);
      const occurred = new Date(anchor - ageDays * DAY_MS);
      occurred.setUTCHours((localHour + 22) % 24, Math.floor(rand() * 60), 0, 0);
      const published = new Date(occurred.getTime() + (1 + Math.floor(rand() * 3)) * DAY_MS);
      const severity = Math.max(1, Math.min(5, DEFAULT_SEVERITY[category] + (rand() < 0.2 ? 1 : rand() < 0.2 ? -1 : 0)));
      const id = `demo-${area.id}-${n + 1}`;
      const confidence = rand() < 0.6 ? 'high' : 'medium';
      out.push({
        id,
        area_id: area.id,
        category,
        severity,
        substance,
        occurred_at: occurred.toISOString(),
        published_at: published.toISOString(),
        source_id: DEMO_SOURCE.id,
        source_url: `${DEMO_SOURCE.base_url}/${id}`,
        summary: `[DEMO] Illustrative ${category.replace('_', ' ')} record for ${area.name}${substance ? ` (substance: ${substance})` : ''}. Not a real incident.`,
        confidence,
        status: 'verified',
        is_demo: true,
        corroboration_count: confidence === 'high' ? 2 : 1,
      });
    }
  }
  return out.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}
