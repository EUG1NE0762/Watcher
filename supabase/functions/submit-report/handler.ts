import {
  checkRateLimit,
  communityReportInputSchema,
  findCorroboratingIncident,
  moderateText,
  REPORT_RATE_LIMIT,
  type ReportType,
} from '@watcher/scoring';
import { errorResponse, json, readJson, route } from '../_shared/http.ts';

/**
 * Community reports land as "pending" and are shown separately as unverified. They never feed the
 * score: only incidents with a traceable credible source do. A report is auto-approved only when a
 * verified, credible incident in the same area and week already corroborates it.
 */
export const handleSubmitReport = route(async (req, deps) => {
  const userId = await deps.getUserId(req);
  if (!userId) return errorResponse(401, 'unauthorized', 'Sign-in required');

  const parsed = communityReportInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid report', parsed.error.flatten());
  const input = parsed.data;

  const moderation = moderateText(input.note);
  if (!moderation.ok) {
    return errorResponse(422, 'rejected_by_filter', 'Please describe the situation without names, contact details, links or offensive words.', {
      reasons: moderation.reasons,
    });
  }

  const now = deps.now();
  const since = new Date(now.getTime() - REPORT_RATE_LIMIT.windowMinutes * 60 * 1000).toISOString();
  const previous = await deps.repo.listReportTimes(userId, since);
  if (!checkRateLimit(previous, now).allowed) {
    return errorResponse(429, 'rate_limited', 'You have sent several reports recently. Please try again later.');
  }

  const area = await deps.repo.getArea(input.area_id);
  if (!area) return errorResponse(404, 'area_not_found', 'Unknown area');

  const recent = await deps.repo.listVerifiedIncidents(area.id, new Date(now.getTime() - 14 * 86_400_000).toISOString());
  const corroboration = findCorroboratingIncident(
    { area_id: area.id, type: input.type as ReportType, created_at: now.toISOString() },
    recent,
  );

  const report = await deps.repo.insertReport({
    area_id: area.id,
    user_id: userId,
    type: input.type,
    note: input.note,
    // Coordinates are only present when the user explicitly attached their location.
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    status: corroboration ? 'approved' : 'pending',
    corroborated_by_incident_id: corroboration?.id ?? null,
  });
  deps.log('report_submitted', { corroborated: !!corroboration });
  return json({ report }, 201);
});
