import { createClient } from '@supabase/supabase-js';
import type { Deps } from './http.ts';
import { SupabaseRepo } from './supabase-repo.ts';

function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Production wiring for Deno. Secrets come only from the function's environment, never the client. */
export function createDeps(): Deps {
  const env = Deno.env.toObject();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const admin = createClient(env.SUPABASE_URL ?? '', serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    repo: new SupabaseRepo(admin),
    env,
    fetch: globalThis.fetch.bind(globalThis),
    now: () => new Date(),
    getUserId: async (req) => {
      const token = bearer(req);
      if (!token || safeEqual(token, serviceKey)) return null;
      const { data } = await admin.auth.getUser(token);
      return data.user?.id ?? null;
    },
    isServiceRequest: (req) => {
      const token = bearer(req) ?? '';
      const cron = req.headers.get('x-watcher-cron-secret') ?? '';
      return safeEqual(token, serviceKey) || (!!env.CRON_SECRET && safeEqual(cron, env.CRON_SECRET));
    },
    log: (event, meta = {}) => console.log(JSON.stringify({ event, ...meta })),
  };
}
