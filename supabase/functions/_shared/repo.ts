import type { Area, Confidence, Incident, IncidentStatus, ScoreResult, Source } from '@watcher/scoring';

/** Incident as stored, with the extra columns the pipeline needs for dedupe. */
export type StoredIncident = Incident & { raw_text_hash: string; source_ids: string[]; location_text?: string | null };

export interface NewIncident {
  area_id: string | null;
  category: Incident['category'];
  severity: number;
  substance: Incident['substance'];
  occurred_at: string;
  published_at: string;
  source_id: string;
  source_url: string;
  summary: string;
  location_text: string | null;
  confidence: Confidence;
  status: IncidentStatus;
  raw_text_hash: string;
  review_note: string | null;
}

export interface CommunityReport {
  id: string;
  area_id: string;
  user_id: string;
  type: string;
  note: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  corroborated_by_incident_id: string | null;
}

export interface Profile {
  id: string;
  role: 'visitor' | 'driver' | 'resident';
  language: 'en' | 'ny' | 'bem';
  is_moderator: boolean;
}

export interface SavedPlaceWatcher {
  saved_place_id: string;
  user_id: string;
  area_id: string;
  last_rating: string | null;
  push_token: string | null;
  notify_rating_changes: boolean;
  notify_incidents: boolean;
}

export interface OfficialStat {
  area_id: string | null;
  city: string;
  category: string;
  period_start: string;
  period_end: string;
  count: number;
  source_id: string;
  source_url: string;
  published_at: string;
  notes: string | null;
}

/**
 * Everything the Edge Functions need from the database and storage. The Supabase implementation
 * lives in supabase-repo.ts; tests use an in-memory fake, so handlers never touch supabase-js directly.
 */
export interface Repo {
  listAreas(): Promise<Area[]>;
  getArea(id: string): Promise<Area | null>;
  listSources(): Promise<Source[]>;
  /** Verified incidents for scoring and grounding. */
  listVerifiedIncidents(areaId: string, sinceIso: string): Promise<Incident[]>;
  /** Recent incidents of any status for dedupe. */
  listIncidentsForDedupe(sinceIso: string): Promise<StoredIncident[]>;
  insertIncident(row: NewIncident): Promise<string>;
  addCorroboration(incidentId: string, sourceId: string, sourceUrl: string, publishedAt: string, confidence: Confidence): Promise<void>;
  getIncident(id: string): Promise<StoredIncident | null>;
  listPendingIncidents(limit: number): Promise<StoredIncident[]>;
  reviewIncident(id: string, patch: { status: IncidentStatus; area_id?: string | null; review_note?: string | null }): Promise<StoredIncident | null>;

  getScores(areaId: string): Promise<ScoreResult[]>;
  upsertScores(scores: ScoreResult[]): Promise<void>;

  getProfile(userId: string): Promise<Profile | null>;
  listReportTimes(userId: string, sinceIso: string): Promise<string[]>;
  insertReport(row: Omit<CommunityReport, 'id' | 'created_at'>): Promise<CommunityReport>;
  listPendingReports(limit: number): Promise<CommunityReport[]>;
  reviewReport(id: string, patch: { status: CommunityReport['status']; moderator_note?: string | null; corroborated_by_incident_id?: string | null }): Promise<CommunityReport | null>;

  listWatchers(areaIds: string[]): Promise<SavedPlaceWatcher[]>;
  setSavedPlaceRating(savedPlaceId: string, rating: string): Promise<void>;

  insertOfficialStats(rows: OfficialStat[]): Promise<number>;
  logIngestionRun(stats: Record<string, unknown>, startedAt: string): Promise<void>;

  /** Public URL of a cached briefing, or null. */
  getCachedAudio(path: string): Promise<string | null>;
  putAudio(path: string, bytes: Uint8Array): Promise<string>;
}
