// GENERATED from packages/scoring/src by scripts/sync-scoring.mjs. Do not edit here.
import type { Language } from './precautions.ts';
import type { Category, RatingResult, Substance, TimeBand } from './types.ts';

/** Plain-language labels shared by the app, the briefing and the assistant fallback. */
export const CATEGORY_LABEL: Record<Category, string> = {
  theft: 'theft',
  robbery: 'robbery',
  assault: 'assault',
  burglary: 'burglary',
  vehicle_crime: 'vehicle crime',
  sexual_offence: 'sexual offences',
  drug_offence: 'drug offences',
  other: 'other incidents',
};

export const SUBSTANCE_LABEL: Record<Substance, string> = {
  cannabis: 'cannabis',
  alcohol: 'alcohol',
  methaqualone: 'methaqualone (mandrax)',
  heroin: 'heroin',
  cocaine: 'cocaine',
  synthetic: 'synthetic drugs',
  other: 'other substances',
};

export const RATING_LABEL: Record<Language, Record<RatingResult, string>> = {
  en: { low: 'Low', moderate: 'Moderate', high: 'High', insufficient_data: 'Not enough data' },
  ny: { low: 'Pang ono', moderate: 'Pakatikati', high: 'Kwambiri', insufficient_data: 'Palibe zambiri zokwanira' },
  bem: { low: 'Panono', moderate: 'Pakati', high: 'Sana', insufficient_data: 'Tapali ifyakwanisha' },
};

export const BAND_LABEL: Record<TimeBand, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
};
