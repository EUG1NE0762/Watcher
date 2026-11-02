import { SCORING_CONFIG, type Area, type ScoreResult, type Source, type TimeBand } from '@watcher/scoring';
import { supabase } from '../lib/supabase';
import type { AreaDetail, AreaSummary, AskInput, AssistantAnswer, Briefing, CommunityReportView, IncidentView, MyReport, OfficialStatView } from './types';

function db() {
  if (!supabase) throw new Error('Backend not configured');
  return supabase;
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

interface AreaRow {
  id: string;
  name: string;
  city: string;
  province: string;
  area_type: Area['area_type'];
  aliases: string[];
  description: string;
  lat: number;
  lng: number;
  polygon: Area['polygon'];
}

const toArea = (r: AreaRow): Area => ({
  id: r.id,
  name: r.name,
  city: r.city,
  province: r.province,
  area_type: r.area_type,
  aliases: r.aliases ?? [],
  description: r.description,
  centroid: { lat: r.lat, lng: r.lng },
  polygon: r.polygon,
});

function groupScores(rows: ScoreResult[]): Map<string, Partial<Record<TimeBand, ScoreResult>>> {
  const map = new Map<string, Partial<Record<TimeBand, ScoreResult>>>();
  for (const s of rows) {
    const entry = map.get(s.area_id) ?? {};
    entry[s.time_band] = s;
    map.set(s.area_id, entry);
  }
  return map;
}

/** Calls an Edge Function and surfaces its JSON error message. */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const payload = ctx ? ((await ctx.json()) as { error?: { message?: string } }) : null;
      message = payload?.error?.message ?? message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data as T;
}

export const liveSource = {
  async listAreas(): Promise<AreaSummary[]> {
    const [areas, scores] = await Promise.all([
      db().from('areas_public').select('*').order('name'),
      db().from('risk_scores').select('*'),
    ]);
    const byArea = groupScores(must(scores) as ScoreResult[]);
    return (must(areas) as AreaRow[]).map((r) => ({ area: toArea(r), scores: byArea.get(r.id) ?? {} }));
  },

  async getAreaDetail(id: string): Promise<AreaDetail | null> {
    const since = new Date(Date.now() - SCORING_CONFIG.windowMonths * 30.4375 * 86_400_000).toISOString();
    const [area, scores, incidents, sources, reports, stats] = await Promise.all([
      db().from('areas_public').select('*').eq('id', id).maybeSingle(),
      db().from('risk_scores').select('*').eq('area_id', id),
      db()
        .from('incidents')
        .select('id, area_id, category, severity, substance, occurred_at, published_at, source_id, source_url, summary, confidence, status, is_demo, corroboration_count')
        .eq('area_id', id)
        .gte('occurred_at', since)
        .order('published_at', { ascending: false })
        .limit(30),
      db().from('sources').select('id, name, type, base_url, credibility_weight, requires_corroboration'),
      db().rpc('area_community_reports', { p_area_id: id }),
      db().from('official_stats').select('category, period_start, period_end, count, source_url, source_id').eq('area_id', id).limit(20),
    ]);
    const row = must(area) as AreaRow | null;
    if (!row) return null;
    const sourceList = must(sources) as Source[];
    const name = new Map(sourceList.map((s) => [s.id, s.name]));
    return {
      area: toArea(row),
      scores: groupScores(must(scores) as ScoreResult[]).get(id) ?? {},
      incidents: (must(incidents) as IncidentView[]).map((i) => ({ ...i, source_name: name.get(i.source_id) ?? i.source_id })),
      sources: sourceList,
      communityReports: (must(reports) as CommunityReportView[]) ?? [],
      officialStats: ((must(stats) as (OfficialStatView & { source_id: string })[]) ?? []).map((s) => ({
        ...s,
        source_name: name.get(s.source_id) ?? s.source_id,
      })),
      fetchedAt: new Date().toISOString(),
    };
  },

  async ask(input: AskInput): Promise<AssistantAnswer> {
    return invoke('assistant', {
      area_id: input.areaId,
      question: input.question,
      band: input.band,
      role: input.role,
      language: input.language,
      history: input.history.slice(-8),
    });
  },

  async briefing(areaId: string, band: TimeBand, role: string, language: string): Promise<Briefing> {
    return invoke('voice-briefing', { area_id: areaId, band, role, language });
  },

  async submitReport(input: { area_id: string; type: string; note: string; lat?: number | null; lng?: number | null }) {
    return invoke<{ report: MyReport }>('submit-report', input);
  },

  async myReports(): Promise<MyReport[]> {
    return must(await db().from('community_reports').select('id, area_id, type, note, created_at, status').order('created_at', { ascending: false }).limit(50)) as MyReport[];
  },

  async admin<T>(body: Record<string, unknown>): Promise<T> {
    return invoke<T>('admin', body);
  },
};
