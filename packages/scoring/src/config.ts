import type { AreaType, Category, Confidence, TimeBand } from './types.ts';

/** All tunable constants live here so the engine stays auditable. */
export const SCORING_CONFIG = {
  windowMonths: 24,
  halfLifeMonths: 6,
  trendWindowMonths: 3,
  /** Fewer verified incidents than this in the window means "insufficient_data". */
  minIncidents: 4,
  thresholds: { lowMax: 33, moderateMax: 66 },
  severityWeight: { 1: 0.5, 2: 1, 3: 2, 4: 3.5, 5: 5 } as Record<number, number>,
  confidenceWeight: { high: 1, medium: 0.7, low: 0.4 } as Record<Confidence, number>,
  /** Raw weighted sum at which an area scores ~63/100. Busy hubs need more incidents per head to rank equally. */
  baseline: { residential: 9, mixed: 11, commercial: 14, transport: 14 } as Record<AreaType, number>,
  /** Weight given to an incident that happened in a different time band than the one being checked. */
  offBandWeight: 0.35,
  /** Extra weight for categories that concentrate in certain bands. */
  categoryBandFactor: {
    robbery: { evening: 1.2, night: 1.4 },
    assault: { evening: 1.2, night: 1.35 },
    sexual_offence: { evening: 1.15, night: 1.4 },
    burglary: { night: 1.3 },
    vehicle_crime: { night: 1.2 },
    theft: { afternoon: 1.1 },
  } as Partial<Record<Category, Partial<Record<TimeBand, number>>>>,
  trendUpRatio: 1.25,
  trendDownRatio: 0.8,
} as const;

/** Local hour ranges [start, end) in Africa/Lusaka time (UTC+2, no DST). */
export const BAND_HOURS: Record<TimeBand, [number, number]> = {
  morning: [5, 12],
  afternoon: [12, 17],
  evening: [17, 21],
  night: [21, 5],
};

export const LUSAKA_UTC_OFFSET_HOURS = 2;

export const DEFAULT_SEVERITY: Record<Category, number> = {
  theft: 2,
  robbery: 4,
  assault: 4,
  burglary: 3,
  vehicle_crime: 3,
  sexual_offence: 5,
  drug_offence: 2,
  other: 1,
};
