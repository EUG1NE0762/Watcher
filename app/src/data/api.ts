import {
  buildBriefingText,
  getPrecautions,
  groundedAnswer,
  PERSONAL_QUESTION,
  personalRefusal,
  precautionText,
  type Language,
  type Role,
  type ScoreResult,
  type TimeBand,
} from '@watcher/scoring';
import { BACKEND_ENABLED } from '../lib/config';
import { demoSource } from './demoSource';
import { liveSource } from './liveSource';
import type { AreaDetail, AskInput, AssistantAnswer, Briefing, DataMode } from './types';

export const DATA_MODE: DataMode = BACKEND_ENABLED ? 'live' : 'offline_demo';
const source = BACKEND_ENABLED ? liveSource : demoSource;

export const api = {
  listAreas: () => source.listAreas(),
  getAreaDetail: (id: string) => source.getAreaDetail(id),

  /** Claude via the backend; falls back to the same grounded, data-only answer the server uses. */
  async ask(input: AskInput, detail: AreaDetail): Promise<AssistantAnswer> {
    if (BACKEND_ENABLED) {
      try {
        return await liveSource.ask(input);
      } catch (err) {
        if (err instanceof Error && /rate|too many/i.test(err.message)) throw err;
      }
    }
    return localAnswer(input, detail);
  },

  /** ElevenLabs via the backend (cached server-side); falls back to on-device text-to-speech. */
  async briefing(detail: AreaDetail, band: TimeBand, role: Role, language: Language): Promise<Briefing> {
    if (BACKEND_ENABLED) {
      try {
        return await liveSource.briefing(detail.area.id, band, role, language);
      } catch {
        // offline or function unavailable: speak the same text on-device
      }
    }
    const score = scoreFor(detail, band);
    const precautions = getPrecautions({ role, band, rating: score.rating, topCategories: score.breakdown.topCategories.map((c) => c.key) });
    return {
      text: buildBriefingText({ areaName: detail.area.name, score, precautions, language }),
      audio_url: null,
      fallback: 'device_tts',
      uses_demo_data: score.breakdown.usesDemoData,
    };
  },
};

export function emptyScore(areaId: string, band: TimeBand): ScoreResult {
  return {
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
    computed_at: new Date(0).toISOString(),
  };
}

export function scoreFor(summary: Pick<AreaDetail, 'area' | 'scores'>, band: TimeBand): ScoreResult {
  return summary.scores[band] ?? emptyScore(summary.area.id, band);
}

function localAnswer(input: AskInput, detail: AreaDetail): AssistantAnswer {
  const score = scoreFor(detail, input.band);
  const citations = detail.incidents.slice(0, 12).map((i, idx) => ({
    n: idx + 1,
    source: i.source_name,
    url: i.source_url,
    published_at: i.published_at.slice(0, 10),
    confidence: i.confidence,
    is_demo: i.is_demo,
  }));
  if (PERSONAL_QUESTION.test(input.question)) {
    return { answer: personalRefusal(detail.area.name), citations: [], rating: score.rating, mode: 'refusal', uses_demo_data: score.breakdown.usesDemoData };
  }
  const precautions = getPrecautions({
    role: input.role,
    band: input.band,
    rating: score.rating,
    topCategories: score.breakdown.topCategories.map((c) => c.key),
  }).map((id) => precautionText(id, input.language));
  const answer = groundedAnswer({ areaName: detail.area.name, band: input.band, score, precautions, citationCount: citations.length });
  return {
    answer,
    citations: score.rating === 'insufficient_data' ? [] : citations.slice(0, 3),
    rating: score.rating,
    mode: 'offline',
    uses_demo_data: score.breakdown.usesDemoData,
  };
}
