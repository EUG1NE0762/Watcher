import { CATEGORY_LABEL, RATING_LABEL, SUBSTANCE_LABEL } from './labels.ts';
import type { RatingResult, ScoreResult, TimeBand } from './types.ts';

export const NO_DATA_LINE = "I don't have verified data for that.";

/** Questions that try to identify or profile individuals are refused before any model call. */
export const PERSONAL_QUESTION =
  /\b(who (is|are|was|were)|names? of|identify|which (person|people|man|woman|guy|boy|girl)|where does .{1,40} live|photos? of|pictures? of|address of|phone number)\b/i;

export function personalRefusal(areaName: string): string {
  return `Watcher only describes areas, never individuals, so I can't help identify or discuss specific people. I can tell you about verified incidents and precautions for ${areaName}.`;
}

const RATING_CLAIM = /\b(low|moderate|medium|high)(?:[- ]risk|\s+rating)\b|\brated\s+(?:as\s+)?(low|moderate|medium|high)\b/gi;

/** True if the text states a rating different from the engine's. */
export function contradictsEngine(answer: string, rating: RatingResult): boolean {
  for (const m of answer.matchAll(RATING_CLAIM)) {
    const claimed = (m[1] ?? m[2] ?? '').toLowerCase().replace('medium', 'moderate');
    if (rating === 'insufficient_data' || claimed !== rating) return true;
  }
  return false;
}

/** [n] references in an answer that point at real citations (1..max). */
export function citedRefs(answer: string, max: number): number[] {
  const refs = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= max) refs.add(n);
  }
  return [...refs].sort((a, b) => a - b);
}

export interface GroundedAnswerInput {
  areaName: string;
  band: TimeBand;
  score: ScoreResult;
  precautions: string[];
  citationCount: number;
}

/** Deterministic, data-only answer: used when Claude is unavailable, fails, or contradicts the engine. */
export function groundedAnswer({ areaName, band, score, precautions, citationCount }: GroundedAnswerInput): string {
  const b = score.breakdown;
  const demo = b.usesDemoData ? 'These figures are demo data, not real records.' : '';
  if (score.rating === 'insufficient_data') {
    return [
      `${NO_DATA_LINE} Watcher doesn't have enough verified records to rate ${areaName} in the ${band}, so it won't guess.`,
      `General advice: ${precautions.slice(0, 2).join(' ')}`,
      demo,
    ]
      .filter(Boolean)
      .join(' ');
  }
  const refs = Array.from({ length: Math.min(3, citationCount) }, (_, i) => `[${i + 1}]`).join('');
  const crimes = b.topCategories.slice(0, 2).map((c) => CATEGORY_LABEL[c.key]).join(' and ');
  const subs = b.topSubstances.slice(0, 2).map((s) => SUBSTANCE_LABEL[s.key]).join(' and ');
  return [
    `${areaName} is rated ${RATING_LABEL.en[score.rating]} risk in the ${band} (${score.score}/100), based on ${b.incidentCount} verified reports ${refs}.`.replace(' .', '.'),
    crimes ? `Most reports involve ${crimes}${subs ? `, often linked to ${subs}` : ''}.` : '',
    `Tips: ${precautions.slice(0, 2).join(' ')}`,
    demo,
  ]
    .filter(Boolean)
    .join(' ');
}
