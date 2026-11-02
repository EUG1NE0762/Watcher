import { handleAdmin } from '../functions/admin/handler';
import { contradictsEngine, handleAssistant, NO_DATA_LINE } from '../functions/assistant/handler';
import { createIngestHandler } from '../functions/ingest/handler';
import { HeuristicProvider } from '../functions/_shared/llm';
import { parseFeed, PoliteFetcher, robotsDisallows } from '../functions/_shared/rss';
import { handleRecompute } from '../functions/recompute-scores/handler';
import { handleSubmitReport } from '../functions/submit-report/handler';
import { handleVoiceBriefing } from '../functions/voice-briefing/handler';
import { asUser, FakeRepo, makeDeps, mockFetch, NOW, post, SERVICE_TOKEN } from './helpers/fake';

const json = async (res: Response) => (await res.json()) as Record<string, any>;
const ALICE = '11111111-1111-4111-8111-111111111111';

describe('common request handling', () => {
  it('answers CORS preflight and rejects GET', async () => {
    const { deps } = makeDeps(new FakeRepo());
    expect((await handleAssistant(post(null, undefined, 'OPTIONS'), deps)).status).toBe(200);
    expect((await handleAssistant(post(null, undefined, 'GET'), deps)).status).toBe(405);
  });
  it('validates input with zod', async () => {
    const { deps } = makeDeps(new FakeRepo());
    const res = await handleAssistant(post({ area_id: 'lsk-kanyama', question: '', band: 'noon' }), deps);
    expect(res.status).toBe(400);
  });
});

