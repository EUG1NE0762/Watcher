import {
  CATEGORY_LABEL,
  getPrecautions,
  precautionText,
  SCORING_CONFIG,
  SUBSTANCE_LABEL,
  type Area,
  type Incident,
  type Language,
  type Role,
  type ScoreResult,
  type Source,
  type TimeBand,
} from '@watcher/scoring';
import type { Deps } from './http.ts';

const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000;
const MAX_CITED_INCIDENTS = 12;

export interface Citation {
  n: number;
  incident_id: string;
  source: string;
  url: string;
  published_at: string;
  confidence: string;
  is_demo: boolean;
}

export interface AreaContext {
  area: Area;
  band: TimeBand;
  score: ScoreResult;
  incidents: Incident[];
  citations: Citation[];
  precautions: string[];
}

/**
 * Everything the assistant and voice briefing may say about an area, fetched server-side.
 * Uses the stored engine score so the AI can never present a different rating.
 */
export async function loadAreaContext(
  deps: Deps,
  areaId: string,
  band: TimeBand,
  role: Role,
  language: Language,
): Promise<AreaContext | null> {
  const area = await deps.repo.getArea(areaId);
  if (!area) return null;
  const since = new Date(deps.now().getTime() - SCORING_CONFIG.windowMonths * MONTH_MS).toISOString();
  const [scores, incidents, sources] = await Promise.all([
    deps.repo.getScores(areaId),
    deps.repo.listVerifiedIncidents(areaId, since),
    deps.repo.listSources(),
  ]);
  const score =
    scores.find((s) => s.time_band === band) ??
    ({
      area_id: areaId,
      time_band: band,
      score: null,
      rating: 'insufficient_data',
      breakdown: {
        incidentCount: 0,
        weightedTotal: 0,
        topCategories: [],
        topSubstances: [],
        trend: 'stable',
        recentCount: 0,
        previousCount: 0,
        latestPublishedAt: null,
        daysSinceLatest: null,
        confidenceLevel: 'low',
        usesDemoData: false,
        demoShare: 0,
        band,
        sourceIds: [],
      },
      computed_at: deps.now().toISOString(),
    } satisfies ScoreResult);

  const sourceName = new Map<string, Source>(sources.map((s) => [s.id, s]));
  const recent = [...incidents].sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, MAX_CITED_INCIDENTS);
  const citations = recent.map((i, idx) => ({
    n: idx + 1,
    incident_id: i.id,
    source: sourceName.get(i.source_id)?.name ?? i.source_id,
    url: i.source_url,
    published_at: i.published_at.slice(0, 10),
    confidence: i.confidence,
    is_demo: i.is_demo,
  }));
  const precautions = getPrecautions({
    role,
    band,
    rating: score.rating,
    topCategories: score.breakdown.topCategories.map((c) => c.key),
  }).map((id) => precautionText(id, language));
  return { area, band, score, incidents: recent, citations, precautions };
}

/** Compact, model-readable grounding block. */
export function contextToPrompt(ctx: AreaContext): string {
  const b = ctx.score.breakdown;
  return JSON.stringify(
    {
      area: { name: ctx.area.name, city: ctx.area.city, description: ctx.area.description },
      time_of_day: ctx.band,
      engine_rating: ctx.score.rating,
      engine_score_0_100: ctx.score.score,
      verified_incidents_last_24_months: b.incidentCount,
      top_crimes: b.topCategories.map((c) => `${CATEGORY_LABEL[c.key]} (${c.count})`),
      top_substances: b.topSubstances.map((s) => `${SUBSTANCE_LABEL[s.key]} (${s.count})`),
      trend_vs_previous_3_months: b.trend,
      data_confidence: b.confidenceLevel,
      days_since_latest_report: b.daysSinceLatest,
      uses_demo_data: b.usesDemoData,
      precautions: ctx.precautions,
      incidents: ctx.incidents.map((i, idx) => ({
        ref: idx + 1,
        category: CATEGORY_LABEL[i.category],
        substance: i.substance ? SUBSTANCE_LABEL[i.substance] : null,
        date: i.occurred_at.slice(0, 10),
        summary: i.summary,
        source: ctx.citations[idx]?.source,
        confidence: i.confidence,
        demo: i.is_demo,
      })),
    },
    null,
    1,
  );
}
