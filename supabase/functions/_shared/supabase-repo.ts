import type { SupabaseClient } from '@supabase/supabase-js';
import type { Area, Incident, ScoreResult, Source } from '@watcher/scoring';
import type { CommunityReport, NewIncident, OfficialStat, Profile, Repo, SavedPlaceWatcher, StoredIncident } from './repo.ts';

const BUCKET = 'briefings';
const INCIDENT_COLUMNS =
  'id, area_id, category, severity, substance, occurred_at, published_at, source_id, source_url, summary, location_text, confidence, status, is_demo, raw_text_hash, corroboration_count, incident_sources(source_id)';

type IncidentRow = Incident & { raw_text_hash: string; location_text: string | null; incident_sources?: Array<{ source_id: string }> };

function toStored(row: IncidentRow): StoredIncident {
  const { incident_sources, ...rest } = row;
  return { ...rest, source_ids: [row.source_id, ...(incident_sources ?? []).map((s) => s.source_id)] };
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** List queries: data is only null on error, which check() already throws for. */
function many<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  return check(res) ?? [];
}

interface AreaRow {
  id: string;
  name: string;
  city: string;
  province: string;
  area_type: Area['area_type'];
  aliases: string[];
  description: string;
  lat: number;
  lng: number;
  polygon: Area['polygon'];
}

const toArea = (r: AreaRow): Area => ({
  id: r.id,
  name: r.name,
  city: r.city,
  province: r.province,
  area_type: r.area_type,
  aliases: r.aliases ?? [],
  description: r.description,
  centroid: { lat: r.lat, lng: r.lng },
  polygon: r.polygon,
});

/** Repo backed by a service-role Supabase client (bypasses RLS; only ever used server-side). */
export class SupabaseRepo implements Repo {
  private areaCache: Area[] | null = null;
  private db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async listAreas(): Promise<Area[]> {
    if (!this.areaCache) this.areaCache = many(await this.db.from('areas_public').select('*')).map(toArea);
    return this.areaCache;
  }

  async getArea(id: string): Promise<Area | null> {
    return (await this.listAreas()).find((a) => a.id === id) ?? null;
  }

  async listSources(): Promise<Source[]> {
    return many(await this.db.from('sources').select('id, name, type, base_url, credibility_weight, requires_corroboration, feeds').eq('enabled', true)).map(
      (s) => ({ ...s, credibility_weight: Number(s.credibility_weight) }) as Source,
    );
  }

  async listVerifiedIncidents(areaId: string, sinceIso: string): Promise<Incident[]> {
    return many(
      await this.db
        .from('incidents')
        .select('id, area_id, category, severity, substance, occurred_at, published_at, source_id, source_url, summary, confidence, status, is_demo, corroboration_count')
        .eq('area_id', areaId)
        .eq('status', 'verified')
        .gte('occurred_at', sinceIso)
        .order('occurred_at', { ascending: false })
        .limit(2000),
    ) as Incident[];
  }

  async listIncidentsForDedupe(sinceIso: string): Promise<StoredIncident[]> {
    const rows = many(await this.db.from('incidents').select(INCIDENT_COLUMNS).eq('is_demo', false).gte('published_at', sinceIso).limit(5000));
    return (rows as unknown as IncidentRow[]).map(toStored);
  }

  async insertIncident(row: NewIncident): Promise<string> {
    const inserted = check(await this.db.from('incidents').insert(row).select('id').single());
    if (!inserted) throw new Error('insert returned no row');
    return inserted.id as string;
  }

  async addCorroboration(incidentId: string, sourceId: string, sourceUrl: string, publishedAt: string, confidence: Incident['confidence']) {
    check(await this.db.from('incident_sources').upsert({ incident_id: incidentId, source_id: sourceId, source_url: sourceUrl, published_at: publishedAt }));
    const count = many(await this.db.from('incident_sources').select('source_id').eq('incident_id', incidentId)).length + 1;
    check(await this.db.from('incidents').update({ confidence, corroboration_count: count }).eq('id', incidentId));
  }