describe('assistant (Claude)', () => {
  const ask = { area_id: 'lsk-kanyama', question: 'Is it safe to walk here at night?', band: 'night' };

  it('without a key returns a grounded summary that matches the engine and cites sources', async () => {
    const repo = new FakeRepo();
    const { deps } = makeDeps(repo);
    const body = await json(await handleAssistant(post(ask), deps));
    const engine = repo.scores.find((s) => s.area_id === 'lsk-kanyama' && s.time_band === 'night')!;
    expect(body.mode).toBe('fallback');
    expect(body.rating).toBe(engine.rating);
    expect(body.answer).toContain(`${engine.score}/100`);
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.citations[0]).toEqual(expect.objectContaining({ source: expect.any(String), url: expect.stringMatching(/^https:/) }));
    expect(body.uses_demo_data).toBe(true);
    expect(body.answer).toContain('demo data');
    expect(body.disclaimer).toMatch(/guidance, not guarantees/);
  });

  it('refuses questions about individuals without calling the model', async () => {
    const { fetch, calls } = mockFetch();
    const { deps } = makeDeps(new FakeRepo(), { env: { ANTHROPIC_API_KEY: 'k' }, fetch });
    const body = await json(await handleAssistant(post({ ...ask, question: 'Who is the guy selling drugs at the market?' }), deps));
    expect(body.mode).toBe('refusal');
    expect(body.answer).toMatch(/never individuals/);
    expect(calls).toHaveLength(0);
  });

  it('says it has no verified data for an unrated area', async () => {
    const { deps } = makeDeps(new FakeRepo());
    const body = await json(await handleAssistant(post({ ...ask, area_id: 'lsk-ibex-hill' }), deps));
    expect(body.rating).toBe('insufficient_data');
    expect(body.answer).toContain(NO_DATA_LINE);
  });

  it('sends grounded context to Claude server-side and returns its cited answer', async () => {
    const repo = new FakeRepo();
    const rating = repo.scores.find((s) => s.area_id === 'lsk-kanyama' && s.time_band === 'night')!.rating;
    const { fetch, calls } = mockFetch([
      [/api\.anthropic\.com/, () => Response.json({ content: [{ type: 'text', text: `It is rated ${rating} at night [1][2]. Stay on lit roads.` }] })],
    ]);
    const { deps } = makeDeps(repo, { env: { ANTHROPIC_API_KEY: 'sk-test' }, fetch });
    const body = await json(await handleAssistant(post(ask), deps));
    expect(body.mode).toBe('claude');
    expect(body.citations.map((c: { n: number }) => c.n)).toEqual([1, 2]);
    const sent = JSON.parse(String(calls[0]!.init!.body));
    expect((calls[0]!.init!.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
    expect(sent.system).toContain('Use ONLY the facts inside <verified_data>');
    expect(sent.messages.at(-1).content).toContain('"engine_rating"');
  });

  it('replaces a model answer that contradicts the engine rating', async () => {
    const repo = new FakeRepo();
    const engine = repo.scores.find((s) => s.area_id === 'lsk-soweto' && s.time_band === 'night')!;
    const wrong = engine.rating === 'low' ? 'high' : 'low';
    const { fetch } = mockFetch([[/anthropic/, () => Response.json({ content: [{ type: 'text', text: `Honestly it's ${wrong} risk.` }] })]]);
    const { deps, logs } = makeDeps(repo, { env: { ANTHROPIC_API_KEY: 'k' }, fetch });
    const body = await json(await handleAssistant(post({ ...ask, area_id: 'lsk-soweto' }), deps));
    expect(body.mode).toBe('fallback');
    expect(logs.some((l) => l.event === 'assistant_guard')).toBe(true);
  });

  it('degrades gracefully when the API fails', async () => {
    const { fetch } = mockFetch([[/anthropic/, () => new Response('overloaded', { status: 529 })]]);
    const { deps } = makeDeps(new FakeRepo(), { env: { ANTHROPIC_API_KEY: 'k' }, fetch });
    const res = await handleAssistant(post(ask), deps);
    expect(res.status).toBe(200);
    expect((await json(res)).mode).toBe('fallback');
  });

  it('detects rating contradictions', () => {
    expect(contradictsEngine('This is a high-risk area', 'low')).toBe(true);
    expect(contradictsEngine('Rated moderate in the evening', 'moderate')).toBe(false);
    expect(contradictsEngine('Medium risk', 'moderate')).toBe(false);
    expect(contradictsEngine('Low risk overall', 'insufficient_data')).toBe(true);
  });
});

describe('voice-briefing (ElevenLabs)', () => {
  const req = { area_id: 'lsk-cbd', band: 'evening', role: 'driver', language: 'en' };

  it('falls back to on-device TTS text when no key is configured', async () => {
    const { deps } = makeDeps(new FakeRepo());
    const body = await json(await handleVoiceBriefing(post(req), deps));
    expect(body).toMatchObject({ audio_url: null, fallback: 'device_tts' });
    expect(body.text).toMatch(/Cairo Road \/ CBD, evening/);
    expect(body.text).toMatch(/demo data/);
  });

  it('generates once, caches per area+rating+day, then serves the cache', async () => {
    const repo = new FakeRepo();
    const { fetch, calls } = mockFetch([[/api\.elevenlabs\.io/, () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })]]);
    const { deps } = makeDeps(repo, { env: { ELEVENLABS_API_KEY: 'xi' }, fetch });
    const first = await json(await handleVoiceBriefing(post(req), deps));
    expect(first).toMatchObject({ cached: false, fallback: null });
    expect(first.audio_url).toContain(`lsk-cbd/${NOW.toISOString().slice(0, 10)}/evening-`);
    const second = await json(await handleVoiceBriefing(post(req), deps));
    expect(second).toMatchObject({ cached: true, audio_url: first.audio_url });
    expect(calls).toHaveLength(1);
  });

  it('falls back when ElevenLabs errors', async () => {
    const { fetch } = mockFetch([[/elevenlabs/, () => new Response('quota', { status: 401 })]]);
    const { deps } = makeDeps(new FakeRepo(), { env: { ELEVENLABS_API_KEY: 'xi' }, fetch });
    expect(await json(await handleVoiceBriefing(post(req), deps))).toMatchObject({ audio_url: null, fallback: 'device_tts' });
  });
});

