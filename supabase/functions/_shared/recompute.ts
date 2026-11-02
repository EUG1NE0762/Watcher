import { computeAllBands, headlineRating, RATING_LABEL, SCORING_CONFIG, type ScoreResult } from '@watcher/scoring';
import type { Deps } from './http.ts';

const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000;

export interface RecomputeResult {
  areaId: string;
  previous: string;
  next: string;
  changed: boolean;
}

/** Recompute all time bands for the given areas from verified incidents only, then alert watchers of changes. */
export async function recomputeAreas(deps: Deps, areaIds: string[]): Promise<RecomputeResult[]> {
  const now = deps.now();
  const since = new Date(now.getTime() - SCORING_CONFIG.windowMonths * MONTH_MS).toISOString();
  const sources = await deps.repo.listSources();
  const results: RecomputeResult[] = [];
  for (const areaId of [...new Set(areaIds)]) {
    const area = await deps.repo.getArea(areaId);
    if (!area) continue;
    const previousScores = await deps.repo.getScores(areaId);
    const incidents = await deps.repo.listVerifiedIncidents(areaId, since);
    const scores: ScoreResult[] = Object.values(
      computeAllBands(incidents, { areaId, areaType: area.area_type, sources, now }),
    );
    await deps.repo.upsertScores(scores);
    const previous = previousScores.length ? headlineRating(previousScores) : 'insufficient_data';
    const next = headlineRating(scores);
    results.push({ areaId, previous, next, changed: previous !== next });
  }
  const changed = results.filter((r) => r.changed);
  if (changed.length) await notifyRatingChanges(deps, changed);
  return results;
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export async function sendPush(deps: Deps, messages: PushMessage[]): Promise<number> {
  if (!messages.length) return 0;
  let sent = 0;
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await deps.fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else deps.log('push_failed', { status: res.status });
    } catch (err) {
      deps.log('push_failed', { message: err instanceof Error ? err.message : String(err) });
    }
  }
  return sent;
}

async function notifyRatingChanges(deps: Deps, changes: RecomputeResult[]): Promise<void> {
  const watchers = await deps.repo.listWatchers(changes.map((c) => c.areaId));
  const messages: PushMessage[] = [];
  for (const w of watchers) {
    const change = changes.find((c) => c.areaId === w.area_id)!;
    if (w.last_rating !== change.next) await deps.repo.setSavedPlaceRating(w.saved_place_id, change.next);
    if (!w.push_token || !w.notify_rating_changes || w.last_rating === change.next) continue;
    const area = await deps.repo.getArea(w.area_id);
    messages.push({
      to: w.push_token,
      title: `${area?.name ?? 'A saved place'}: rating changed`,
      body: `Now ${RATING_LABEL.en[change.next as keyof typeof RATING_LABEL.en] ?? change.next}. Tap to see why.`,
      data: { area_id: w.area_id },
    });
  }
  const sent = await sendPush(deps, messages);
  deps.log('rating_change_alerts', { areas: changes.length, sent });
}

/** Alert watchers when a new high-confidence incident is verified in their saved area. */
export async function notifyVerifiedIncidents(deps: Deps, areaIds: string[]): Promise<void> {
  if (!areaIds.length) return;
  const watchers = await deps.repo.listWatchers([...new Set(areaIds)]);
  const messages: PushMessage[] = [];
  for (const w of watchers) {
    if (!w.push_token || !w.notify_incidents) continue;
    const area = await deps.repo.getArea(w.area_id);
    messages.push({
      to: w.push_token,
      title: `${area?.name ?? 'A saved place'}: new verified report`,
      body: 'A high-confidence incident was verified. Tap for details and sources.',
      data: { area_id: w.area_id },
    });
  }
  await sendPush(deps, messages);
}
