import { CATEGORY_LABEL, RATING_LABEL, SUBSTANCE_LABEL } from './labels.ts';
import { precautionText, type Language, type PrecautionId } from './precautions.ts';
import type { ScoreResult } from './types.ts';

export interface BriefingInput {
  areaName: string;
  score: ScoreResult;
  precautions: PrecautionId[];
  language?: Language;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * ~30 second spoken briefing (about 70-90 words). Built only from the engine's output so the
 * voice never says anything the rating card doesn't.
 */
export function buildBriefingText({ areaName, score, precautions, language = 'en' }: BriefingInput): string {
  const b = score.breakdown;
  const top3 = precautions.slice(0, 3).map((id) => precautionText(id, language));
  const demo = b.usesDemoData ? ' Note: this rating uses demo data, not real records.' : '';

  if (language === 'ny') {
    const rating = RATING_LABEL.ny[score.rating];
    if (score.rating === 'insufficient_data') {
      return `${areaName}, nthawi ya ${score.time_band}: palibe zambiri zotsimikizika. ${top3.join(' ')} Izi ndi malangizo chabe, osati chitsimikizo.${demo}`;
    }
    return `${areaName}, nthawi ya ${score.time_band}: chiopsezo ndi ${rating}. Zochitika ${b.incidentCount} zotsimikizika m miyezi 24. Malangizo: ${top3.join(' ')} Izi ndi malangizo chabe, osati chitsimikizo.${demo}`;
  }

  if (score.rating === 'insufficient_data') {
    return `${areaName}, ${score.time_band}. Watcher does not have enough verified records to rate this area, so we won't guess. ${top3.join(' ')} Ratings are guidance, not guarantees.${demo}`;
  }
  const cats = b.topCategories.slice(0, 2).map((c) => CATEGORY_LABEL[c.key]);
  const subs = b.topSubstances.slice(0, 2).map((s) => SUBSTANCE_LABEL[s.key]);
  const trend = b.trend === 'up' ? 'rising' : b.trend === 'down' ? 'falling' : 'steady';
  const parts = [
    `${areaName}, ${score.time_band}. The risk rating is ${RATING_LABEL.en[score.rating].toLowerCase()}, ${score.score} out of 100.`,
    cats.length ? `Most verified reports here involve ${list(cats)}${subs.length ? `, often linked to ${list(subs)}` : ''}.` : '',
    `Reports are ${trend} compared with the previous three months.`,
    `Top precautions: ${top3.join(' ')}`,
    'Ratings are guidance, not guarantees.',
  ];
  return parts.filter(Boolean).join(' ') + demo;
}
