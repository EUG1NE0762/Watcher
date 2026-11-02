import { briefingRequestSchema, buildBriefingText, getPrecautions } from '@watcher/scoring';
import { loadAreaContext } from '../_shared/context.ts';
import { clientKey, errorResponse, fetchWithTimeout, json, RateLimiter, readJson, route } from '../_shared/http.ts';

const limiter = new RateLimiter(30, 60 * 60 * 1000);
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';

/** One cached file per area + rating + day (plus band/role/language, which change the words). */
export function cachePath(areaId: string, day: string, band: string, rating: string, role: string, language: string): string {
  return `${areaId}/${day}/${band}-${rating}-${role}-${language}.mp3`;
}

export const handleVoiceBriefing = route(async (req, deps) => {
  const parsed = briefingRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid request', parsed.error.flatten());
  const input = parsed.data;

  const userId = await deps.getUserId(req);
  if (!limiter.allow(clientKey(req, userId), deps.now().getTime())) {
    return errorResponse(429, 'rate_limited', 'Too many briefings. Please wait a few minutes.');
  }

  const ctx = await loadAreaContext(deps, input.area_id, input.band, input.role, input.language);
  if (!ctx) return errorResponse(404, 'area_not_found', 'Unknown area');

  const precautions = getPrecautions({
    role: input.role,
    band: input.band,
    rating: ctx.score.rating,
    topCategories: ctx.score.breakdown.topCategories.map((c) => c.key),
  });
  const text = buildBriefingText({ areaName: ctx.area.name, score: ctx.score, precautions, language: input.language });
  const base = { text, rating: ctx.score.rating, uses_demo_data: ctx.score.breakdown.usesDemoData };

  const day = deps.now().toISOString().slice(0, 10);
  const path = cachePath(input.area_id, day, input.band, ctx.score.rating, input.role, input.language);
  const cached = await deps.repo.getCachedAudio(path);
  if (cached) return json({ ...base, audio_url: cached, cached: true, fallback: null });

  const key = deps.env.ELEVENLABS_API_KEY;
  if (!key) return json({ ...base, audio_url: null, cached: false, fallback: 'device_tts', reason: 'not_configured' });

  try {
    const voice = deps.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const res = await fetchWithTimeout(
      deps.fetch,
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: deps.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
          voice_settings: { stability: 0.6, similarity_boost: 0.75 },
        }),
      },
      30000,
    );
    if (!res.ok) throw new Error(`elevenlabs_http_${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const url = await deps.repo.putAudio(path, bytes);
    return json({ ...base, audio_url: url, cached: false, fallback: null });
  } catch (err) {
    deps.log('briefing_fallback', { reason: err instanceof Error ? err.message : 'error' });
    return json({ ...base, audio_url: null, cached: false, fallback: 'device_tts', reason: 'tts_failed' });
  }
});
