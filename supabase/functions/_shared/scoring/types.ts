// GENERATED from packages/scoring/src by scripts/sync-scoring.mjs. Do not edit here.
export const CATEGORIES = [
  'theft',
  'robbery',
  'assault',
  'burglary',
  'vehicle_crime',
  'sexual_offence',
  'drug_offence',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SUBSTANCES = [
  'cannabis',
  'alcohol',
  'methaqualone',
  'heroin',
  'cocaine',
  'synthetic',
  'other',
] as const;
export type Substance = (typeof SUBSTANCES)[number];

export const TIME_BANDS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type TimeBand = (typeof TIME_BANDS)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export type IncidentStatus = 'verified' | 'pending' | 'rejected';
export type Rating = 'low' | 'moderate' | 'high';
export type RatingResult = Rating | 'insufficient_data';
export type Trend = 'up' | 'down' | 'stable';
export type Role = 'visitor' | 'driver' | 'resident';
export type AreaType = 'residential' | 'commercial' | 'transport' | 'mixed';
export type SourceType = 'official' | 'media' | 'demo';

/** [lng, lat] pairs, GeoJSON order. */
export type LngLat = [number, number];

export interface Area {
  id: string;
  name: string;
  city: string;
  province: string;
  area_type: AreaType;
  aliases: string[];
  description: string;
  centroid: { lat: number; lng: number };
  /** Outer ring, GeoJSON order, first point == last point. */
  polygon: LngLat[];
}

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  base_url: string;
  credibility_weight: number;
  /** Outlets that are only usable when another credible source corroborates them. */
  requires_corroboration?: boolean;
  /** RSS/Atom feeds the ingestion job polls. */
  feeds?: string[];
}

export interface Incident {
  id: string;
  area_id: string;
  category: Category;
  severity: number;
  substance: Substance | null;
  occurred_at: string;
  published_at: string;
  source_id: string;
  source_url: string;
  summary: string;
  confidence: Confidence;
  status: IncidentStatus;
  is_demo: boolean;
  /** Number of distinct credible sources that reported this incident (>= 1). */
  corroboration_count?: number;
}

export interface CategoryShare<T extends string> {
  key: T;
  count: number;
  share: number;
}

export interface ScoreBreakdown {
  incidentCount: number;
  weightedTotal: number;
  topCategories: CategoryShare<Category>[];
  topSubstances: CategoryShare<Substance>[];
  trend: Trend;
  recentCount: number;
  previousCount: number;
  latestPublishedAt: string | null;
  daysSinceLatest: number | null;
  confidenceLevel: Confidence;
  usesDemoData: boolean;
  demoShare: number;
  band: TimeBand;
  sourceIds: string[];
}

export interface ScoreResult {
  area_id: string;
  time_band: TimeBand;
  score: number | null;
  rating: RatingResult;
  breakdown: ScoreBreakdown;
  computed_at: string;
}
