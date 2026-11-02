// Deploys the whole Watcher backend to a Supabase project you own, using the Supabase CLI and your login.
//
//   npx supabase login                       # once
//   npm run deploy:backend -- --project-ref <ref> [--with-demo] [--secrets <file>] [--skip-functions] [--dry-run]
//
// Steps: link -> migrations -> seed (real sources + 46 areas; demo incidents only with --with-demo)
// -> function secrets -> deploy the 6 Edge Functions -> Vault + daily cron -> first score recompute
// -> write app/.env.local -> smoke-test the live API. Safe to re-run.
//
// Secrets are read from supabase/functions/.env by default (copy .env.example). They are sent to
// Supabase only; nothing secret is printed or written into the app.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const ref = opt('--project-ref');
const secretsFile = opt('--secrets', join(ROOT, 'supabase', 'functions', '.env'));
const withDemo = flag('--with-demo');
const dryRun = flag('--dry-run');
if (!ref || !/^[a-z0-9]{20}$/.test(ref)) {
  console.error('Usage: npm run deploy:backend -- --project-ref <20-character project ref> [--with-demo] [--secrets <file>] [--skip-functions] [--dry-run]');
  process.exit(1);
}
const url = `https://${ref}.supabase.co`;
const tmp = mkdtempSync(join(tmpdir(), 'watcher-deploy-'));
const step = (n, text) => console.log(`\n[${n}/9] ${text}`);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function supabase(cliArgs, { capture = false } = {}) {
  const shown = `npx supabase ${cliArgs.join(' ')}`;
  if (dryRun) {
    console.log(`  (dry run) ${shown}`);
    return '';
  }
  // shell is needed for npx on Windows; quote every argument so paths with spaces survive.
  const res = spawnSync(['npx', 'supabase', ...cliArgs.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a))].join(' '), {
    cwd: ROOT,
    shell: true,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(`\nFailed: ${shown}`);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(res.status ?? 1);
  }
  return res.stdout ?? '';
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
const env = existsSync(secretsFile) ? parseEnv(readFileSync(secretsFile, 'utf8')) : {};
if (!existsSync(secretsFile)) console.log(`No secrets file at ${secretsFile}: deploying with defaults (assistant, voice and ingestion fall back gracefully).`);
if (!env.CRON_SECRET) {
  env.CRON_SECRET = randomBytes(24).toString('hex');
  if (existsSync(secretsFile) && !dryRun) {
    writeFileSync(secretsFile, `${readFileSync(secretsFile, 'utf8').replace(/^CRON_SECRET=.*$/m, '').trimEnd()}\nCRON_SECRET=${env.CRON_SECRET}\n`);
    console.log(`Generated a CRON_SECRET and saved it to ${secretsFile}.`);
  }
}
for (const [name, what] of [
  ['ANTHROPIC_API_KEY', 'Ask Watcher uses the data-only summary'],
  ['ELEVENLABS_API_KEY', 'voice briefing uses on-device TTS'],
  ['LLM_API_KEY', 'ingestion uses keyword rules unless LLM_BASE_URL is a keyless local model'],
]) {
  if (!env[name]) console.log(`  note: ${name} not set, so ${what}.`);
}

step(1, `Linking project ${ref}`);
supabase(['link', '--project-ref', ref]);

step(2, 'Applying migrations (schema, PostGIS, RLS, functions)');
supabase(['db', 'push', '--remote', '--yes']);

step(3, `Seeding sources and areas${withDemo ? ' + LABELLED DEMO incidents' : ' (no demo data)'}`);
const seedPath = join(tmp, 'seed.sql');
const gen = spawnSync(process.execPath, [join(ROOT, 'scripts', 'generate-seed.mjs'), ...(withDemo ? [] : ['--no-demo']), '--out', seedPath], { stdio: 'inherit' });
if (gen.status !== 0) process.exit(gen.status ?? 1);
supabase(['db', 'query', '--remote', '--yes', '-f', seedPath]);

