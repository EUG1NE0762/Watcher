import { z } from 'zod';
import { errorResponse, json, readJson, route } from '../_shared/http.ts';
import { recomputeAreas } from '../_shared/recompute.ts';

const bodySchema = z.object({ area_ids: z.array(z.string().max(64)).max(500).optional() }).nullable();

/** Daily (cron) or on-demand recompute. Recomputing everything daily applies recency decay. */
export const handleRecompute = route(async (req, deps) => {
  if (!deps.isServiceRequest(req)) return errorResponse(403, 'forbidden', 'Service role required');
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid request');
  const ids = parsed.data?.area_ids ?? (await deps.repo.listAreas()).map((a) => a.id);
  const results = await recomputeAreas(deps, ids);
  return json({ recomputed: results.length, changed: results.filter((r) => r.changed) });
});
