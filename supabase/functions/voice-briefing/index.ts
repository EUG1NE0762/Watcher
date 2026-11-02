import { createDeps } from '../_shared/deps.ts';
import { handleVoiceBriefing } from './handler.ts';

const deps = createDeps();
Deno.serve((req) => handleVoiceBriefing(req, deps));