step(4, 'Setting Edge Function secrets');
// Supabase provides SUPABASE_* itself and refuses to overwrite them; empty values are left unset.
const fnEnv = Object.entries(env).filter(([k, v]) => v && !k.startsWith('SUPABASE_'));
const fnEnvPath = join(tmp, 'functions.env');
writeFileSync(fnEnvPath, fnEnv.map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
supabase(['secrets', 'set', '--env-file', fnEnvPath, '--yes']);
console.log(`  set: ${fnEnv.map(([k]) => k).join(', ')}`);

step(5, 'Deploying Edge Functions');
if (flag('--skip-functions')) console.log('  skipped (--skip-functions)');
else {
  // Keep the engine copy bundled into the functions identical to packages/scoring before deploying.
  const sync = spawnSync(process.execPath, [join(ROOT, 'scripts', 'sync-scoring.mjs')], { stdio: 'inherit' });
  if (sync.status !== 0) process.exit(sync.status ?? 1);
  supabase(['functions', 'deploy', '--use-api', '--project-ref', ref, '--yes']);
}

step(6, 'Scheduling the daily ingest + recompute (Vault + pg_cron)');
const vaultSql = join(tmp, 'vault.sql');
const upsert = (name, value) => `
  if exists (select 1 from vault.secrets where name = ${q(name)}) then
    perform vault.update_secret((select id from vault.secrets where name = ${q(name)}), ${q(value)});
  else
    perform vault.create_secret(${q(value)}, ${q(name)});
  end if;`;
writeFileSync(vaultSql, `do $$ begin${upsert('watcher_project_url', url)}${upsert('watcher_cron_secret', env.CRON_SECRET)}\nend $$;\n`);
supabase(['db', 'query', '--remote', '--yes', '-f', vaultSql]);
supabase(['db', 'query', '--remote', '--yes', '-f', join(ROOT, 'supabase', 'sql', 'schedule-cron.sql')]);

step(7, 'Computing the first scores');
if (!dryRun) {
  const res = await fetch(`${url}/functions/v1/recompute-scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-watcher-cron-secret': env.CRON_SECRET },
    body: '{}',
  });
  console.log(`  recompute-scores: HTTP ${res.status}`);
}

step(8, 'Writing app/.env.local (public URL + publishable key only)');
let anonKey = '';
if (!dryRun) {
  const keys = JSON.parse(supabase(['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { capture: true }) || '[]');
  const pick = keys.find((k) => k.type === 'publishable') ?? keys.find((k) => k.name === 'anon');
  anonKey = pick?.api_key ?? '';
  if (!anonKey) console.log('  Could not find a publishable/anon key; set EXPO_PUBLIC_SUPABASE_ANON_KEY by hand.');
  const appEnv = join(ROOT, 'app', '.env.local');
  const keep = existsSync(appEnv) ? readFileSync(appEnv, 'utf8').split(/\r?\n/).filter((l) => l && !/^EXPO_PUBLIC_SUPABASE_(URL|ANON_KEY)=/.test(l)) : [];
  writeFileSync(appEnv, [...keep, `EXPO_PUBLIC_SUPABASE_URL=${url}`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`].join('\n') + '\n');
  console.log(`  wrote ${appEnv}`);
}

step(9, 'Smoke-testing the live API');
let ok = true;
if (!dryRun && anonKey) {
  const auth = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: '{}' });
  const session = auth.ok ? await auth.json() : null;
  if (!session?.access_token) {
    ok = false;
    console.log('  ✗ Anonymous sign-in is disabled. Enable it: Dashboard → Authentication → Sign In / Providers → "Allow anonymous sign-ins".');
  } else console.log('  ✓ anonymous sign-in works');
  const headers = { apikey: anonKey, Authorization: `Bearer ${session?.access_token ?? anonKey}` };
  const areas = await (await fetch(`${url}/rest/v1/areas_public?select=id`, { headers })).json().catch(() => []);
  const scores = await (await fetch(`${url}/rest/v1/risk_scores?select=area_id`, { headers })).json().catch(() => []);
  const areaCount = Array.isArray(areas) ? areas.length : 0;
  const scoreCount = Array.isArray(scores) ? scores.length : 0;
  console.log(`  ${areaCount ? '✓' : '✗'} ${areaCount} areas readable`);
  console.log(`  ${scoreCount ? '✓' : '✗'} ${scoreCount} area scores readable`);
  ok &&= areaCount > 0 && scoreCount > 0;
}

rmSync(tmp, { recursive: true, force: true });
console.log(
  dryRun
    ? '\nDry run complete: nothing was changed.'
    : ok
      ? `\nDone. Restart the app (npm run web) and the demo banner disappears: it now reads ${url}.\nMake yourself a moderator: copy your Account ID from Settings, then run in the SQL editor:\n  update public.profiles set is_moderator = true where id = '<account id>';`
      : '\nDeployed, but the smoke test found problems above. Fix them and re-run (it is safe to repeat).',
);
