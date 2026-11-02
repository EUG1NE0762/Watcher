import { z } from 'zod';
import { REPORT_TYPES } from './verification.ts';
import { CATEGORIES, SUBSTANCES, TIME_BANDS } from './types.ts';

export const categorySchema = z.enum(CATEGORIES);
export const substanceSchema = z.enum(SUBSTANCES);
export const timeBandSchema = z.enum(TIME_BANDS);
export const roleSchema = z.enum(['visitor', 'driver', 'resident']);
export const languageSchema = z.enum(['en', 'ny', 'bem']);

const isoDate = z.string().refine((v) => Number.isFinite(new Date(v).getTime()), 'invalid date');

/** What the open-weight model must return for each article. Anything else is discarded. */
export const extractedIncidentSchema = z.object({
  is_incident: z.boolean(),
  category: categorySchema,
  substance: substanceSchema.nullable(),
  location_text: z.string().max(200).nullable(),
  city: z.string().max(60).nullable(),
  occurred_at: isoDate.nullable(),
  severity: z.number().int().min(1).max(5),
  summary: z.string().min(10).max(400),
});
export const extractionResponseSchema = z.object({ incidents: z.array(extractedIncidentSchema).max(10) });
export type ExtractedIncident = z.infer<typeof extractedIncidentSchema>;

export const communityReportInputSchema = z.object({
  area_id: z.string().min(1).max(64),
  type: z.enum(REPORT_TYPES),
  note: z.string().trim().min(5).max(280),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});
export type CommunityReportInput = z.infer<typeof communityReportInputSchema>;

/** Manual verified-import row (CSV or JSON) for official records. */
export const importIncidentSchema = z.object({
  area: z.string().min(2).max(80),
  category: categorySchema,
  severity: z.coerce.number().int().min(1).max(5),
  substance: z.preprocess((v) => (v === '' || v == null ? null : v), substanceSchema.nullable()),
  occurred_at: isoDate,
  published_date: isoDate,
  source: z.string().min(2).max(80),
  source_url: z.string().url(),
  summary: z.string().min(10).max(400),
});
export type ImportIncidentRow = z.infer<typeof importIncidentSchema>;

export const assistantRequestSchema = z.object({
  area_id: z.string().min(1).max(64),
  question: z.string().trim().min(2).max(500),
  band: timeBandSchema,
  role: roleSchema.default('visitor'),
  language: languageSchema.default('en'),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(8)
    .default([]),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export const briefingRequestSchema = z.object({
  area_id: z.string().min(1).max(64),
  band: timeBandSchema,
  role: roleSchema.default('visitor'),
  language: languageSchema.default('en'),
});
export type BriefingRequest = z.infer<typeof briefingRequestSchema>;

/** Parse "a,b,c" CSV with a header row and simple double-quote escaping. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
