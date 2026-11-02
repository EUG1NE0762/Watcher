import lusaka from '../../../supabase/seed/data/areas/lusaka.json';
import profiles from '../../../supabase/seed/data/demo-profiles.json';
import {
  areaAtPoint,
  buildAreas,
  buildBriefingText,
  checkRateLimit,
  communityReportInputSchema,
  computeAllBands,
  corridorAreas,
  DEMO_SOURCE,
  generateDemoIncidents,
  getPrecautions,
  importIncidentSchema,
  matchLocationText,
  moderateText,
  parseCsv,
  searchAreas,
  type AreaSeed,
  type DemoProfile,
} from '../src/index.ts';

const areas = buildAreas(lusaka as AreaSeed[]);

describe('area search', () => {
  it('finds Kanyama by full and partial names', () => {
    expect(searchAreas('Kanyama', areas)[0]?.area.id).toBe('lsk-kanyama');
    expect(searchAreas('kany', areas)[0]?.area.id).toBe('lsk-kanyama');
  });
  it('matches aliases and tolerates typos', () => {
    expect(searchAreas('intercity', areas)[0]?.area.id).toBe('lsk-intercity');
    expect(searchAreas('cairo', areas)[0]?.area.id).toBe('lsk-cbd');
    expect(searchAreas('Chilenji', areas)[0]?.area.id).toBe('lsk-chilenje');
  });
  it('returns nothing for empty input', () => {
    expect(searchAreas('  ', areas)).toEqual([]);
  });
});

describe('location mapping', () => {
  it('maps free text to an area', () => {
    expect(matchLocationText('Police arrested two suspects near Soweto Market in Lusaka', areas)?.id).toBe('lsk-soweto');
    expect(matchLocationText('a burglary in Kabulonga', areas)?.id).toBe('lsk-kabulonga');
  });
  it('returns null when the location is unknown', () => {
    expect(matchLocationText('an incident in Mongu town', areas)).toBeNull();
  });
  it('finds the area at a point on-device and rejects far points', () => {
    expect(areaAtPoint({ lat: -15.437, lng: 28.244 }, areas)?.id).toBe('lsk-kanyama');
    expect(areaAtPoint({ lat: -12.8, lng: 28.2 }, areas)).toBeNull();
  });
  it('lists areas along a straight-line corridor', () => {
    const ids = corridorAreas({ lat: -15.437, lng: 28.244 }, { lat: -15.418, lng: 28.283 }, areas).map((a) => a.id);
    expect(ids[0]).toBe('lsk-kanyama');
    expect(ids).toContain('lsk-cbd');
  });
});

describe('moderation', () => {
  it('passes a normal report', () => {
    expect(moderateText('Phone snatched near the bus stop around 8pm').ok).toBe(true);
  });
  it('blocks profanity, stigmatising labels and personal details', () => {
    expect(moderateText('this place is shit').reasons).toContain('profanity');
    expect(moderateText('junkies everywhere').reasons).toContain('stigmatising_language');
    expect(moderateText('call him on 0977 123 456').reasons).toContain('personal_contact_details');
    expect(moderateText('see https://spam.example').reasons).toContain('links_not_allowed');
  });
  it('rate limits after 5 reports an hour', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const five = Array.from({ length: 5 }, (_, i) => new Date(now.getTime() - i * 60_000));
    expect(checkRateLimit(five.slice(0, 4), now).allowed).toBe(true);
    expect(checkRateLimit(five, now).allowed).toBe(false);
    expect(checkRateLimit([new Date('2026-06-01T10:00:00Z')], now).allowed).toBe(true);
  });
});

describe('schemas', () => {
  it('validates community reports', () => {
    expect(communityReportInputSchema.safeParse({ area_id: 'lsk-cbd', type: 'theft', note: 'Bag snatched' }).success).toBe(true);
    expect(communityReportInputSchema.safeParse({ area_id: 'lsk-cbd', type: 'person', note: 'x' }).success).toBe(false);
  });
  it('parses CSV import rows', () => {
    const rows = parseCsv(
      'area,category,severity,substance,occurred_at,published_date,source,source_url,summary\n' +
        'Kanyama,robbery,4,,2026-05-01,2026-05-02,Zambia Police Service,https://www.zambiapolice.gov.zm/p/1,"Robbery, reported to police"\n',
    );
    expect(rows).toHaveLength(1);
    const parsed = importIncidentSchema.parse(rows[0]);
    expect(parsed.substance).toBeNull();
    expect(parsed.summary).toBe('Robbery, reported to police');
  });
});

describe('demo dataset', () => {
  const now = new Date('2026-06-15T10:00:00Z');
  const demo = generateDemoIncidents(areas, profiles as DemoProfile[], now);

  it('labels every record as demo and never cites a real outlet', () => {
    expect(demo.length).toBeGreaterThan(100);
    for (const i of demo) {
      expect(i.is_demo).toBe(true);
      expect(i.source_id).toBe(DEMO_SOURCE.id);
      expect(i.source_url.startsWith('https://example.org/')).toBe(true);
      expect(i.summary.startsWith('[DEMO]')).toBe(true);
    }
  });
  it('is deterministic for a given day', () => {
    expect(generateDemoIncidents(areas, profiles as DemoProfile[], now)).toEqual(demo);
  });
  it('produces a range of ratings including insufficient data', () => {
    const ratings = new Set(
      areas.map((a) =>
        computeAllBands(
          demo.filter((i) => i.area_id === a.id),
          { areaId: a.id, areaType: a.area_type, sources: [DEMO_SOURCE], now },
        ).night.rating,
      ),
    );
    expect(ratings).toEqual(new Set(['low', 'moderate', 'high', 'insufficient_data']));
  });
});

describe('precautions and briefing', () => {
  it('gives drivers driver-specific night advice for high-risk drop-offs', () => {
    const p = getPrecautions({ role: 'driver', band: 'night', rating: 'high', topCategories: ['robbery'] });
    expect(p).toEqual(expect.arrayContaining(['driver_no_stop_hotspots', 'driver_doors_locked', 'driver_cashless']));
  });
  it('is honest when data is insufficient', () => {
    expect(getPrecautions({ role: 'visitor', band: 'morning', rating: 'insufficient_data', topCategories: [] })).toContain('insufficient');
  });
  it('builds a short briefing that carries the demo warning and disclaimer', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    const kanyama = generateDemoIncidents(areas, profiles as DemoProfile[], now).filter((i) => i.area_id === 'lsk-kanyama');
    const score = computeAllBands(kanyama, { areaId: 'lsk-kanyama', areaType: 'residential', sources: [DEMO_SOURCE], now }).night;
    const text = buildBriefingText({
      areaName: 'Kanyama',
      score,
      precautions: getPrecautions({ role: 'visitor', band: 'night', rating: score.rating, topCategories: score.breakdown.topCategories.map((c) => c.key) }),
    });
    const words = text.split(/\s+/).length;
    expect(words).toBeGreaterThan(40);
    expect(words).toBeLessThan(120);
    expect(text).toContain('demo data');
    expect(text).toContain('guidance, not guarantees');
  });
});
