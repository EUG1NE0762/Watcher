import { importIncidentSchema, parseCsv, resolveSource, searchAreas, textHash } from '@watcher/scoring';
import { z } from 'zod';
import { errorResponse, json, readJson, route } from '../_shared/http.ts';
import { emptyStats, loadPipelineContext, processCandidate } from '../_shared/pipeline.ts';
import { notifyVerifiedIncidents, recomputeAreas } from '../_shared/recompute.ts';

const statRowSchema = z.object({
  area: z.string().max(80).optional().default(''),
  city: z.string().min(2).max(60),
  category: z.string().min(2).max(40),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.coerce.number().int().min(0),
  source_url: z.string().url(),
  published_date: z.string().min(8),
  notes: z.string().max(300).optional(),
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list_pending') }),
  z.object({
    action: z.literal('review_incident'),
    id: z.string().min(1),
    decision: z.enum(['verify', 'reject']),
    area_id: z.string().optional(),
    note: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal('review_report'),
    id: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
    note: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal('import'),
    kind: z.enum(['incidents', 'stats']),
    format: z.enum(['csv', 'json']),
    data: z.string().min(10).max(500_000),
  }),
]);

/** Moderator-only: review queues and the verified-import path for official records. */
export const handleAdmin = route(async (req, deps) => {
  const userId = await deps.getUserId(req);
  if (!userId) return errorResponse(401, 'unauthorized', 'Sign-in required');
  const profile = await deps.repo.getProfile(userId);
  if (!profile?.is_moderator) return errorResponse(403, 'forbidden', 'Moderators only');

  const parsed = actionSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid request', parsed.error.flatten());
  const body = parsed.data;

  switch (body.action) {
    case 'list_pending': {
      const [incidents, reports] = await Promise.all([deps.repo.listPendingIncidents(100), deps.repo.listPendingReports(100)]);
      // Reports are returned without user ids: moderators review content, not people.
      return json({ incidents, reports: reports.map(({ user_id: _omit, ...r }) => r) });
    }

    case 'review_incident': {
      const current = await deps.repo.getIncident(body.id);
      if (!current) return errorResponse(404, 'not_found', 'Incident not found');
      if (body.area_id && !(await deps.repo.getArea(body.area_id))) return errorResponse(400, 'invalid_area', 'Unknown area');
      if (body.decision === 'verify' && !(body.area_id ?? current.area_id)) {
        return errorResponse(400, 'area_required', 'Choose an area before verifying');
      }
      const updated = await deps.repo.reviewIncident(body.id, {
        status: body.decision === 'verify' ? 'verified' : 'rejected',
        ...(body.area_id ? { area_id: body.area_id } : {}),
        review_note: body.note ?? null,
      });
      if (!updated) return errorResponse(404, 'not_found', 'Incident not found');
      if (updated.area_id) {
        await recomputeAreas(deps, [updated.area_id]);
        if (body.decision === 'verify' && updated.confidence === 'high') await notifyVerifiedIncidents(deps, [updated.area_id]);
      }
      return json({ incident: updated });
    }

    case 'review_report': {
      const updated = await deps.repo.reviewReport(body.id, {
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        moderator_note: body.note ?? null,
      });
      if (!updated) return errorResponse(404, 'not_found', 'Report not found');
      // Approved reports are shown as community reports; they are not incidents and never change a score.
      const { user_id: _omit, ...report } = updated;
      return json({ report });
    }

    case 'import': {
      let rows: unknown[];
      try {
        rows = body.format === 'csv' ? parseCsv(body.data) : (JSON.parse(body.data) as unknown[]);
        if (!Array.isArray(rows)) throw new Error('not an array');
      } catch {
        return errorResponse(400, 'invalid_data', 'Could not parse the import data');
      }
      if (rows.length > 2000) return errorResponse(400, 'too_many_rows', 'Import at most 2000 rows at a time');
      const ctx = await loadPipelineContext(deps);
      const errors: Array<{ row: number; error: string }> = [];

      if (body.kind === 'stats') {
        const valid = [];
        for (const [i, raw] of rows.entries()) {
          const r = statRowSchema.safeParse(raw);
          if (!r.success) {
            errors.push({ row: i + 1, error: 'invalid row' });
            continue;
          }
          const source = resolveSource({ source_url: r.data.source_url }, ctx.sources);
          if (!source || source.type === 'demo') {
            errors.push({ row: i + 1, error: 'source is not a registered credible outlet' });
            continue;
          }
          const area = r.data.area ? searchAreas(r.data.area, ctx.areas, 1)[0] : undefined;
          valid.push({
            area_id: area && area.score >= 0.9 ? area.area.id : null,
            city: r.data.city,
            category: r.data.category,
            period_start: r.data.period_start,
            period_end: r.data.period_end,
            count: r.data.count,
            source_id: source.id,
            source_url: r.data.source_url,
            published_at: new Date(r.data.published_date).toISOString(),
            notes: r.data.notes ?? null,
          });
        }
        const inserted = valid.length ? await deps.repo.insertOfficialStats(valid) : 0;
        return json({ inserted, errors });
      }

      const stats = emptyStats();
      const recompute = new Set<string>();
      const alerts = new Set<string>();
      for (const [i, raw] of rows.entries()) {
        const r = importIncidentSchema.safeParse(raw);
        if (!r.success) {
          errors.push({ row: i + 1, error: 'invalid row' });
          continue;
        }
        const area = searchAreas(r.data.area, ctx.areas, 1)[0];
        const outcome = await processCandidate(deps, ctx, {
          source_url: r.data.source_url,
          published_at: r.data.published_date,
          occurred_at: r.data.occurred_at,
          area_id: area && area.score >= 0.9 ? area.area.id : null,
          category: r.data.category,
          severity: r.data.severity,
          substance: r.data.substance,
          summary: r.data.summary,
          location_text: r.data.area,
          raw_text: `import:${r.data.source_url}:${textHash(`${r.data.area}|${r.data.category}|${r.data.occurred_at}|${r.data.summary}`)}`,
        }, stats);
        if (outcome.recompute) recompute.add(outcome.recompute);
        if (outcome.highConfidenceArea) alerts.add(outcome.highConfidenceArea);
      }
      if (recompute.size) await recomputeAreas(deps, [...recompute]);
      await notifyVerifiedIncidents(deps, [...alerts]);
      return json({ ...stats, errors });
    }
  }
});
