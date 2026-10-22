import { REPO_ROOT, KNOWN_RUNNERS, FALLBACK_RUNNERS } from './pins.mjs';
import { CURRENT_CORE_BASE } from '../../job-request-desk/lib/current.mjs';
export { KNOWN_RUNNERS, FALLBACK_RUNNERS };
export const isFallbackRunner = runner => FALLBACK_RUNNERS.includes(runner);
export const isKnownRunner = runner => KNOWN_RUNNERS.includes(runner);
export function resolveF08Root(explicit) {
  if (explicit && explicit !== REPO_ROOT) throw new Error('runner-override-refused');
  return REPO_ROOT;
}
export async function loadF08Module(root) {
  resolveF08Root(root);
  return import('../../../server/paid-useful-jobs/index.mjs');
}
export const LATER_BINDINGS = Object.freeze({ runner: { status: 'current-core-consumed', pin: CURRENT_CORE_BASE, consume: 'execution.v1 through durable request desk' } });
export function mapF08ResultToItem(engineId, result) {
  return { engineId, outcome: 'unknown', sold: false, code: 'unbound-result', outputs: [], fundingState: result?.fundingState || 'unknown' };
}
