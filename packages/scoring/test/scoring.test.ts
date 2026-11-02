import {
  bandForDate,
  bandForHour,
  computeAllBands,
  computeScore,
  computeTrend,
  headlineRating,
  ratingForScore,
  recencyDecay,
  type Incident,
  type Source,
} from '../src/index.ts';

const NOW = new Date('2026-06-15T10:00:00Z');
const SOURCES: Source[] = [
  { id: 'zps', name: 'Zambia Police Service', type: 'official', base_url: 'https://www.zambiapolice.gov.zm', credibility_weight: 1 },
  { id: 'lt', name: 'Lusaka Times', type: 'media', base_url: 'https://www.lusakatimes.com', credibility_weight: 0.7 },
];

let seq = 0;
function incident(over: Partial<Incident> = {}): Incident {
  seq++;
  return {
    id: `i${seq}`,
    area_id: 'a1',
    category: 'robbery',
    severity: 4,
    substance: null,
    // 22:00 Lusaka = 20:00 UTC => night band
    occurred_at: '2026-06-01T20:00:00Z',
    published_at: '2026-06-02T08:00:00Z',
    source_id: 'zps',
    source_url: 'https://www.zambiapolice.gov.zm/x',
    summary: 'Robbery reported',
    confidence: 'high',
    status: 'verified',
    is_demo: false,
    ...over,
  };
}

const base = { areaId: 'a1', areaType: 'residential' as const, sources: SOURCES, now: NOW };

describe('time bands (Africa/Lusaka, UTC+2)', () => {
  it('maps hours to bands', () => {
    expect(bandForHour(6)).toBe('morning');
    expect(bandForHour(13)).toBe('afternoon');
    expect(bandForHour(18)).toBe('evening');
    expect(bandForHour(23)).toBe('night');
    expect(bandForHour(3)).toBe('night');
  });
  it('converts UTC to Lusaka time', () => {
    expect(bandForDate(new Date('2026-01-01T03:30:00Z'))).toBe('morning'); // 05:30 local
    expect(bandForDate(new Date('2026-01-01T19:30:00Z'))).toBe('night'); // 21:30 local
  });
});

describe('weights', () => {
  it('halves every ~6 months', () => {
    expect(recencyDecay(0)).toBe(1);
    expect(recencyDecay(6)).toBeCloseTo(0.5);
    expect(recencyDecay(12)).toBeCloseTo(0.25);
  });
  it('rates thresholds 33/66', () => {
    expect(ratingForScore(0)).toBe('low');
    expect(ratingForScore(33)).toBe('low');
    expect(ratingForScore(34)).toBe('moderate');
    expect(ratingForScore(66)).toBe('moderate');
    expect(ratingForScore(67)).toBe('high');
  });
});

