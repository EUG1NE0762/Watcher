import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';

const SUPABASE_DIR = join(__dirname, '..', '..');

/**
 * Minimal stand-in for the parts of Supabase's platform the migrations depend on:
 * the anon/authenticated/service_role roles, auth.users and auth.uid() (read from the JWT claims GUC,
 * exactly like Supabase's implementation).
 */
const SUPABASE_STUB = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, is_anonymous boolean default true, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { postgis } });
  await db.exec(SUPABASE_STUB);
  const migrations = readdirSync(join(SUPABASE_DIR, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(SUPABASE_DIR, 'migrations', file), 'utf8'));
  }
  await db.exec('grant usage on schema extensions to anon, authenticated;');
  if (opts.seed) await db.exec(readFileSync(join(SUPABASE_DIR, 'seed.sql'), 'utf8'));
  return db;
}

/** Run statements as a Supabase API role, the way PostgREST does (SET ROLE + JWT claims). */
export async function asRole<T>(
  db: PGlite,
  role: 'anon' | 'authenticated',
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}
