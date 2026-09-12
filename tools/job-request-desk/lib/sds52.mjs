import { join } from 'node:path';
import { REPO_ROOT } from './pins.mjs';
import { CURRENT_CORE_BASE, runCurrent } from './current.mjs';
export const SDS52_PIN = CURRENT_CORE_BASE;
export const resolveWrapperRoot = () => join(REPO_ROOT, 'server/paid-useful-jobs');
export function parseJsonObject(text) { try { return JSON.parse(text); } catch { return null; } }
export const engineJsonFromWrapper = wrapper => wrapper?.engine?.json || wrapper?.engine || null;
export function runViaSds52(jobId, { files = {}, example = false, outDir, executionId } = {}) {
  const wrapper = runCurrent({ jobId, inputs: files, example, outDir, executionId });
  return { status: wrapper.ok ? 0 : 2, json: engineJsonFromWrapper(wrapper), wrapper, pin: CURRENT_CORE_BASE, cli: 'execute-current.mjs' };
}
