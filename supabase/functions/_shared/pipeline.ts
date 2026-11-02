import { assessCandidate, type Area, type IncidentCandidate, type Source } from '@watcher/scoring';
import type { Deps } from './http.ts';
import type { StoredIncident } from './repo.ts';

export interface PipelineStats {
  accepted_verified: number;
  accepted_pending: number;
  corroborated: number;
  duplicates: number;
  rejected: number;
  rejections: Array<{ url: string; reason: string }>;
}

export function emptyStats(): PipelineStats {
  return { accepted_verified: 0, accepted_pending: 0, corroborated: 0, duplicates: 0, rejected: 0, rejections: [] };
}

export interface PipelineContext {
  sources: Source[];
  areas: Area[];
  existing: StoredIncident[];
}

export async function loadPipelineContext(deps: Deps): Promise<PipelineContext> {
  const since = new Date(deps.now().getTime() - 90 * 86_400_000).toISOString();
  const [sources, areas, existing] = await Promise.all([
    deps.repo.listSources(),
    deps.repo.listAreas(),
    deps.repo.listIncidentsForDedupe(since),
  ]);
  return { sources, areas, existing };
}

/**
 * Runs one candidate through verification and writes the outcome.
 * Returns the area id whose score must be recomputed, if any.
 */
export async function processCandidate(
  deps: Deps,
  ctx: PipelineContext,
  candidate: IncidentCandidate & { location_text?: string | null },
  stats: PipelineStats,
): Promise<{ recompute: string | null; highConfidenceArea: string | null }> {
  const result = assessCandidate(candidate, { sources: ctx.sources, existing: ctx.existing, now: deps.now() });
  switch (result.decision) {
    case 'reject':
      stats.rejected++;
      stats.rejections.push({ url: candidate.source_url.slice(0, 200), reason: result.reasons.join('; ') });
      return { recompute: null, highConfidenceArea: null };
    case 'duplicate':
      stats.duplicates++;
      return { recompute: null, highConfidenceArea: null };
    case 'corroborate': {
      await deps.repo.addCorroboration(result.incidentId, result.source.id, candidate.source_url, candidate.published_at, result.newConfidence);
      const existing = ctx.existing.find((e) => e.id === result.incidentId);
      if (existing) {
        existing.source_ids = [...new Set([...existing.source_ids, result.source.id])];
        existing.confidence = result.newConfidence;
      }
      stats.corroborated++;
      const verifiedArea = existing?.status === 'verified' ? existing.area_id : null;
      return { recompute: verifiedArea, highConfidenceArea: result.newConfidence === 'high' ? verifiedArea : null };
    }
    case 'accept': {
      const status = result.status;
      const occurred = candidate.occurred_at && Number.isFinite(new Date(candidate.occurred_at).getTime()) ? candidate.occurred_at : candidate.published_at;
      const id = await deps.repo.insertIncident({
        area_id: candidate.area_id ?? null,
        category: candidate.category,
        severity: Math.min(5, Math.max(1, Math.round(candidate.severity))),
        substance: candidate.substance,
        occurred_at: new Date(occurred).toISOString(),
        published_at: new Date(candidate.published_at).toISOString(),
        source_id: result.source.id,
        source_url: candidate.source_url,
        summary: candidate.summary.slice(0, 400),
        location_text: candidate.location_text?.slice(0, 200) ?? null,
        confidence: result.confidence,
        status,
        raw_text_hash: result.raw_text_hash,
        review_note: result.reasons.join('; ') || null,
      });
      ctx.existing.push({
        id,
        area_id: candidate.area_id ?? '',
        category: candidate.category,
        severity: candidate.severity,
        substance: candidate.substance,
        occurred_at: new Date(occurred).toISOString(),
        published_at: candidate.published_at,
        source_id: result.source.id,
        source_url: candidate.source_url,
        summary: candidate.summary,
        confidence: result.confidence,
        status,
        is_demo: false,
        raw_text_hash: result.raw_text_hash,
        source_ids: [result.source.id],
      });
      if (status === 'verified') {
        stats.accepted_verified++;
        return { recompute: candidate.area_id ?? null, highConfidenceArea: result.confidence === 'high' ? candidate.area_id ?? null : null };
      }
      stats.accepted_pending++;
      return { recompute: null, highConfidenceArea: null };
    }
  }
}
