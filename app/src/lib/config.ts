/**
 * Public client config. Only the Supabase URL and the publishable (anon) key belong here: both are
 * safe to ship because Row Level Security protects the data. Every secret (Claude, ElevenLabs,
 * open-weight model keys, service role) lives in Edge Function env vars.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Without a backend the app runs fully offline on the labelled demo dataset. */
export const BACKEND_ENABLED = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

export const SEARCH_DEBOUNCE_MS = 250;
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
