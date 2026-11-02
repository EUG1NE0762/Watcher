import { createDeps } from '../_shared/deps.ts';
import { handleRecompute } from './handler.ts';

const deps = createDeps();
Deno.serve((req) => handleRecompute(req, deps));
