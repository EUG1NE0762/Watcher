import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

describe('repository hygiene', () => {
  it('contains no secrets and the app never references server-only keys', () => {
    expect(() => execFileSync('node', ['scripts/check-secrets.mjs'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });

  it('the Edge Function copy of the scoring engine is in sync with packages/scoring', () => {
    expect(() => execFileSync('node', ['scripts/sync-scoring.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });
});