describe('submit-report (community)', () => {
  const report = { area_id: 'lsk-cbd', type: 'theft', note: 'Phone snatched near the bus stop around 8pm' };

  it('requires sign-in', async () => {
    const { deps } = makeDeps(new FakeRepo());
    expect((await handleSubmitReport(post(report), deps)).status).toBe(401);
  });

  it('rejects abusive or identifying notes', async () => {
    const { deps } = makeDeps(new FakeRepo());
    const res = await handleSubmitReport(post({ ...report, note: 'junkies everywhere, call 0977 123 456' }, asUser(ALICE)), deps);
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.reasons).toEqual(expect.arrayContaining(['stigmatising_language', 'personal_contact_details']));
  });

  it('stores reports as pending and rate-limits floods', async () => {
    const repo = new FakeRepo();
    const { deps } = makeDeps(repo);
    for (let i = 0; i < 5; i++) expect((await handleSubmitReport(post(report, asUser(ALICE)), deps)).status).toBe(201);
    expect((await handleSubmitReport(post(report, asUser(ALICE)), deps)).status).toBe(429);
    expect(repo.reports.every((r) => r.status === 'pending')).toBe(true);
  });

  it('unverified community reports never change a rating', async () => {
    const repo = new FakeRepo();
    const { deps } = makeDeps(repo);
    const service = post({ area_ids: ['lsk-woodlands'] }, SERVICE_TOKEN);
    await handleRecompute(service, deps);
    const before = JSON.stringify(await repo.getScores('lsk-woodlands'));
    for (let i = 0; i < 5; i++) {
      await handleSubmitReport(post({ ...report, area_id: 'lsk-woodlands', type: 'robbery', note: `Robbery reported at night number ${i}` }, asUser(`u${i}`)), deps);
    }
    await handleRecompute(post({ area_ids: ['lsk-woodlands'] }, SERVICE_TOKEN), deps);
    expect(JSON.stringify(await repo.getScores('lsk-woodlands'))).toBe(before);
  });

  it('auto-approves only when a verified credible (non-demo) incident corroborates it', async () => {
    const repo = new FakeRepo();
    repo.incidents.push({
      id: 'real-1',
      area_id: 'lsk-cbd',
      category: 'theft',
      severity: 2,
      substance: null,
      occurred_at: '2026-06-14T18:00:00Z',
      published_at: '2026-06-15T06:00:00Z',
      source_id: 'zps',
      source_url: 'https://www.zambiapolice.gov.zm/press/1',
      summary: 'Phone theft reported near Cairo Road',
      confidence: 'high',
      status: 'verified',
      is_demo: false,
      raw_text_hash: 'h1',
      source_ids: ['zps'],
    });
    const { deps } = makeDeps(repo);
    const body = await json(await handleSubmitReport(post(report, asUser(ALICE)), deps));
    expect(body.report).toMatchObject({ status: 'approved', corroborated_by_incident_id: 'real-1' });
  });
});

describe('recompute-scores', () => {
  it('is service-only', async () => {
    const { deps } = makeDeps(new FakeRepo());
    expect((await handleRecompute(post({}, asUser(ALICE)), deps)).status).toBe(403);
  });

  it('recomputes and pushes an alert to watchers when a saved area changes rating', async () => {
    const repo = new FakeRepo();
    repo.addUser(ALICE, { push_token: 'ExponentPushToken[abc]' });
    repo.saved.push({ id: 's1', user_id: ALICE, area_id: 'lsk-emmasdale', last_rating: 'low' });
    // Remove Emmasdale's data so its rating changes to insufficient_data
    repo.incidents = repo.incidents.filter((i) => i.area_id !== 'lsk-emmasdale');
    const { fetch, calls } = mockFetch([[/exp\.host/, () => Response.json({ data: [] })]]);
    const { deps } = makeDeps(repo, { fetch });
    const body = await json(await handleRecompute(post({ area_ids: ['lsk-emmasdale'] }, SERVICE_TOKEN), deps));
    expect(body.changed).toEqual([expect.objectContaining({ areaId: 'lsk-emmasdale', next: 'insufficient_data' })]);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]!.init!.body))[0]).toMatchObject({ to: 'ExponentPushToken[abc]', data: { area_id: 'lsk-emmasdale' } });
    expect(repo.saved[0]!.last_rating).toBe('insufficient_data');
  });
});

