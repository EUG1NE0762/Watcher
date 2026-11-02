import { normalizeText } from './text.ts';

/** Kept short and generic on purpose; extend via deployment config rather than growing it here. */
const PROFANITY = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'cunt', 'dick', 'whore', 'slut', 'nigger', 'faggot'];

/** Stigmatising labels for people who use substances. Reports must describe situations, not people. */
const STIGMATISING = ['junkie', 'junkies', 'crackhead', 'crackheads', 'druggie', 'druggies', 'addicts', 'dope fiend', 'stoner', 'stoners'];

/** 9+ digits once spaces, dashes, dots and brackets are removed, e.g. 0977 123 456 or +260-97-7123456. */
const PHONE = /\+?\d{9,}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL_RE = /https?:\/\/|www\./i;

export interface ModerationResult {
  ok: boolean;
  reasons: string[];
}

export function moderateText(input: string): ModerationResult {
  const reasons: string[] = [];
  const n = ` ${normalizeText(input)} `;
  if (PROFANITY.some((w) => n.includes(` ${w} `) || n.includes(` ${w}s `))) reasons.push('profanity');
  if (STIGMATISING.some((w) => n.includes(` ${w} `))) reasons.push('stigmatising_language');
  if (PHONE.test(input.replace(/[\s\-().]/g, '')) || EMAIL.test(input)) reasons.push('personal_contact_details');
  if (URL_RE.test(input)) reasons.push('links_not_allowed');
  if (/(.)\1{7,}/.test(input)) reasons.push('spam');
  return { ok: reasons.length === 0, reasons };
}

export interface RateLimitPolicy {
  max: number;
  windowMinutes: number;
}

export const REPORT_RATE_LIMIT: RateLimitPolicy = { max: 5, windowMinutes: 60 };

export function checkRateLimit(previous: Array<string | Date>, now = new Date(), policy = REPORT_RATE_LIMIT) {
  const since = now.getTime() - policy.windowMinutes * 60 * 1000;
  const recent = previous.filter((t) => new Date(t).getTime() > since).length;
  return { allowed: recent < policy.max, remaining: Math.max(0, policy.max - recent - 1) };
}
