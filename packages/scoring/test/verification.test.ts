import {
  assessCandidate,
  confidenceFor,
  findCorroboratingIncident,
  resolveSource,
  textHash,
  type Incident,
  type IncidentCandidate,
  type Source,
} from '../src/index.ts';

const SOURCES: Source[] = [
  { id: 'zps', name: 'Zambia Police Service', type: 'official', base_url: 'https://www.zambiapolice.gov.zm', credibility_weight: 1 },
  { id: 'znbc', name: 'ZNBC', type: 'media', base_url: 'https://www.znbc.co.zm', credibility_weight: 0.9 },
  { id: 'lt', name: 'Lusaka Times', type: 'media', base_url: 'https://www.lusakatimes.com', credibility_weight: 0.7 },
  { id: 'weak', name: 'Weak Blog', type: 'media', base_url: 'https://weak.example', credibility_weight: 0.3 },
  {
    id: 'zwd',
    name: 'Zambian Watchdog',
    type: 'media',
    base_url: 'https://www.zambianwatchdog.com',
    credibility_weight: 0.4,
    requires_corroboration: true,
  },
  { id: 'demo', name: 'Demo', type: 'demo', base_url: 'https://example.org/watcher-demo', credibility_weight: 1 },
];
const NOW = new Date('2026-06-15T10:00:00Z');

function candidate(over: Partial<IncidentCandidate> = {}): IncidentCandidate {
  return {
    source_url: 'https://www.lusakatimes.com/2026/06/10/robbery-kanyama',
    published_at: '2026-06-10T09:00:00Z',
    occurred_at: '2026-06-09T20:00:00Z',
    area_id: 'lsk-kanyama',
    category: 'robbery',
    severity: 4,
    substance: 'alcohol',
    summary: 'Two men robbed a trader of cash in Kanyama on Tuesday night, police said.',
    raw_text: 'Full article text about a robbery in Kanyama',
    ...over,
  };
}

const ctx = { sources: SOURCES, existing: [], now: NOW };

describe('confidenceFor', () => {
  it('official => high, 2 credible => high, 1 credible => medium, weak => low', () => {
    expect(confidenceFor([SOURCES[0]!])).toBe('high');
    expect(confidenceFor([SOURCES[1]!, SOURCES[2]!])).toBe('high');
    expect(confidenceFor([SOURCES[2]!])).toBe('medium');
    expect(confidenceFor([SOURCES[3]!])).toBe('low');
    // the same outlet twice is not independent
    expect(confidenceFor([SOURCES[2]!, SOURCES[2]!])).toBe('medium');
  });
});

describe('resolveSource', () => {
  it('matches by host, including subdomains', () => {
    expect(resolveSource({ source_url: 'https://news.znbc.co.zm/a' }, SOURCES)?.id).toBe('znbc');
  });
  it('refuses a claimed source whose URL is on another host', () => {
    expect(resolveSource({ source_id: 'zps', source_url: 'https://random-blog.com/x' }, SOURCES)).toBeNull();
  });
});

describe('assessCandidate: records without a credible source are rejected', () => {
  it('rejects an unknown outlet', () => {
    const r = assessCandidate(candidate({ source_url: 'https://whatsapp-forward.example/abc' }), ctx);
    expect(r.decision).toBe('reject');
  });
  it('rejects a missing or malformed URL', () => {
    expect(assessCandidate(candidate({ source_url: '' }), ctx).decision).toBe('reject');
    expect(assessCandidate(candidate({ source_url: 'not a url' }), ctx).decision).toBe('reject');
  });
  it('rejects missing or future published dates', () => {
    expect(assessCandidate(candidate({ published_at: '' }), ctx).decision).toBe('reject');
    expect(assessCandidate(candidate({ published_at: '2027-01-01T00:00:00Z' }), ctx).decision).toBe('reject');
  });
  it('rejects an uncorroborated Zambian Watchdog story', () => {
    const r = assessCandidate(candidate({ source_url: 'https://www.zambianwatchdog.com/story' }), ctx);
    expect(r.decision).toBe('reject');
  });
  it('rejects demo-source records entering the live pipeline', () => {
    expect(assessCandidate(candidate({ source_url: 'https://example.org/watcher-demo/x' }), ctx).decision).toBe('reject');
  });
});

