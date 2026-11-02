import { SCORING_CONFIG } from './config.ts';
import { bandForDate } from './timebands.ts';
import {
  TIME_BANDS,
  type AreaType,
  type Category,
  type CategoryShare,
  type Confidence,
  type Incident,
  type RatingResult,
  type ScoreResult,
  type Source,
  type Substance,
  type TimeBand,
  type Trend,
} from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30.4375 * DAY_MS;

export interface ScoreOptions {
  areaId: string;
  areaType: AreaType;
  band: TimeBand;
  sources: Source[];
  now?: Date;
  config?: typeof SCORING_CONFIG;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ratingForScore(score: number, config = SCORING_CONFIG): 'low' | 'moderate' | 'high' {
  if (score <= config.thresholds.lowMax) return 'low';
  if (score <= config.thresholds.moderateMax) return 'moderate';
  return 'high';
}

/** Exponential decay with the configured half-life. Age in months. */
export function recencyDecay(ageMonths: number, config = SCORING_CONFIG): number {
  if (ageMonths <= 0) return 1;
  return Math.pow(0.5, ageMonths / config.halfLifeMonths);
}

export function severityWeight(severity: number, config = SCORING_CONFIG): number {
  const s = clamp(Math.round(severity), 1, 5);
  return config.severityWeight[s] ?? 1;
}

export function bandWeight(incident: Pick<Incident, 'occurred_at' | 'category'>, band: TimeBand, config = SCORING_CONFIG): number {
  const occurredBand = bandForDate(new Date(incident.occurred_at));
  const base = occurredBand === band ? 1 : config.offBandWeight;
  const factor = config.categoryBandFactor[incident.category]?.[band] ?? 1;
  return base * factor;
}

/** Only verified incidents inside the window count. Pending/rejected/community data never reaches the score. */
export function eligibleIncidents(incidents: Incident[], now: Date, config = SCORING_CONFIG): Incident[] {
  const windowStart = now.getTime() - config.windowMonths * MONTH_MS;
  return incidents.filter((i) => {
    if (i.status !== 'verified') return false;
    const t = new Date(i.occurred_at).getTime();
    return Number.isFinite(t) && t >= windowStart && t <= now.getTime() + DAY_MS;
  });
}

export function incidentWeight(
  incident: Incident,
  band: TimeBand,
  sourceWeight: number,
  now: Date,
  config = SCORING_CONFIG,
): number {
  const ageMonths = (now.getTime() - new Date(incident.occurred_at).getTime()) / MONTH_MS;
  return (
    severityWeight(incident.severity, config) *
    recencyDecay(ageMonths, config) *
    (config.confidenceWeight[incident.confidence] ?? 0) *
    sourceWeight *
    bandWeight(incident, band, config)
  );
}

function topShares<T extends string>(values: T[], limit = 4): CategoryShare<T>[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = values.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count, share: Math.round((count / total) * 100) / 100 }));
}

export function computeTrend(incidents: Incident[], now: Date, config = SCORING_CONFIG): {
  trend: Trend;
  recentCount: number;
  previousCount: number;
} {
  const span = config.trendWindowMonths * MONTH_MS;
  const t = now.getTime();
  let recentCount = 0;
  let previousCount = 0;
  for (const i of incidents) {
    const ts = new Date(i.occurred_at).getTime();
    if (ts > t - span) recentCount++;
    else if (ts > t - 2 * span) previousCount++;
  }
  let trend: Trend = 'stable';
  // Below 3 incidents across both windows any "trend" is noise.
  if (recentCount + previousCount >= 3) {
    const ratio = (recentCount + 0.5) / (previousCount + 0.5);
    if (ratio >= config.trendUpRatio) trend = 'up';
    else if (ratio <= config.trendDownRatio) trend = 'down';
  }
  return { trend, recentCount, previousCount };
}

function overallConfidence(incidents: Incident[]): Confidence {
  if (incidents.length === 0) return 'low';
  const points = { high: 3, medium: 2, low: 1 } as const;
  const avg = incidents.reduce((s, i) => s + points[i.confidence], 0) / incidents.length;
  if (avg >= 2.5) return 'high';
  if (avg >= 1.75) return 'medium';
  return 'low';
}

/**
 * score = clamp(0..100, 100 * (1 - exp(-raw / baseline)))
 * raw   = Σ severity_weight × recency_decay × confidence_weight × source_weight × band_weight
 * The saturating curve keeps a handful of serious incidents from pinning every busy area at 100.
 */
export function computeScore(incidents: Incident[], opts: ScoreOptions): ScoreResult {
  const config = opts.config ?? SCORING_CONFIG;
  const now = opts.now ?? new Date();
  const sourceById = new Map(opts.sources.map((s) => [s.id, s]));
  const eligible = eligibleIncidents(incidents, now, config).filter((i) => sourceById.has(i.source_id));

  let raw = 0;
  for (const incident of eligible) {
    const source = sourceById.get(incident.source_id)!;
    raw += incidentWeight(incident, opts.band, source.credibility_weight, now, config);
  }

  const latest = eligible.reduce<string | null>(
    (acc, i) => (acc === null || i.published_at > acc ? i.published_at : acc),
    null,
  );
  const demoCount = eligible.filter((i) => i.is_demo).length;
  const { trend, recentCount, previousCount } = computeTrend(eligible, now, config);

  const breakdown = {
    incidentCount: eligible.length,
    weightedTotal: Math.round(raw * 100) / 100,
    topCategories: topShares<Category>(eligible.map((i) => i.category)),
    topSubstances: topShares<Substance>(eligible.flatMap((i) => (i.substance ? [i.substance] : []))),
    trend,
    recentCount,
    previousCount,
    latestPublishedAt: latest,
    daysSinceLatest: latest ? Math.max(0, Math.floor((now.getTime() - new Date(latest).getTime()) / DAY_MS)) : null,
    confidenceLevel: overallConfidence(eligible),
    usesDemoData: demoCount > 0,
    demoShare: eligible.length ? Math.round((demoCount / eligible.length) * 100) / 100 : 0,
    band: opts.band,
    sourceIds: [...new Set(eligible.map((i) => i.source_id))].sort(),
  };

  let score: number | null = null;
  let rating: RatingResult = 'insufficient_data';
  if (eligible.length >= config.minIncidents) {
    const baseline = config.baseline[opts.areaType] ?? config.baseline.mixed;
    score = Math.round(clamp(100 * (1 - Math.exp(-raw / baseline)), 0, 100));
    rating = ratingForScore(score, config);
  }

  return {
    area_id: opts.areaId,
    time_band: opts.band,
    score,
    rating,
    breakdown,
    computed_at: now.toISOString(),
  };
}

export function computeAllBands(incidents: Incident[], opts: Omit<ScoreOptions, 'band'>): Record<TimeBand, ScoreResult> {
  const out = {} as Record<TimeBand, ScoreResult>;
  for (const band of TIME_BANDS) out[band] = computeScore(incidents, { ...opts, band });
  return out;
}

/** The single "headline" rating for an area: the worst band, so alerts are conservative. */
export function headlineRating(scores: ScoreResult[]): RatingResult {
  const order: RatingResult[] = ['insufficient_data', 'low', 'moderate', 'high'];
  return scores.reduce<RatingResult>(
    (worst, s) => (order.indexOf(s.rating) > order.indexOf(worst) ? s.rating : worst),
    'insufficient_data',
  );
}