describe('computeScore', () => {
  it('returns insufficient_data instead of guessing', () => {
    const r = computeScore([incident(), incident()], { ...base, band: 'night' });
    expect(r.rating).toBe('insufficient_data');
    expect(r.score).toBeNull();
    expect(r.breakdown.incidentCount).toBe(2);
  });

  it('ignores pending, rejected and out-of-window incidents', () => {
    const scored = Array.from({ length: 5 }, () => incident());
    const noise = [
      incident({ status: 'pending' }),
      incident({ status: 'rejected' }),
      incident({ occurred_at: '2024-01-01T20:00:00Z' }), // > 24 months old
    ];
    const a = computeScore(scored, { ...base, band: 'night' });
    const b = computeScore([...scored, ...noise], { ...base, band: 'night' });
    expect(b.score).toBe(a.score);
    expect(b.breakdown.incidentCount).toBe(5);
  });

  it('ignores incidents whose source is not registered', () => {
    const scored = Array.from({ length: 5 }, () => incident());
    const r = computeScore([...scored, incident({ source_id: 'unknown-blog' })], { ...base, band: 'night' });
    expect(r.breakdown.incidentCount).toBe(5);
  });

  it('weights night robbery higher at night than in the morning', () => {
    const list = Array.from({ length: 8 }, () => incident());
    const night = computeScore(list, { ...base, band: 'night' });
    const morning = computeScore(list, { ...base, band: 'morning' });
    expect(night.score!).toBeGreaterThan(morning.score!);
  });

  it('older incidents count less than recent ones', () => {
    const recent = Array.from({ length: 6 }, () => incident());
    const old = Array.from({ length: 6 }, () => incident({ occurred_at: '2025-01-01T20:00:00Z' }));
    expect(computeScore(recent, { ...base, band: 'night' }).score!).toBeGreaterThan(
      computeScore(old, { ...base, band: 'night' }).score!,
    );
  });

  it('confidence and source credibility reduce weight', () => {
    const high = Array.from({ length: 6 }, () => incident());
    const weak = Array.from({ length: 6 }, () => incident({ confidence: 'low', source_id: 'lt' }));
    expect(computeScore(high, { ...base, band: 'night' }).breakdown.weightedTotal).toBeGreaterThan(
      computeScore(weak, { ...base, band: 'night' }).breakdown.weightedTotal,
    );
  });

  it('busier area types need more incidents for the same score', () => {
    const list = Array.from({ length: 10 }, () => incident());
    const res = computeScore(list, { ...base, band: 'night', areaType: 'residential' });
    const hub = computeScore(list, { ...base, band: 'night', areaType: 'transport' });
    expect(res.score!).toBeGreaterThan(hub.score!);
  });

  it('stays within 0..100 for extreme inputs and reaches high', () => {
    const list = Array.from({ length: 200 }, () => incident({ severity: 5 }));
    const r = computeScore(list, { ...base, band: 'night' });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.rating).toBe('high');
  });

  it('builds a breakdown with top categories, substances and demo flags', () => {
    const list = [
      ...Array.from({ length: 4 }, () => incident({ category: 'theft', substance: 'alcohol' })),
      ...Array.from({ length: 2 }, () => incident({ category: 'assault', substance: 'cannabis', is_demo: true })),
    ];
    const r = computeScore(list, { ...base, band: 'evening' });
    expect(r.breakdown.topCategories[0]).toEqual({ key: 'theft', count: 4, share: 0.67 });
    expect(r.breakdown.topSubstances.map((s) => s.key)).toEqual(['alcohol', 'cannabis']);
    expect(r.breakdown.usesDemoData).toBe(true);
    expect(r.breakdown.demoShare).toBeCloseTo(0.33);
    expect(r.breakdown.latestPublishedAt).toBe('2026-06-02T08:00:00Z');
    expect(r.breakdown.daysSinceLatest).toBe(13);
    expect(r.breakdown.sourceIds).toEqual(['zps']);
  });

  it('computes every band and a conservative headline', () => {
    const list = Array.from({ length: 8 }, () => incident());
    const all = computeAllBands(list, base);
    expect(Object.keys(all)).toEqual(['morning', 'afternoon', 'evening', 'night']);
    expect(headlineRating(Object.values(all))).toBe(all.night.rating);
  });
});

describe('trend', () => {
  it('detects rising and falling reports', () => {
    const recent = Array.from({ length: 6 }, () => incident({ occurred_at: '2026-05-20T10:00:00Z' }));
    const prior = Array.from({ length: 2 }, () => incident({ occurred_at: '2026-01-20T10:00:00Z' }));
    expect(computeTrend([...recent, ...prior], NOW).trend).toBe('up');
    const fewRecent = [incident({ occurred_at: '2026-05-20T10:00:00Z' })];
    const morePrior = Array.from({ length: 6 }, () => incident({ occurred_at: '2026-01-20T10:00:00Z' }));
    expect(computeTrend([...fewRecent, ...morePrior], NOW).trend).toBe('down');
  });
  it('calls tiny samples stable', () => {
    expect(computeTrend([incident({ occurred_at: '2026-05-20T10:00:00Z' })], NOW).trend).toBe('stable');
  });
});
