// Runs the real ingestion handler (live RSS feeds, robots.txt, extraction, verification, area mapping)
// against an in-memory store and prints what would be written. No database or Supabase needed.
//
//   node scripts/ingest-dry-run.mjs                       # heuristic extractor (no model)
//   LLM_PROVIDER=openai_compatible LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=gemma3:12b node scripts/ingest-dry-run.mjs
//
// Env vars are the same as the ingest Edge Function (see .env.example).
import { join } from 'node:path';
import { buildAreas } from '../packages/scoring/src/index.ts';
import { createIngestHandler } from '../supabase/functions/ingest/handler.ts';
import { DATA, loadAreaSeeds, readJson } from './lib.mjs';

const areas = buildAreas(loadAreaSeeds());
const sources = readJson(join(DATA, 'sources.json'));
const incidents = [];
const scores = [];
const runs = [];
let seq = 0;

/** In-memory Repo with the same "verified only" read semantics as the Supabase one. */
const repo = {
  listAreas: async () => areas,
  getArea: async (id) => areas.find((a) => a.id === id) ?? null,
  listSources: async () => sources,
  listVerifiedIncidents: async (areaId, since) => incidents.filter((i) => i.area_id === areaId && i.status === 'verified' && i.occurred_at >= since),
  listIncidentsForDedupe: async () => incidents,
  insertIncident: async (row) => {
    const id = `dry-${++seq}`;
    incidents.push({ ...row, id, is_demo: false, source_ids: [row.source_id] });
    return id;
  },
  addCorroboration: async (id, sourceId, _url, _published, confidence) => {
    const i = incidents.find((x) => x.id === id);
    i.source_ids.push(sourceId);
    i.confidence = confidence;
  },
  getScores: async (areaId) => scores.filter((s) => s.area_id === areaId),
  upsertScores: async (rows) => scores.push(...rows),
  listWatchers: async () => [],
  setSavedPlaceRating: async () => {},
  logIngestionRun: async (stats) => runs.push(stats),
};

const deps = {
  repo,
  env: process.env,
  fetch: globalThis.fetch,
  now: () => new Date(),
  getUserId: async () => null,
  isServiceRequest: () => true,
  log: (event, meta) => process.env.VERBOSE && console.log(event, meta ?? ''),
};

const maxItems = Number(process.env.INGEST_MAX_ITEMS ?? 40);
const res = await createIngestHandler()(new Request('http://local/ingest', { method: 'POST', body: JSON.stringify({ max_items: maxItems }) }), deps);
const summary = await res.json();

console.log('\n=== Ingestion summary ===');
console.log(JSON.stringify({ ...summary, rejections: undefined }, null, 2));
if (summary.rejections?.length) {
  console.log('\n=== Rejected (not stored, never scored) ===');
  for (const r of summary.rejections) console.log(`- ${r.reason}\n  ${r.url}`);
}
console.log('\n=== Would be stored ===');
if (!incidents.length) console.log('(none: no qualifying crime/drug stories in the configured feeds in the last 14 days)');
for (const i of incidents) {
  const area = areas.find((a) => a.id === i.area_id)?.name ?? 'UNMAPPED -> manual review';
  console.log(`- [${i.status}/${i.confidence}] ${i.category}${i.substance ? `/${i.substance}` : ''} · ${area}\n  ${i.summary}\n  ${i.source_url} (${i.published_at.slice(0, 10)}; sources: ${i.source_ids.join(', ')})`);
}
