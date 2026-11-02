import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'supabase', 'seed', 'data');

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Every JSON file in supabase/seed/data/areas is a city or province. Adding a town is adding rows (or a file);
 * a new file must also be imported in app/src/data/demoSource.ts.
 */
export function loadAreaSeeds() {
  const dir = join(DATA, 'areas');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => readJson(join(dir, f)));
}