  async getIncident(id: string): Promise<StoredIncident | null> {
    const row = check(await this.db.from('incidents').select(INCIDENT_COLUMNS).eq('id', id).maybeSingle());
    return row ? toStored(row as unknown as IncidentRow) : null;
  }

  async listPendingIncidents(limit: number): Promise<StoredIncident[]> {
    const rows = many(await this.db.from('incidents').select(INCIDENT_COLUMNS).eq('status', 'pending').order('created_at', { ascending: false }).limit(limit));
    return (rows as unknown as IncidentRow[]).map(toStored);
  }

  async reviewIncident(id: string, patch: Parameters<Repo['reviewIncident']>[1]) {
    const row = check(await this.db.from('incidents').update(patch).eq('id', id).select(INCIDENT_COLUMNS).maybeSingle());
    return row ? toStored(row as unknown as IncidentRow) : null;
  }

  async getScores(areaId: string): Promise<ScoreResult[]> {
    return check(await this.db.from('risk_scores').select('*').eq('area_id', areaId)) as ScoreResult[];
  }

  async upsertScores(scores: ScoreResult[]) {
    check(await this.db.from('risk_scores').upsert(scores, { onConflict: 'area_id,time_band' }));
  }

  async getProfile(userId: string): Promise<Profile | null> {
    return check(await this.db.from('profiles').select('id, role, language, is_moderator').eq('id', userId).maybeSingle()) as Profile | null;
  }

  async listReportTimes(userId: string, sinceIso: string): Promise<string[]> {
    return many(await this.db.from('community_reports').select('created_at').eq('user_id', userId).gte('created_at', sinceIso)).map(
      (r) => r.created_at as string,
    );
  }

  async insertReport(row: Omit<CommunityReport, 'id' | 'created_at'>): Promise<CommunityReport> {
    return check(await this.db.from('community_reports').insert(row).select('*').single()) as CommunityReport;
  }

  async listPendingReports(limit: number): Promise<CommunityReport[]> {
    return check(await this.db.from('community_reports').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(limit)) as CommunityReport[];
  }

  async reviewReport(id: string, patch: Parameters<Repo['reviewReport']>[1]) {
    return check(await this.db.from('community_reports').update(patch).eq('id', id).select('*').maybeSingle()) as CommunityReport | null;
  }

  async listWatchers(areaIds: string[]): Promise<SavedPlaceWatcher[]> {
    if (!areaIds.length) return [];
    const saved = many(await this.db.from('saved_places').select('id, user_id, area_id, last_rating').in('area_id', areaIds));
    if (!saved.length) return [];
    const profiles = many(
      await this.db.from('profiles').select('id, push_token, notify_rating_changes, notify_incidents').in('id', [...new Set(saved.map((s) => s.user_id))]),
    );
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return saved.map((s) => {
      const p = byId.get(s.user_id);
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

  async setSavedPlaceRating(savedPlaceId: string, rating: string) {
    check(await this.db.from('saved_places').update({ last_rating: rating }).eq('id', savedPlaceId));
  }

  async insertOfficialStats(rows: OfficialStat[]): Promise<number> {
    return many(await this.db.from('official_stats').insert(rows).select('id')).length;
  }

  async logIngestionRun(stats: Record<string, unknown>, startedAt: string) {
    check(await this.db.from('ingestion_runs').insert({ stats, started_at: startedAt, finished_at: new Date().toISOString() }));
  }

  async getCachedAudio(path: string): Promise<string | null> {
    const dir = path.split('/').slice(0, -1).join('/');
    const file = path.split('/').pop()!;
    const { data } = await this.db.storage.from(BUCKET).list(dir, { search: file, limit: 1 });
    if (!data?.some((f) => f.name === file)) return null;
    return this.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async putAudio(path: string, bytes: Uint8Array): Promise<string> {
    const { error } = await this.db.storage.from(BUCKET).upload(path, bytes, { contentType: 'audio/mpeg', upsert: true });
    if (error) throw new Error(error.message);
    return this.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
}
