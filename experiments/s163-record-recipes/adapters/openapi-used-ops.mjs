/**
 * Prepare used-operation pin + next-run manifest for s134-openapi-impact.
 * Does not fetch remotes; operates on already-captured OpenAPI documents.
 */
import fs from 'node:fs';
import path from 'node:path';
import { refuse } from './refuse-unsupported.mjs';

export function loadUsedOpsPin(pinPathOrObj) {
  const pin = typeof pinPathOrObj === 'string' ? JSON.parse(fs.readFileSync(pinPathOrObj, 'utf8')) : pinPathOrObj;
  if (!pin || !Array.isArray(pin.operations) || pin.operations.length === 0) {
    return refuse('empty-used-ops-pin', 'used-ops pin must list operations[{method,path}|{operationId}]');
  }
  for (const [i, op] of pin.operations.entries()) {
    const hasId = op.operationId;
    const hasMp = op.method && op.path;
    if (!hasId && !hasMp) {
      return refuse('invalid-used-op', `operations[${i}] needs operationId or method+path`, { op });
    }
  }
  return { ok: true, pin };
}

export function buildOpenApiCliArgs({ before, after, usedPin, s134Root }) {
  const pin = loadUsedOpsPin(usedPin);
  if (!pin.ok) return pin;
  if (!fs.existsSync(before) || !fs.existsSync(after)) {
    return refuse('missing-openapi-capture', 'before/after OpenAPI captures required', { before, after });
  }
  const cli = path.join(s134Root, 'modules/openapi-impact/cli.mjs');
  return {
    ok: true,
    argv: [cli, '--before', before, '--after', after, '--used', typeof usedPin === 'string' ? usedPin : ''],
    importHint: `import { compareOpenApiImpact } from '${cli}'`,
    pin: pin.pin,
  };
}

export function buildNextRunManifest(recipeId, { before, after, usedPin, sourceMeta, lastReport }) {
  return {
    schema: 's163.next-run-manifest.v1',
    recipeId,
    parser: 's134-openapi-impact',
    inputs: { before, after, used: usedPin },
    sourceMeta: sourceMeta || null,
    coverage: {
      scope: 'used-operations-only',
      usedOperationCount: lastReport?.report?.usedOperationCount ?? lastReport?.usedOperationCount ?? null,
      note: 'Webhook/component changes outside pinned used ops are out of scope for impact.unchanged claims.',
    },
    retain: ['units', 'coverage', 'sourceUrl', 'commit', 'license'],
    paidValueClaim: false,
  };
}