describe('assessCandidate: accepted records', () => {
  it('verifies an official record with high confidence', () => {
    const r = assessCandidate(candidate({ source_url: 'https://www.zambiapolice.gov.zm/press/1' }), ctx);
    expect(r).toMatchObject({ decision: 'accept', status: 'verified', confidence: 'high' });
  });
  it('verifies one credible outlet at medium confidence', () => {
    expect(assessCandidate(candidate(), ctx)).toMatchObject({ decision: 'accept', status: 'verified', confidence: 'medium' });
  });
  it('queues a weak single source as pending', () => {
    const r = assessCandidate(candidate({ source_url: 'https://weak.example/a' }), ctx);
    expect(r).toMatchObject({ decision: 'accept', status: 'pending', confidence: 'low' });
  });
  it('queues unmappable locations as pending', () => {
    expect(assessCandidate(candidate({ area_id: null }), ctx)).toMatchObject({ decision: 'accept', status: 'pending' });
  });
});

describe('dedupe and corroboration', () => {
  const existingIncident: Incident & { raw_text_hash: string } = {
    id: 'inc-1',
    area_id: 'lsk-kanyama',
    category: 'robbery',
    severity: 4,
    substance: null,
    occurred_at: '2026-06-09T21:00:00Z',
    published_at: '2026-06-10T08:00:00Z',
    source_id: 'lt',
    source_url: 'https://www.lusakatimes.com/2026/06/10/robbery-kanyama',
    summary: 'Trader robbed of cash by two men in Kanyama on Tuesday night',
    confidence: 'medium',
    status: 'verified',
    is_demo: false,
    raw_text_hash: textHash('Full article text about a robbery in Kanyama'),
  };

  it('flags exact re-ingestion as a duplicate', () => {
    const r = assessCandidate(candidate(), { ...ctx, existing: [existingIncident] });
    expect(r.decision).toBe('duplicate');
  });

  it('a second independent outlet corroborates and raises confidence to high', () => {
    const r = assessCandidate(
      candidate({ source_url: 'https://www.znbc.co.zm/news/robbery', raw_text: 'Different ZNBC article text' }),
      { ...ctx, existing: [existingIncident] },
    );
    expect(r).toMatchObject({ decision: 'corroborate', incidentId: 'inc-1', newConfidence: 'high' });
  });

  it('a corroborating Zambian Watchdog story attaches but does not raise confidence', () => {
    const r = assessCandidate(
      candidate({ source_url: 'https://www.zambianwatchdog.com/r', raw_text: 'Watchdog article' }),
      { ...ctx, existing: [existingIncident] },
    );
    expect(r).toMatchObject({ decision: 'corroborate', newConfidence: 'medium' });
  });

  it('a different incident type in the same area is not a duplicate', () => {
    const r = assessCandidate(
      candidate({ category: 'burglary', raw_text: 'burglary article', summary: 'House broken into in Kanyama, police say' }),
      { ...ctx, existing: [existingIncident] },
    );
    expect(r.decision).toBe('accept');
  });
});

describe('community report corroboration', () => {
  const verified: Incident = {
    id: 'v1',
    area_id: 'a1',
    category: 'theft',
    severity: 2,
    substance: null,
    occurred_at: '2026-06-10T10:00:00Z',
    published_at: '2026-06-11T10:00:00Z',
    source_id: 'zps',
    source_url: 'https://www.zambiapolice.gov.zm/1',
    summary: 'Phone theft at market',
    confidence: 'high',
    status: 'verified',
    is_demo: false,
  };
  it('matches a nearby verified incident of a compatible type', () => {
    expect(findCorroboratingIncident({ area_id: 'a1', type: 'theft', created_at: '2026-06-12T10:00:00Z' }, [verified])?.id).toBe('v1');
  });
  it('never corroborates with demo, pending, other-area or distant incidents', () => {
    const r = { area_id: 'a1', type: 'theft' as const, created_at: '2026-06-12T10:00:00Z' };
    expect(findCorroboratingIncident(r, [{ ...verified, is_demo: true }])).toBeNull();
    expect(findCorroboratingIncident(r, [{ ...verified, status: 'pending' }])).toBeNull();
    expect(findCorroboratingIncident(r, [{ ...verified, area_id: 'a2' }])).toBeNull();
    expect(findCorroboratingIncident({ ...r, created_at: '2026-08-01T00:00:00Z' }, [verified])).toBeNull();
  });
});
