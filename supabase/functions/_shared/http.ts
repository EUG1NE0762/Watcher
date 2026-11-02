import type { Repo } from './repo.ts';

export type Env = Record<string, string | undefined>;

export interface Deps {
  repo: Repo;
  env: Env;
  fetch: typeof fetch;
  now: () => Date;
  /** Verified user id from the request JWT, or null. */
  getUserId: (req: Request) => Promise<string | null>;
  /** True for calls made with the service role key or the cron secret. */
  isServiceRequest: (req: Request) => boolean;
  /** Structured log. Never pass user ids, notes, coordinates or other PII. */
  log: (event: string, meta?: Record<string, unknown>) => void;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-watcher-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: { code, message, ...(details ? { details } : {}) } }, status);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Wraps a handler with CORS preflight, method check and a catch-all that never leaks internals.
 */
export function route(handler: (req: Request, deps: Deps) => Promise<Response>) {
  return async (req: Request, deps: Deps): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST');
    try {
      return await handler(req, deps);
    } catch (err) {
      deps.log('unhandled_error', { message: err instanceof Error ? err.message : String(err) });
      return errorResponse(500, 'internal', 'Something went wrong. Please try again.');
    }
  };
}

/**
 * Fixed-window limiter, per isolate. Edge isolates are short-lived so this is a best-effort burst
 * guard; durable limits (community reports) are enforced against the database.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export function clientKey(req: Request, userId: string | null): string {
  return userId ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
}

export async function fetchWithTimeout(f: typeof fetch, url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await f(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
