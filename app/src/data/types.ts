import type { Area, Confidence, Incident, Language, Role, ScoreResult, Source, TimeBand } from '@watcher/scoring';

export type DataMode = 'live' | 'offline_demo';

export interface AreaSummary {
  area: Area;
  scores: Partial<Record<TimeBand, ScoreResult>>;
}

export interface IncidentView extends Incident {
  source_name: string;
}

export interface CommunityReportView {
  id: string;
  type: string;
  note: string;
  created_at: string;
  status: 'pending' | 'approved';
  corroborated: boolean;
}

export interface OfficialStatView {
  category: string;
  period_start: string;
  period_end: string;
  count: number;
  source_name: string;
  source_url: string;
}

export interface AreaDetail extends AreaSummary {
  incidents: IncidentView[];
  sources: Source[];
  communityReports: CommunityReportView[];
  officialStats: OfficialStatView[];
  fetchedAt: string;
}

export interface Citation {
  n: number;
  source: string;
  url: string;
  published_at: string;
  confidence: Confidence;
  is_demo: boolean;
}

export interface AssistantAnswer {
  answer: string;
  citations: Citation[];
  rating: string;
  mode: 'claude' | 'fallback' | 'refusal' | 'offline';
  uses_demo_data: boolean;
}

export interface Briefing {
  text: string;
  audio_url: string | null;
  fallback: 'device_tts' | null;
  uses_demo_data: boolean;
}

export interface MyReport {
  id: string;
  area_id: string;
  type: string;
  note: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface AskInput {
  areaId: string;
  question: string;
  band: TimeBand;
  role: Role;
  language: Language;
  history: { role: 'user' | 'assistant'; content: string }[];
}
