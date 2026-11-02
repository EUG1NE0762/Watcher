// Fails if anything that looks like a secret is in the repo, or if the app bundle references a
// server-only secret. Scans tracked + untracked (non-ignored) files. Usage: node scripts/check-secrets.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const PATTERNS = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI/OpenRouter key', /\bsk-(?:or-v1-|proj-)?[A-Za-z0-9]{32,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['ElevenLabs key', /\bsk_[a-f0-9]{40,}\b/],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/],
  ['JWT (possible service_role key)', /eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Assigned secret env var', /^(?:ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|LLM_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET)=\S+/m],
];

// Names of server-only secrets that must never appear in client code.
const SERVER_ONLY = /\b(ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|LLM_API_KEY|GEMINI_API_KEY|SERVICE_ROLE_KEY|CRON_SECRET)\b/;

/** Files git would commit; without a git checkout (e.g. a ZIP download), walk the tree instead. */
function listFiles() {
  try {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean);
  } catch {
    const skip = /(^|\/)(node_modules|\.git|\.expo|dist|dist-check|android|ios|coverage)(\/|$)|(^|\/)\.env(\.[^/]*)?$/;
    const out = [];
    const walk = (dir) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (skip.test(rel) && !rel.endsWith('.env.example')) continue;
        if (entry.isDirectory()) walk(rel);
        else out.push(rel);
      }
    };
    walk('');
    return out;
  }
}

const files = listFiles().filter((f) => !/\.(png|jpg|jpeg|gif|ico|ttf|otf|woff2?|mp3|lock)$/i.test(f) && !f.endsWith('package-lock.json'));

const problems = [];
for (const f of files) {
  const path = join(ROOT, f);
  try {
    if (!statSync(path).isFile() || statSync(path).size > 2_000_000) continue;
  } catch {
    continue;
  }
  const text = readFileSync(path, 'utf8');
  for (const [name, re] of PATTERNS) if (re.test(text)) problems.push(`${f}: ${name}`);
  if (f.startsWith('app/') && /\.(ts|tsx|js|json)$/.test(f) && SERVER_ONLY.test(text)) {
    problems.push(`${f}: client code references a server-only secret name`);
  }
}

if (problems.length) {
  console.error('Possible secrets found:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`No secrets found in ${files.length} files.`);
