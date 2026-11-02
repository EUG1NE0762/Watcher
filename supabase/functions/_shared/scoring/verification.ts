// GENERATED from packages/scoring/src by scripts/sync-scoring.mjs. Do not edit here.
import { hostOf, textHash, tokenSimilarity } from './text.ts';
import type { Category, Confidence, Incident, IncidentStatus, Source, Substance } from './types.ts';

/** Sources at or above this credibility count as "credible" for corroboration. */
export const CREDIBLE_THRESHOLD = 0.6;
const DUPLICATE_WINDOW_DAYS = 3;
const DUPLICATE_SIMILARITY = 0.4;

export interface IncidentCandidate {
  source_id?: string | null;
  source_url: string;
  published_at: string;
  occurred_at?: string | null;
  area_id?: string | null;
  category: Category;
  severity: number;
  substance: Substance | null;
  summary: string;
  /** Original text used only for hashing; never stored. */
  raw_text: string;
}

export type Assessment =
  | { decision: 'reject'; reasons: string[] }
  | { decision: 'duplicate'; duplicateOf: string; reasons: string[] }
  | {
      decision: 'corroborate';
      incidentId: string;
      source: Source;
      newConfidence: Confidence;
      reasons: string[];
    }
  | {
      decision: 'accept';
      source: Source;
      status: IncidentStatus;
      confidence: Confidence;
      raw_text_hash: string;
      reasons: string[];
    };

export function isCredible(source: Source): boolean {
  return source.type === 'official' || (source.credibility_weight >= CREDIBLE_THRESHOLD && !source.requires_corroboration);
}

/**
 * High   = any official source, or 2+ independent credible sources.
 * Medium = exactly one credible outlet.
 * Low    = only weak sources.
 */
export function confidenceFor(sources: Source[]): Confidence {
  const unique = [...new Map(sources.map((s) => [s.id, s])).values()];
  if (unique.some((s) => s.type === 'official')) return 'high';
  const credible = unique.filter(isCredible);
  if (credible.length >= 2) return 'high';
  if (credible.length === 1) return 'medium';
  return 'low';
}

/** Find the registered source a URL belongs to. A claimed source must match the URL's host. */
export function resolveSource(candidate: Pick<IncidentCandidate, 'source_id' | 'source_url'>, sources: Source[]): Source | null {
  const host = hostOf(candidate.source_url);
  if (!host) return null;
  const hostMatches = (s: Source) => {
    const base = hostOf(s.base_url);
    return !!base && (host === base || host.endsWith(`.${base}`));
  };
  if (candidate.source_id) {
    const claimed = sources.find((s) => s.id === candidate.source_id);
    return claimed && hostMatches(claimed) ? claimed : null;
  }
  return sources.find(hostMatches) ?? null;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export interface AssessContext {
  sources: Source[];
  /** Existing incidents (any status) with their hash and corroborating source ids, for dedupe. */
  existing: Array<Incident & { raw_text_hash?: string; source_ids?: string[] }>;
  now?: Date;
}

export function findDuplicate(
  candidate: IncidentCandidate,
  hash: string,
  existing: AssessContext['existing'],
): AssessContext['existing'][number] | null {
  const exact = existing.find((e) => e.raw_text_hash === hash);
  if (exact) return exact;
  if (!candidate.area_id) return null;
  const occurred = validDate(candidate.occurred_at ?? candidate.published_at);
  if (!occurred) return null;
  const windowMs = DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return (
    existing.find(
      (e) =>
        e.status !== 'rejected' &&
        e.area_id === candidate.area_id &&
        e.category === candidate.category &&
        Math.abs(new Date(e.occurred_at).getTime() - occurred.getTime()) <= windowMs &&
        tokenSimilarity(e.summary, candidate.summary) >= DUPLICATE_SIMILARITY,
    ) ?? null
  );
}

/**
 * The verification gate every record passes before it can be scored.
 * Untraceable records are rejected outright; nothing here ever invents or fills in a source.
 */
export function assessCandidate(candidate: IncidentCandidate, ctx: AssessContext): Assessment {
  const now = ctx.now ?? new Date();
  const reasons: string[] = [];

  if (!candidate.source_url || !/^https?:\/\//i.test(candidate.source_url)) {
    return { decision: 'reject', reasons: ['missing or invalid source_url'] };
  }
  const source = resolveSource(candidate, ctx.sources);
  if (!source) {
    return { decision: 'reject', reasons: ['source cannot be traced to a registered credible outlet'] };
  }
  if (source.type === 'demo') {
    return { decision: 'reject', reasons: ['demo source cannot enter the live pipeline'] };
  }
  const published = validDate(candidate.published_at);
  if (!published) return { decision: 'reject', reasons: ['missing published_date'] };
  if (published.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    return { decision: 'reject', reasons: ['published_date is in the future'] };
  }
  if (!candidate.summary?.trim()) return { decision: 'reject', reasons: ['empty summary'] };

  const hash = textHash(candidate.raw_text || candidate.summary);
  const dup = findDuplicate(candidate, hash, ctx.existing);
  if (dup) {
    const knownSources = new Set([dup.source_id, ...(dup.source_ids ?? [])]);
    if (knownSources.has(source.id) || dup.raw_text_hash === hash) {
      return { decision: 'duplicate', duplicateOf: dup.id, reasons: ['already recorded from this source'] };
    }
    const all = [...knownSources]
      .map((id) => ctx.sources.find((s) => s.id === id))
      .filter((s): s is Source => !!s);
    return {
      decision: 'corroborate',
      incidentId: dup.id,
      source,
      newConfidence: confidenceFor([...all, source]),
      reasons: [`independent report from ${source.name} corroborates existing incident`],
    };
  }

  if (source.requires_corroboration) {
    return { decision: 'reject', reasons: [`${source.name} is only accepted when corroborated by a credible source`] };
  }

  const confidence = confidenceFor([source]);
  let status: IncidentStatus = 'verified';
  if (!candidate.area_id) {
    status = 'pending';
    reasons.push('location could not be mapped to an area; queued for manual review');
  }
  if (confidence === 'low') {
    status = 'pending';
    reasons.push('single weak source; queued for manual review');
  }
  return { decision: 'accept', source, status, confidence, raw_text_hash: hash, reasons };
}

/** Community report types and how they map onto incident categories for corroboration. */
export const REPORT_TYPES = ['theft', 'robbery', 'assault', 'harassment', 'suspicious_activity', 'safe_spot', 'other'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const REPORT_TO_CATEGORY: Record<ReportType, Category[]> = {
  theft: ['theft', 'burglary', 'vehicle_crime'],
  robbery: ['robbery'],
  assault: ['assault', 'sexual_offence'],
  harassment: ['assault', 'sexual_offence', 'other'],
  suspicious_activity: ['other', 'drug_offence'],
  safe_spot: [],
  other: ['other'],
};

/** A community report is corroborated only by a verified, credible-source incident nearby in time. */
export function findCorroboratingIncident(
  report: { area_id: string; type: ReportType; created_at: string },
  incidents: Incident[],
  windowDays = 7,
): Incident | null {
  const allowed = REPORT_TO_CATEGORY[report.type];
  const t = new Date(report.created_at).getTime();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return (
    incidents.find(
      (i) =>
        i.status === 'verified' &&
        !i.is_demo &&
        i.area_id === report.area_id &&
        allowed.includes(i.category) &&
        (i.confidence === 'high' || i.confidence === 'medium') &&
        Math.abs(new Date(i.occurred_at).getTime() - t) <= windowMs,
    ) ?? null
  );
}
