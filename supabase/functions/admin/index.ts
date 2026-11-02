import { createDeps } from '../_shared/deps.ts';
import { handleAdmin } from './handler.ts';

const deps = createDeps();
Deno.serve((req) => handleAdmin(req, deps));
