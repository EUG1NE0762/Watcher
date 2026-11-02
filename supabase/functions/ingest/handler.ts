import { areaAtPoint, matchLocationText, normalizeText, textHash, type Area } from '@watcher/scoring';
import { errorResponse, fetchWithTimeout, json, readJson, route, type Deps } from '../_shared/http.ts';
import { createProvider, type LLMProvider } from '../_shared/llm.ts';
import { emptyStats, loadPipelineContext, processCandidate } from '../_shared/pipeline.ts';
import { notifyVerifiedIncidents, recomputeAreas } from '../_shared/recompute.ts';
import { parseFeed, PoliteFetcher, USER_AGENT, type FeedItem } from '../_shared/rss.ts';

/** Cheap pre-filter so the model only sees crime/drug stories. */
const RELEVANT = /\b(police|robbery|robbed|theft|stole|stolen|burglary|assault|stabbed|murder|arrest|arrested|drug|drugs|dec|cannabis|heroin|cocaine|mandrax|trafficking|break[- ]in|defile|rape|mugg|carjack|thieves|suspects?)\b/i;
/** Feeds only carry recent items; raise INGEST_MAX_AGE_DAYS for a one-off backfill. */
const DEFAULT_MAX_AGE_DAYS = 14;

export interface IngestOptions {
  provider?: LLMProvider;
  fetcher?: PoliteFetcher;
}

async function geocode(deps: Deps, text: string, city: string, areas: Area[]): Promise<Area | null> {
  if ((deps.env.GEOCODER ?? 'nominatim') !== 'nominatim') return null;
  // "in Mongu" names a whole town: geocoding it would pin the incident on the town centre. Leave it for review.
  const place = normalizeText(text);
  if (!place || place === normalizeText(city) || [...new Set(areas.map((a) => normalizeText(a.city)))].includes(place)) return null;
  const q = encodeURIComponent(`${text.slice(0, 80)}, ${city}, Zambia`);
  try {
    const res = await fetchWithTimeout(
      deps.fetch,
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=zm`,
      { headers: { 'User-Agent': USER_AGENT } },
      10000,
    );
    if (!res.ok) return null;
    const hits = (await res.json()) as Array<{ lat: string; lon: string }>;
    const hit = hits[0];
    return hit ? areaAtPoint({ lat: Number(hit.lat), lng: Number(hit.lon) }, areas, 2) : null;
  } catch {
    return null;
  }
}

export function createIngestHandler(opts: IngestOptions = {}) {
  return route(async (req, deps) => {
    if (!deps.isServiceRequest(req)) return errorResponse(403, 'forbidden', 'Service role required');
    const body = ((await readJson(req)) ?? {}) as { max_items?: number; source_ids?: string[] };
    const startedAt = deps.now().toISOString();
    const provider = opts.provider ?? createProvider(deps.env, deps.fetch);
    const fetcher = opts.fetcher ?? new PoliteFetcher(deps.fetch);
    const maxItems = Math.min(100, body.max_items ?? Number(deps.env.INGEST_MAX_ITEMS ?? 25));

    const ctx = await loadPipelineContext(deps);
    const cities = [...new Set(ctx.areas.map((a) => a.city))];
    const knownUrls = new Set(ctx.existing.flatMap((e) => [e.source_url]));
    const stats = {
      ...emptyStats(),
      provider: provider.name,
      feeds_ok: 0,
      feeds_failed: 0,
      failed_sources: [] as string[],
      items_seen: 0,
      items_sent_to_model: 0,
      out_of_coverage: 0,
      extraction_errors: 0,
    };
    const recompute = new Set<string>();
    const alertAreas = new Set<string>();
    const maxAgeDays = Number(deps.env.INGEST_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS);
    const cutoff = deps.now().getTime() - maxAgeDays * 86_400_000;

    const sources = ctx.sources.filter((s) => s.type !== 'demo' && (!body.source_ids || body.source_ids.includes(s.id)));
    let budget = maxItems;
    for (const source of sources) {
      const feeds = source.feeds ?? [];
      for (const feedUrl of feeds) {
        if (budget <= 0) break;
        const xml = await fetcher.get(feedUrl);
        if (!xml) {
          stats.feeds_failed++;
          stats.failed_sources.push(source.id);
          continue;
        }
        stats.feeds_ok++;
        const items: FeedItem[] = parseFeed(xml)
          .filter((i) => new Date(i.published_at).getTime() >= cutoff && !knownUrls.has(i.link))
          .slice(0, 15);
        for (const item of items) {
          stats.items_seen++;
          if (budget <= 0) break;
          if (!RELEVANT.test(`${item.title} ${item.description}`)) continue;
          budget--;
          stats.items_sent_to_model++;
          let extracted;
          try {
            extracted = await provider.extractIncidents({
              title: item.title,
              text: item.description,
              published_at: item.published_at,
              source_name: source.name,
            });
          } catch (err) {
            stats.extraction_errors++;
            deps.log('extraction_failed', { source: source.id, message: err instanceof Error ? err.message : 'error' });
            continue;
          }
          for (const [idx, inc] of extracted.entries()) {
            const locationText = inc.location_text ?? item.title;
            const mentioned = cities.find((c) => normalizeText(`${inc.city ?? ''} ${item.title} ${item.description}`).includes(normalizeText(c)));
            let area = matchLocationText(`${locationText} ${item.title}`, ctx.areas);
            if (!area && mentioned && inc.location_text) area = await geocode(deps, inc.location_text, mentioned, ctx.areas);
            if (!area && !mentioned) {
              stats.out_of_coverage++;
              continue;
            }
            const outcome = await processCandidate(
              deps,
              ctx,
              {
                source_id: source.id,
                source_url: item.link,
                published_at: item.published_at,
                occurred_at: inc.occurred_at,
                area_id: area?.id ?? null,
                category: inc.category,
                severity: inc.severity,
                substance: inc.substance,
                summary: inc.summary,
                location_text: inc.location_text,
                // Hash of the original text identifies re-ingestion; the text itself is never stored.
                raw_text: `${item.link}#${idx}:${textHash(item.title + item.description)}`,
              },
              stats,
            );
            if (outcome.recompute) recompute.add(outcome.recompute);
            if (outcome.highConfidenceArea) alertAreas.add(outcome.highConfidenceArea);
          }
        }
      }
    }

    const recomputed = recompute.size ? await recomputeAreas(deps, [...recompute]) : [];
    await notifyVerifiedIncidents(deps, [...alertAreas]);
    const summary = { ...stats, rejections: stats.rejections.slice(0, 20), recomputed: recomputed.length };
    await deps.repo.logIngestionRun(summary, startedAt);
    deps.log('ingest_done', { ...summary, rejections: stats.rejections.length });
    return json(summary);
  });
}

export const handleIngest = createIngestHandler();
