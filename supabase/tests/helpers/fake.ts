import lusaka from '../../seed/data/areas/lusaka.json';
import profiles from '../../seed/data/demo-profiles.json';
import sourcesJson from '../../seed/data/sources.json';
import {
  buildAreas,
  computeAllBands,
  DEMO_SOURCE,
  generateDemoIncidents,
  type Area,
  type AreaSeed,
  type DemoProfile,
  type Incident,
  type ScoreResult,
  type Source,
} from '@watcher/scoring';
import type { Deps } from '../../functions/_shared/http';
import type { CommunityReport, NewIncident, OfficialStat, Profile, Repo, SavedPlaceWatcher, StoredIncident } from '../../functions/_shared/repo';

export const NOW = new Date('2026-06-15T10:00:00Z');
export const SERVICE_TOKEN = 'service-role-test-token';

type Saved = { id: string; user_id: string; area_id: string; last_rating: string | null };

/** In-memory Repo mirroring the Supabase implementation's semantics (incl. "verified only" reads). */
export class FakeRepo implements Repo {
  areas: Area[] = buildAreas(lusaka as AreaSeed[]);
  sources: Source[] = [...(sourcesJson as Source[]), DEMO_SOURCE];
  incidents: StoredIncident[] = [];
  scores: ScoreResult[] = [];
  reports: CommunityReport[] = [];
  profiles = new Map<string, Profile & { push_token: string | null; notify_rating_changes: boolean; notify_incidents: boolean }>();
  saved: Saved[] = [];
  stats: OfficialStat[] = [];
  runs: Record<string, unknown>[] = [];
  audio = new Map<string, Uint8Array>();
  private seq = 0;

  constructor(opts: { demo?: boolean } = {}) {
    if (opts.demo !== false) {
      const demo = generateDemoIncidents(this.areas, profiles as DemoProfile[], NOW);
      this.incidents = demo.map((i) => ({ ...i, raw_text_hash: `demo:${i.id}`, source_ids: [i.source_id] }));
      for (const a of this.areas) {
        const all = computeAllBands(
          this.incidents.filter((i) => i.area_id === a.id),
          { areaId: a.id, areaType: a.area_type, sources: this.sources, now: NOW },
        );
        this.scores.push(...Object.values(all));
      }
    }
  }

