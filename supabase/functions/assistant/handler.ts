import {
  assistantRequestSchema,
  citedRefs,
  contradictsEngine,
  groundedAnswer,
  NO_DATA_LINE,
  PERSONAL_QUESTION,
  personalRefusal,
} from '@watcher/scoring';
import { callClaude } from '../_shared/claude.ts';
import { contextToPrompt, loadAreaContext, type AreaContext, type Citation } from '../_shared/context.ts';
import { clientKey, errorResponse, json, RateLimiter, readJson, route } from '../_shared/http.ts';

export { contradictsEngine, NO_DATA_LINE };

const limiter = new RateLimiter(20, 60 * 60 * 1000);

export const SYSTEM_PROMPT = `You are Watcher, a calm safety assistant for people travelling in Zambia.

Rules you must follow:
- Use ONLY the facts inside <verified_data>. If the answer is not supported by it, say exactly: "${NO_DATA_LINE}" and then offer the general precautions listed there.
- The risk rating comes from Watcher's scoring engine. Repeat engine_rating as given; never raise, lower or reinterpret it. If engine_rating is "insufficient_data", say there is not enough verified data to rate the area.
- Cite incidents with their ref number in square brackets, e.g. [2]. Never invent a ref.
- Talk about areas and situations, never about individuals. Do not speculate about who committed anything, and do not describe people by ethnicity, nationality or appearance.
- Use non-stigmatising language ("people who use substances", "substance abuse"), never slurs like "junkies".
- If uses_demo_data is true, mention briefly that the figures are demo data, not real records.
- Keep answers under 120 words, plain language, no alarmism. End with one practical tip when relevant.
- Ratings are guidance, not guarantees; do not promise safety.`;

function fallback(ctx: AreaContext): string {
  return groundedAnswer({
    areaName: ctx.area.name,
    band: ctx.band,
    score: ctx.score,
    precautions: ctx.precautions,
    citationCount: ctx.citations.length,
  });
}

function respond(ctx: AreaContext, answer: string, mode: 'claude' | 'fallback' | 'refusal') {
  const refs = citedRefs(answer, ctx.citations.length);
  const citations: Citation[] = ctx.citations.filter((c) => refs.includes(c.n));
  return json({
    answer,
    citations,
    rating: ctx.score.rating,
    score: ctx.score.score,
    uses_demo_data: ctx.score.breakdown.usesDemoData,
    mode,
    disclaimer: 'Ratings are guidance, not guarantees.',
  });
}

export const handleAssistant = route(async (req, deps) => {
  const parsed = assistantRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid request', parsed.error.flatten());
  const input = parsed.data;

  const userId = await deps.getUserId(req);
  if (!limiter.allow(clientKey(req, userId), deps.now().getTime())) {
    return errorResponse(429, 'rate_limited', 'Too many questions. Please wait a few minutes.');
  }

  const ctx = await loadAreaContext(deps, input.area_id, input.band, input.role, input.language);
  if (!ctx) return errorResponse(404, 'area_not_found', 'Unknown area');

  if (PERSONAL_QUESTION.test(input.question)) return respond(ctx, personalRefusal(ctx.area.name), 'refusal');

  if (!deps.env.ANTHROPIC_API_KEY) {
    deps.log('assistant_fallback', { reason: 'no_key' });
    return respond(ctx, fallback(ctx), 'fallback');
  }

  try {
    const answer = await callClaude(deps.fetch, deps.env, SYSTEM_PROMPT, [
      ...input.history,
      {
        role: 'user',
        content: `<verified_data>\n${contextToPrompt(ctx)}\n</verified_data>\n\nUser role: ${input.role}. Reply in ${input.language === 'ny' ? 'Nyanja (simple words)' : input.language === 'bem' ? 'Bemba (simple words)' : 'English'}.\nQuestion: ${input.question}`,
      },
    ]);
    if (contradictsEngine(answer, ctx.score.rating)) {
      deps.log('assistant_guard', { reason: 'rating_mismatch' });
      return respond(ctx, fallback(ctx), 'fallback');
    }
    return respond(ctx, answer, 'claude');
  } catch (err) {
    deps.log('assistant_fallback', { reason: err instanceof Error ? err.message : 'error' });
    return respond(ctx, fallback(ctx), 'fallback');
  }
});
