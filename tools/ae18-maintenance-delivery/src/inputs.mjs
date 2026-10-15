import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export function requireThat(ok, code) { if (!ok) throw new Error(code); }
export function readJson(file) {
  requireThat(isAbsolute(file) && realpathSync(file) === resolve(file), 'canonical_input_required');
  const stat = lstatSync(file);
  requireThat(stat.isFile() && stat.size <= 131072, 'bounded_regular_input_required');
  return JSON.parse(readFileSync(file, 'utf8'));
}
export async function loadInputs({ sdsRoot = process.env.SDS_INPUT_ROOT, gatewayRoot = process.env.GATEWAY_INPUT_ROOT,
  merchantRoot = process.env.MERCHANT_INPUT_ROOT } = {}) {
  const pins = JSON.parse(readFileSync(new URL('../PINS.json', import.meta.url), 'utf8'));
  for (const [key, root] of Object.entries({ sds: sdsRoot, gateway: gatewayRoot, merchant: merchantRoot })) {
    requireThat(root && isAbsolute(root), `${key}_mount_required`);
    for (const file of pins.inputs[key].files) requireThat(digest(readFileSync(join(root, file.path))) === file.sha256, `${key}_pin_mismatch`);
  }
  requireThat(process.env.MERCHANT_INPUT_ROOT === merchantRoot, 'explicit_merchant_environment_required');
  const imp = (root, path) => import(pathToFileURL(join(root, path)).href);
  const [template, recipe, reuse, merchant, gateway] = await Promise.all([
    imp(sdsRoot, 'tools/ae14-compat-maintenance/src/occurrence.mjs'),
    imp(sdsRoot, 'tools/recurring-job-recipes/recipes/source-change-alert.mjs'),
    imp(sdsRoot, 'tools/result-reuse/src/export.mjs'),
    imp(sdsRoot, 'tools/recurring-job-recipes/vendor/page-change-bridge.mjs'),
    imp(gatewayRoot, 'src/index.mjs'),
  ]);
  return { template, recipe, reuse, merchant, gateway, pins };
}