  async listAreas() {
    return this.areas;
  }
  async getArea(id: string) {
    return this.areas.find((a) => a.id === id) ?? null;
  }
  async listSources() {
    return this.sources;
  }
  async listVerifiedIncidents(areaId: string, sinceIso: string): Promise<Incident[]> {
    return this.incidents.filter((i) => i.area_id === areaId && i.status === 'verified' && i.occurred_at >= sinceIso);
  }
  async listIncidentsForDedupe(sinceIso: string) {
    return this.incidents.filter((i) => !i.is_demo && i.published_at >= sinceIso).map((i) => ({ ...i }));
  }
  async insertIncident(row: NewIncident) {
    if (this.incidents.some((i) => i.raw_text_hash === row.raw_text_hash)) throw new Error('duplicate raw_text_hash');
    if (row.status === 'verified' && !row.area_id) throw new Error('verified_has_area');
    const id = `inc-${++this.seq}`;
    this.incidents.push({ ...row, id, area_id: row.area_id ?? '', is_demo: false, source_ids: [row.source_id] });
    return id;
  }
  async addCorroboration(incidentId: string, sourceId: string, _url: string, _published: string, confidence: Incident['confidence']) {
    const i = this.incidents.find((x) => x.id === incidentId)!;
    i.source_ids = [...new Set([...i.source_ids, sourceId])];
    i.confidence = confidence;
    i.corroboration_count = i.source_ids.length;
  }
  async getIncident(id: string) {
    return this.incidents.find((i) => i.id === id) ?? null;
  }
  async listPendingIncidents(limit: number) {
    return this.incidents.filter((i) => i.status === 'pending').slice(0, limit);
  }
  async reviewIncident(id: string, patch: Parameters<Repo['reviewIncident']>[1]) {
    const i = this.incidents.find((x) => x.id === id);
    if (!i) return null;
    Object.assign(i, patch, patch.area_id === undefined ? {} : { area_id: patch.area_id ?? '' });
    return i;
  }
  async getScores(areaId: string) {
    return this.scores.filter((s) => s.area_id === areaId);
  }
  async upsertScores(scores: ScoreResult[]) {
    for (const s of scores) {
      this.scores = this.scores.filter((x) => !(x.area_id === s.area_id && x.time_band === s.time_band));
      this.scores.push(s);
    }
  }
  async getProfile(userId: string) {
    return this.profiles.get(userId) ?? null;
  }
  async listReportTimes(userId: string, sinceIso: string) {
    return this.reports.filter((r) => r.user_id === userId && r.created_at > sinceIso).map((r) => r.created_at);
  }
  async insertReport(row: Omit<CommunityReport, 'id' | 'created_at'>) {
    const report = { ...row, id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`, created_at: NOW.toISOString() };
    this.reports.push(report);
    return report;
  }
  async listPendingReports(limit: number) {
    return this.reports.filter((r) => r.status === 'pending').slice(0, limit);
  }
  async reviewReport(id: string, patch: Parameters<Repo['reviewReport']>[1]) {
    const r = this.reports.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    return r;
  }
  async listWatchers(areaIds: string[]): Promise<SavedPlaceWatcher[]> {
    return this.saved
      .filter((s) => areaIds.includes(s.area_id))
      .map((s) => {
        const p = this.profiles.get(s.user_id);
        return {
          saved_place_id: s.id,
          user_id: s.user_id,
          area_id: s.area_id,
          last_rating: s.last_rating,
          push_token: p?.push_token ?? null,
          notify_rating_changes: p?.notify_rating_changes ?? false,
          notify_incidents: p?.notify_incidents ?? false,
        };
      });
  }
  async setSavedPlaceRating(id: string, rating: string) {
    const s = this.saved.find((x) => x.id === id);
    if (s) s.last_rating = rating;
  }
  async insertOfficialStats(rows: OfficialStat[]) {
    this.stats.push(...rows);
    return rows.length;
  }
  async logIngestionRun(stats: Record<string, unknown>) {
    this.runs.push(stats);
  }
  async getCachedAudio(path: string) {
    return this.audio.has(path) ? `https://storage.test/briefings/${path}` : null;
  }
  async putAudio(path: string, bytes: Uint8Array) {
    this.audio.set(path, bytes);
    return `https://storage.test/briefings/${path}`;
  }

  addUser(id: string, opts: Partial<Profile & { push_token: string | null }> = {}) {
    this.profiles.set(id, {
      id,
      role: 'visitor',
      language: 'en',
      is_moderator: false,
      push_token: null,
      notify_rating_changes: true,
      notify_incidents: true,
      ...opts,
    });
  }
}

export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** A fetch mock that records calls and fails loudly on unexpected network access. */
export function mockFetch(routes: Array<[RegExp, FetchHandler]> = []) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = routes.find(([re]) => re.test(url));
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route[1](url, init);
  }) as typeof fetch;
  return { fetch: f, calls };
}

export function makeDeps(repo: FakeRepo, opts: { env?: Record<string, string>; fetch?: typeof fetch; now?: Date } = {}) {
  const logs: Array<{ event: string; meta?: Record<string, unknown> }> = [];
  const deps: Deps = {
    repo,
    env: opts.env ?? {},
    fetch: opts.fetch ?? mockFetch().fetch,
    now: () => opts.now ?? NOW,
    getUserId: async (req) => {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '');
      return token && token !== SERVICE_TOKEN && token.startsWith('user:') ? token.slice(5) : null;
    },
    isServiceRequest: (req) => req.headers.get('Authorization') === `Bearer ${SERVICE_TOKEN}`,
    log: (event, meta) => logs.push({ event, meta }),
  };
  return { deps, logs };
}

export function post(body: unknown, auth?: string, method = 'POST'): Request {
  return new Request('https://functions.test/fn', {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

export const asUser = (id: string) => `user:${id}`;
