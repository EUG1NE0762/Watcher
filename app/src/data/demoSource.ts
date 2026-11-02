import central from '../../../supabase/seed/data/areas/central.json';
import copperbelt from '../../../supabase/seed/data/areas/copperbelt.json';
import eastern from '../../../supabase/seed/data/areas/eastern.json';
import luapula from '../../../supabase/seed/data/areas/luapula.json';
import lusakaProvince from '../../../supabase/seed/data/areas/lusaka-province.json';
import lusaka from '../../../supabase/seed/data/areas/lusaka.json';
import muchinga from '../../../supabase/seed/data/areas/muchinga.json';
import northWestern from '../../../supabase/seed/data/areas/north-western.json';
import northern from '../../../supabase/seed/data/areas/northern.json';
import southern from '../../../supabase/seed/data/areas/southern.json';
import western from '../../../supabase/seed/data/areas/western.json';
import profiles from '../../../supabase/seed/data/demo-profiles.json';
import sourcesJson from '../../../supabase/seed/data/sources.json';
import {
  buildAreas,
  computeAllBands,
  DEMO_SOURCE,
  generateDemoIncidents,
  type Area,
  type AreaSeed,
  type DemoProfile,
  type Incident,
  type Source,
} from '@watcher/scoring';
import type { AreaDetail, AreaSummary, IncidentView } from './types';

/**
 * Offline demo mode: the same labelled demo dataset as supabase/seed.sql, generated and scored
 * on-device by the shared engine. Used only when no backend is configured.
 */
// Metro can't list a directory, so each province file is imported by name (keep in sync with seed/data/areas).
const SEEDS = [lusaka, lusakaProvince, central, copperbelt, eastern, luapula, muchinga, northern, northWestern, southern, western];
const areas: Area[] = buildAreas(SEEDS.flat() as AreaSeed[]);
export const ALL_SOURCES: Source[] = [...(sourcesJson as Source[]), DEMO_SOURCE];

let cache: { day: string; incidents: Incident[]; summaries: AreaSummary[] } | null = null;

function build() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (cache?.day === day) return cache;
  const incidents = generateDemoIncidents(areas, profiles as DemoProfile[], now);
  const summaries = areas.map((area) => ({
    area,
    scores: computeAllBands(
      incidents.filter((i) => i.area_id === area.id),
      { areaId: area.id, areaType: area.area_type, sources: ALL_SOURCES, now },
    ),
  }));
  cache = { day, incidents, summaries };
  return cache;
}

export const demoSource = {
  async listAreas(): Promise<AreaSummary[]> {
    return build().summaries;
  },

  async getAreaDetail(id: string): Promise<AreaDetail | null> {
    const { incidents, summaries } = build();
    const summary = summaries.find((s) => s.area.id === id);
    if (!summary) return null;
    const views: IncidentView[] = incidents
      .filter((i) => i.area_id === id)
      .slice(0, 30)
      .map((i) => ({ ...i, source_name: DEMO_SOURCE.name }));
    return {
      ...summary,
      incidents: views,
      sources: ALL_SOURCES,
      communityReports: [],
      officialStats: [],
      fetchedAt: new Date().toISOString(),
    };
  },
};
