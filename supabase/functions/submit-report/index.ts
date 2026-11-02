import { createDeps } from '../_shared/deps.ts';
import { handleSubmitReport } from './handler.ts';

const deps = createDeps();
Deno.serve((req) => handleSubmitReport(req, deps));
