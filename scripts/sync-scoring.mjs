// Copies packages/scoring/src into supabase/functions/_shared/scoring (the Edge Runtime only bundles
// files under supabase/functions) and writes each function's deno.json import map.
// Usage: node scripts/sync-scoring.mjs [--check]
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const check = process.argv.includes('--check');
const SRC = join(ROOT, 'packages', 'scoring', 'src');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const DEST = join(FUNCTIONS, '_shared', 'scoring');
const HEADER = '// GENERATED from packages/scoring/src by scripts/sync-scoring.mjs. Do not edit here.\n';
const pkg = JSON.parse(readFileSync(join(ROOT, 'packages', 'scoring', 'package.json'), 'utf8'));

const zodVersion = pkg.dependencies.zod.replace(/^[\^~]/, '');
const supabaseJs = JSON.parse(readFileSync(join(ROOT, 'supabase', 'package.json'), 'utf8')).dependencies['@supabase/supabase-js'].replace(/^[\^~]/, '');
const denoJson = JSON.stringify(
  {
    imports: {
      '@watcher/scoring': '../_shared/scoring/index.ts',
      zod: `npm:zod@${zodVersion}`,
      '@supabase/supabase-js': `npm:@supabase/supabase-js@${supabaseJs}`,
    },
  },
  null,
  2,
) + '\n';

const expected = new Map();
for (const f of readdirSync(SRC).filter((f) => f.endsWith('.ts'))) {
  expected.set(join(DEST, f), HEADER + readFileSync(join(SRC, f), 'utf8'));
}
for (const d of readdirSync(FUNCTIONS)) {
  const dir = join(FUNCTIONS, d);
  if (d.startsWith('_') || !statSync(dir).isDirectory()) continue;
  expected.set(join(dir, 'deno.json'), denoJson);
}

if (check) {
  const stale = [...expected].filter(([p, c]) => !existsSync(p) || readFileSync(p, 'utf8') !== c).map(([p]) => p);
  const extra = existsSync(DEST) ? readdirSync(DEST).map((f) => join(DEST, f)).filter((p) => !expected.has(p)) : [];
  if (stale.length || extra.length) {
    console.error('Edge Function copies are out of date. Run: npm run sync:scoring\n' + [...stale, ...extra].join('\n'));
    process.exit(1);
  }
  console.log('scoring copy and deno.json files are in sync');
} else {
  rmSync(DEST, { recursive: true, force: true });
  mkdirSync(DEST, { recursive: true });
  for (const [p, c] of expected) writeFileSync(p, c);
  console.log(`synced ${expected.size} files`);
}