const rss = (items: Array<{ title: string; link: string; date?: string; desc?: string }>) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items
    .map(
      (i) =>
        `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><pubDate>${i.date ?? 'Sat, 13 Jun 2026 08:00:00 +0000'}</pubDate><description><![CDATA[<p>${i.desc ?? i.title}</p>]]></description></item>`,
    )
    .join('')}</channel></rss>`;

describe('ingest (pipeline)', () => {
  function setup(feeds: Record<string, string>, robots: Record<string, string> = {}) {
    const repo = new FakeRepo({ demo: false });
    repo.sources = repo.sources.map((s) => ({ ...s, feeds: feeds[s.id] ? [`${s.base_url}/feed/`] : [] }));
    const routes: Array<[RegExp, (url: string) => Response]> = [
      [/robots\.txt$/, (url) => new Response(robots[new URL(url).host] ?? '', { status: robots[new URL(url).host] ? 200 : 404 })],
      [/\/feed\/$/, (url) => {
        const src = repo.sources.find((s) => url.startsWith(s.base_url))!;
        return new Response(feeds[src.id]!, { status: 200 });
      }],
      [/exp\.host/, () => Response.json({ data: [] })],
      [/nominatim/, () => Response.json([])],
    ];
    const { fetch, calls } = mockFetch(routes);
    const { deps } = makeDeps(repo, { fetch });
    const handler = createIngestHandler({ provider: new HeuristicProvider(), fetcher: new PoliteFetcher(fetch, 0, async () => {}) });
    return { repo, deps, handler, calls };
  }

  it('never pins a story that only names a town on that town centre', async () => {
    const repo = new FakeRepo({ demo: false });
    repo.sources = repo.sources.map((s) => ({ ...s, feeds: s.id === 'lusaka_times' ? [`${s.base_url}/feed/`] : [] }));
    const feed = rss([{ title: 'Police probe theft case', link: 'https://www.lusakatimes.com/2026/06/theft-case' }]);
    const { fetch, calls } = mockFetch([
      [/robots\.txt$/, () => new Response('', { status: 404 })],
      [/\/feed\/$/, () => new Response(feed, { status: 200 })],
      [/exp\.host/, () => Response.json({ data: [] })],
      // would land inside the Lusaka CBD area if it were ever asked
      [/nominatim/, () => Response.json([{ lat: '-15.4167', lon: '28.2833' }])],
    ]);
    const { deps } = makeDeps(repo, { fetch });
    const provider = {
      name: 'stub',
      extractIncidents: async () => [
        { is_incident: true, category: 'theft' as const, substance: null, location_text: 'Lusaka', city: 'Lusaka', occurred_at: null, severity: 2, summary: 'Theft reported to police in Lusaka.' },
      ],
    };
    const handler = createIngestHandler({ provider, fetcher: new PoliteFetcher(fetch, 0, async () => {}) });
    await handler(post({}, SERVICE_TOKEN), deps);
    expect(calls.some((c) => c.url.includes('nominatim'))).toBe(false);
    expect(repo.incidents.find((i) => i.source_url.endsWith('theft-case'))).toMatchObject({ status: 'pending', area_id: '' });
  });

  it('is service-only', async () => {
    const { deps, handler } = setup({});
    expect((await handler(post({}, asUser(ALICE)), deps)).status).toBe(403);
  });

  it('verifies, queues, rejects and dedupes, then recomputes scores', async () => {
    const { repo, deps, handler } = setup({
      zps: rss([
        { title: 'Police arrest two suspects over aggravated robbery in Kanyama', link: 'https://www.zambiapolice.gov.zm/2026/06/robbery-kanyama' },
        { title: 'Police officers attend graduation ceremony', link: 'https://www.zambiapolice.gov.zm/2026/06/graduation' },
        // feed item whose link points off-site: cannot be traced to the source, must be rejected
        { title: 'Theft of phones reported in Matero', link: 'https://random-blog.example/matero-theft' },
      ]),
      lusaka_times: rss([
        { title: 'Burglary: thieves broke into houses in Chilenje', link: 'https://www.lusakatimes.com/2026/06/chilenje-burglary' },
        { title: 'Robbery suspects in Kanyama arrested, police say', link: 'https://www.lusakatimes.com/2026/06/kanyama-robbery' },
        { title: 'Cannabis trafficking case in Lusaka township', link: 'https://www.lusakatimes.com/2026/06/cannabis-lusaka' },
        { title: 'Theft of cattle reported in Mongu', link: 'https://www.lusakatimes.com/2026/06/mongu' },
      ]),
    });

    const body = await json(await handler(post({}, SERVICE_TOKEN), deps));
    expect(body.provider).toBe('heuristic');
    expect(body.feeds_ok).toBe(2);

    const kanyama = repo.incidents.filter((i) => i.area_id === 'lsk-kanyama');
    expect(kanyama).toHaveLength(1);
    // official source => verified + high; the Lusaka Times story corroborated it instead of duplicating it
    expect(kanyama[0]).toMatchObject({ status: 'verified', confidence: 'high', source_id: 'zps' });
    expect(kanyama[0]!.source_ids).toEqual(['zps', 'lusaka_times']);
    expect(body.corroborated).toBe(1);

    expect(repo.incidents.find((i) => i.area_id === 'lsk-chilenje')).toMatchObject({ status: 'verified', confidence: 'medium' });
    // mentions Lusaka but no mappable area => pending manual review
    expect(repo.incidents.find((i) => i.source_url.endsWith('cannabis-lusaka'))).toMatchObject({ status: 'pending', area_id: '' });
    // untraceable link => rejected, never stored
    expect(body.rejected).toBe(1);
    expect(body.rejections[0].reason).toMatch(/cannot be traced/);
    expect(repo.incidents.some((i) => i.source_url.includes('random-blog'))).toBe(false);
    // out of coverage (Mongu) and non-crime stories are skipped
    expect(body.out_of_coverage).toBe(1);
    expect(repo.incidents.some((i) => i.summary.includes('graduation'))).toBe(false);
    // only the summary + URL are stored, never full text
    expect(Object.keys(kanyama[0]!)).not.toContain('raw_text');
    expect(body.recomputed).toBeGreaterThan(0);
    expect(repo.runs).toHaveLength(1);

    // second run: everything already known
    const again = await json(await handler(post({}, SERVICE_TOKEN), deps));
    expect(again.accepted_verified + again.accepted_pending).toBe(0);
  });

  it('respects robots.txt', async () => {
    const { repo, deps, handler } = setup(
      { zps: rss([{ title: 'Robbery in Kanyama', link: 'https://www.zambiapolice.gov.zm/x' }]) },
      { 'www.zambiapolice.gov.zm': 'User-agent: *\nDisallow: /feed/' },
    );
    const body = await json(await handler(post({}, SERVICE_TOKEN), deps));
    expect(body.feeds_failed).toBe(1);
    expect(repo.incidents).toHaveLength(0);
  });

  it('parses RSS and robots rules', () => {
    expect(parseFeed(rss([{ title: 'A &amp; B', link: 'https://x.zm/a' }]))[0]).toMatchObject({ title: 'A & B', link: 'https://x.zm/a' });
    expect(robotsDisallows('User-agent: *\nDisallow: /wp-admin/', '/wp-admin/x')).toBe(true);
    expect(robotsDisallows('User-agent: *\nDisallow: /wp-admin/', '/feed/')).toBe(false);
    expect(robotsDisallows('User-agent: Googlebot\nDisallow: /', '/feed/')).toBe(false);
  });
});

describe('admin (moderation + verified import)', () => {
  const MOD = '22222222-2222-4222-8222-222222222222';

  it('is moderator-only', async () => {
    const repo = new FakeRepo({ demo: false });
    repo.addUser(ALICE);
    const { deps } = makeDeps(repo);
    expect((await handleAdmin(post({ action: 'list_pending' }), deps)).status).toBe(401);
    expect((await handleAdmin(post({ action: 'list_pending' }, asUser(ALICE)), deps)).status).toBe(403);
  });

  it('imports official CSV rows, rejecting rows without a credible source', async () => {
    const repo = new FakeRepo({ demo: false });
    repo.addUser(MOD, { is_moderator: true });
    const { fetch } = mockFetch([[/exp\.host/, () => Response.json({})]]);
    const { deps } = makeDeps(repo, { fetch });
    const csv = [
      'area,category,severity,substance,occurred_at,published_date,source,source_url,summary',
      'Kanyama,robbery,4,alcohol,2026-06-01,2026-06-02,Zambia Police Service,https://www.zambiapolice.gov.zm/press/77,Robbery of a trader reported to police',
      'Matero,theft,2,,2026-06-01,2026-06-02,WhatsApp,https://chat.example/forward,Unverified forward about theft',
      'Nowhere,theft,2,,2026-06-01,2026-06-02,ZNBC,https://www.znbc.co.zm/n/1,Theft at an unknown place',
    ].join('\n');
    const body = await json(await handleAdmin(post({ action: 'import', kind: 'incidents', format: 'csv', data: csv }, asUser(MOD)), deps));
    expect(body).toMatchObject({ accepted_verified: 1, accepted_pending: 1, rejected: 1 });
    expect(repo.scores.filter((s) => s.area_id === 'lsk-kanyama')).toHaveLength(4);
  });

  it('lists the queue without user ids and lets moderators verify with an area', async () => {
    const repo = new FakeRepo({ demo: false });
    repo.addUser(MOD, { is_moderator: true });
    await repo.insertReport({ area_id: 'lsk-cbd', user_id: ALICE, type: 'theft', note: 'bag snatched', lat: null, lng: null, status: 'pending', corroborated_by_incident_id: null });
    const id = await repo.insertIncident({
      area_id: null, category: 'theft', severity: 2, substance: null, occurred_at: NOW.toISOString(), published_at: NOW.toISOString(),
      source_id: 'znbc', source_url: 'https://www.znbc.co.zm/a', summary: 'Theft reported in a Lusaka township', location_text: 'township',
      confidence: 'medium', status: 'pending', raw_text_hash: 'h', review_note: null,
    });
    const { deps } = makeDeps(repo, { fetch: mockFetch([[/exp\.host/, () => Response.json({})]]).fetch });
    const list = await json(await handleAdmin(post({ action: 'list_pending' }, asUser(MOD)), deps));
    expect(list.incidents).toHaveLength(1);
    expect(list.reports[0]).not.toHaveProperty('user_id');

    const noArea = await handleAdmin(post({ action: 'review_incident', id, decision: 'verify' }, asUser(MOD)), deps);
    expect(noArea.status).toBe(400);
    const ok = await json(await handleAdmin(post({ action: 'review_incident', id, decision: 'verify', area_id: 'lsk-kalingalinga' }, asUser(MOD)), deps));
    expect(ok.incident).toMatchObject({ status: 'verified', area_id: 'lsk-kalingalinga' });
  });
});
