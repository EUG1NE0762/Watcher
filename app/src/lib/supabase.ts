import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BACKEND_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { secureStorage } from './secureStorage';

export const supabase: SupabaseClient | null = BACKEND_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

/**
 * Every install gets an anonymous account so RLS can scope saved places, history and reports to it
 * without asking for an email or phone number.
 */
export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signedIn.user?.id ?? null;
}
