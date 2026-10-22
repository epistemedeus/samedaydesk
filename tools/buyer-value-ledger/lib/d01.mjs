import { fileURLToPath } from 'node:url';
import { CURRENT_CORE_BASE } from '../../job-request-desk/lib/current.mjs';
export const D01_PIN = CURRENT_CORE_BASE;
export const D01_REPO = 'epistemedeus/samedaydesk';
export const D01_REF = 'current-repository';
export const D01_EXPORT = 'server/paid-useful-jobs/index.mjs';
export const d01Root = () => fileURLToPath(new URL('../../../', import.meta.url));
export const d01BindingNote = () => ({ repo: D01_REPO, pin: D01_PIN, ref: D01_REF, exportPath: D01_EXPORT, available: true, root: d01Root(), executionContract: 'samedaydesk.paid-useful-jobs.execution.v1' });
export async function importD01(root) {
  if (root && root !== d01Root()) throw new Error('runner-override-refused');
  return { ...d01BindingNote(), ...await import('../../../server/paid-useful-jobs/index.mjs') };
}
