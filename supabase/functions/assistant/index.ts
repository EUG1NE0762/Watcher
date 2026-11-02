import { createDeps } from '../_shared/deps.ts';
import { handleAssistant } from './handler.ts';

const deps = createDeps();
Deno.serve((req) => handleAssistant(req, deps));
