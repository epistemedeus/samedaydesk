/**
 * Used-operation OpenAPI before/after change impact (offline).
 * Compares only operations listed in --used (method+path or operationId).
 * Does not fetch, resolve remote $ref, or claim paid API value.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { emit, parseArgs, uncertainty, FREE_BASELINE } from '../../lib/common.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export function loadOpenApi(text, label) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return { ok: false, error: 'empty-document', label, doc: null, uncertainties: [] };
  }
  let doc;
  try {
    doc = trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(trimmed) : parseYaml(trimmed);
  } catch (e) {
    return {
      ok: false,
      error: 'parse-error',
      detail: String(e.message || e),
      label,
      doc: null,
      uncertainties: [],
    };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'not-object', label, doc: null, uncertainties: [] };
  }
  const uncertainties = [];
  if (!doc.openapi && !doc.swagger) {
    uncertainties.push(uncertainty('unknown-dialect', 'No openapi/swagger field'));
  }
  return { ok: true, label, doc, uncertainties };
}

function opKey(method, p) {
  return `${String(method).toUpperCase()} ${p}`;
}

export function indexOperations(doc) {
  const map = new Map();
  const paths = doc?.paths && typeof doc.paths === 'object' ? doc.paths : {};
  for (const [p, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const m of METHODS) {
      if (item[m] && typeof item[m] === 'object') {
        const op = item[m];
        const key = opKey(m, p);
        map.set(key, {
          key,
          method: m.toUpperCase(),
          path: p,
          operationId: op.operationId || null,
          summary: op.summary || null,
          parameters: summarizeParams([...(item.parameters || []), ...(op.parameters || [])]),
          requestBody: Boolean(op.requestBody),
          responses: Object.keys(op.responses || {}).sort(),
          deprecated: Boolean(op.deprecated),
        });
      }
    }
  }
  return map;
}

function summarizeParams(params) {
  if (!Array.isArray(params)) return [];
  const byKey = new Map();
  for (const p of params) {
    if (!p || typeof p !== 'object') continue;
    const name = p.name || null;
    const loc = p.in || null;
    byKey.set(`${loc}:${name}`, {
      name,
      in: loc,
      required: Boolean(p.required),
      schemaType: p.schema?.type || p.type || null,
    });
  }
  return [...byKey.values()].sort((a, b) => `${a.in}:${a.name}`.localeCompare(`${b.in}:${b.name}`));
}

export function resolveUsed(usedSpec, beforeMap, afterMap) {
  const uncertainties = [];
  const resolved = [];
  if (!usedSpec || !Array.isArray(usedSpec.operations)) {
    return {
      resolved: [],
      uncertainties: [uncertainty('missing-used-list', 'used-ops must be { operations: [...] }')],
    };
  }
  for (const entry of usedSpec.operations) {
    if (!entry || typeof entry !== 'object') {
      uncertainties.push(uncertainty('malformed-used-entry', 'non-object entry', { entry }));
      continue;
    }
    let key = null;
    if (entry.method && entry.path) key = opKey(entry.method, entry.path);
    else if (entry.operationId) {
      const hit =
        [...beforeMap.values()].find((o) => o.operationId === entry.operationId) ||
        [...afterMap.values()].find((o) => o.operationId === entry.operationId);
      if (hit) key = hit.key;
      else {
        uncertainties.push(
          uncertainty('unknown-operationId', `operationId not found in before/after: ${entry.operationId}`, {
            operationId: entry.operationId,
          }),
        );
        continue;
      }
    } else {
      uncertainties.push(uncertainty('incomplete-used-entry', 'need method+path or operationId', { entry }));
      continue;
    }
    resolved.push({ key, source: entry });
  }
  return { resolved, uncertainties };
}

function paramSig(p) {
  return `${p.in}|${p.name}|${p.required}|${p.schemaType}`;
}

export function diffUsedOps(beforeMap, afterMap, usedKeys) {
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  const conflicting = [];
  const unknowns = [];

  for (const key of usedKeys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (!b && !a) {
      unknowns.push({ key, reason: 'absent-in-both' });
      continue;
    }
    if (!b && a) {
      added.push({ key, after: a });
      continue;
    }
    if (b && !a) {
      removed.push({ key, before: b });
      continue;
    }
    const fieldChanges = [];
    if (b.deprecated !== a.deprecated) {
      fieldChanges.push({ field: 'deprecated', before: b.deprecated, after: a.deprecated });
    }
    if (b.requestBody !== a.requestBody) {
      fieldChanges.push({ field: 'requestBody', before: b.requestBody, after: a.requestBody });
    }
    if (JSON.stringify(b.responses) !== JSON.stringify(a.responses)) {
      fieldChanges.push({ field: 'responses', before: b.responses, after: a.responses });
    }
    if (b.operationId !== a.operationId) {
      fieldChanges.push({ field: 'operationId', before: b.operationId, after: a.operationId });
    }
    const bp = b.parameters.map(paramSig).join(';');
    const ap = a.parameters.map(paramSig).join(';');
    if (bp !== ap) fieldChanges.push({ field: 'parameters', before: b.parameters, after: a.parameters });
    if (fieldChanges.length === 0) unchanged.push({ key });
    else {
      if (
        b.operationId &&
        a.operationId &&
        b.operationId !== a.operationId &&
        fieldChanges.some((c) => c.field === 'parameters')
      ) {
        conflicting.push({ key, note: 'operationId and parameters both changed', fieldChanges });
      }
      changed.push({ key, fieldChanges });
    }
  }
  return { added, removed, changed, unchanged, conflicting, unknowns };
}

export function compareOpenApiImpact({ beforeText, afterText, usedSpec }) {
  const before = loadOpenApi(beforeText, 'before');
  const after = loadOpenApi(afterText, 'after');
  const uncertainties = [...(before.uncertainties || []), ...(after.uncertainties || [])];
  if (!before.ok || !after.ok) {
    return {
      module: 'openapi-impact',
      ok: false,
      errors: [before.ok ? null : before, after.ok ? null : after].filter(Boolean),
      uncertainties,
      freeBaseline: FREE_BASELINE,
      differenceInDeliveredOutput:
        'No impact report: one or both OpenAPI documents failed local parse. Free baseline remains offline parse-only.',
    };
  }
  const beforeMap = indexOperations(before.doc);
  const afterMap = indexOperations(after.doc);
  const { resolved, uncertainties: u2 } = resolveUsed(usedSpec, beforeMap, afterMap);
  uncertainties.push(...u2);
  const usedKeys = [...new Set(resolved.map((r) => r.key))];
  const impact = diffUsedOps(beforeMap, afterMap, usedKeys);
  const hasImpact =
    impact.added.length + impact.removed.length + impact.changed.length + impact.conflicting.length > 0;
  return {
    module: 'openapi-impact',
    ok: true,
    scope: 'used-operations-only',
    usedOperationCount: usedKeys.length,
    impact,
    uncertainties,
    freeBaseline: FREE_BASELINE,
    differenceInDeliveredOutput: hasImpact
      ? 'Reports added/removed/changed fields for buyer-used operations only. Does not call the API, apply patches, or assert production breakage.'
      : 'No used-operation structural deltas detected (or used list empty/unknown). Still not a runtime compatibility proof.',
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`Usage: s134-openapi-impact --before <file> --after <file> --used <file>\n`);
    process.exit(0);
  }
  if (!args.before || !args.after || !args.used) {
    process.stderr.write('missing --before/--after/--used\n');
    process.exit(2);
  }
  const beforeText = fs.readFileSync(args.before, 'utf8');
  const afterText = fs.readFileSync(args.after, 'utf8');
  const usedSpec = JSON.parse(fs.readFileSync(args.used, 'utf8'));
  const report = compareOpenApiImpact({ beforeText, afterText, usedSpec });
  emit({
    tool: 's134-openapi-impact',
    inputs: {
      before: path.resolve(args.before),
      after: path.resolve(args.after),
      used: path.resolve(args.used),
    },
    report,
  });
  process.exit(report.ok ? 0 : 2);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
