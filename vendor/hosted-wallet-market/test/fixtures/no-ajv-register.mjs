// Test-only. Lets the light cold-client tests import the real foundation digest,
// coldReceipt and proposalFrom on a box without `npm ci`. If ajv resolves, the
// real package is used. Otherwise a stand-in whose validators accept is used,
// because the foundation checks its asset constants at import time. No test
// that uses this stand-in asserts schema-validated behaviour; run the same
// tests after `npm ci` to exercise real ajv.
import {register} from 'node:module';

const hooks = `
const FAKES = {
  'ajv/dist/2020.js': 'export class Ajv2020 { addSchema() { return this; } getSchema() { return () => true; } }',
  'ajv-formats': 'export default function formats() {}',
};
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !(specifier in FAKES)) throw error;
    return {url: 'data:text/javascript,' + encodeURIComponent(FAKES[specifier]), shortCircuit: true};
  }
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));
