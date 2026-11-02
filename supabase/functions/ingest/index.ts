import { createDeps } from '../_shared/deps.ts';
import { handleIngest } from './handler.ts';

const deps = createDeps();
Deno.serve((req) => handleIngest(req, deps));
