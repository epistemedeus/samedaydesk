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
  const uncertainties = [];
  for (const [p, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const m of METHODS) {
      if (item[m] && typeof item[m] === 'object') {
        const op = item[m];
        const key = opKey(m, p);
        const paramSum = summarizeParams([...(item.parameters || []), ...(op.parameters || [])], doc, uncertainties, key);
        const rb = summarizeRequestBody(op.requestBody, doc, uncertainties, key);
        const respSum = summarizeResponses(op.responses || {}, doc, uncertainties, key);
        map.set(key, {
          key,
          method: m.toUpperCase(),
          path: p,
          operationId: op.operationId || null,
          summary: op.summary || null,
          parameters: paramSum.parameters,
          requestBody: rb,
          responses: respSum.responses,
          security: summarizeSecurity(op.security, doc.security),
          deprecated: Boolean(op.deprecated),
          assessmentGaps: [...new Set([...(paramSum.gaps || []), ...(rb.gaps || []), ...(respSum.gaps || [])])],
        });
      }
    }
  }
  map._indexUncertainties = uncertainties;
  return map;
}

function isLocalRef(ref) {
  return typeof ref === 'string' && ref.startsWith('#/');
}

function resolveLocalRef(doc, ref, uncertainties, opKey, gapSink) {
  if (!isLocalRef(ref)) {
    const gap = `remote-or-opaque-ref:${ref}`;
    gapSink.push(gap);
    uncertainties.push(
      uncertainty('unresolved-ref', `Cannot fetch/resolve non-local $ref under used op ${opKey}`, {
        opKey,
        ref,
      }),
    );
    return { ok: false, ref, value: null };
  }
  const parts = ref.slice(2).split('/');
  let cur = doc;
  for (const part of parts) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!cur || typeof cur !== 'object' || !(key in cur)) {
      const gap = `missing-local-ref:${ref}`;
      gapSink.push(gap);
      uncertainties.push(
        uncertainty('missing-local-ref', `Local $ref not found: ${ref}`, { opKey, ref }),
      );
      return { ok: false, ref, value: null };
    }
    cur = cur[key];
  }
  return { ok: true, ref, value: cur };
}

function schemaFingerprint(schema, doc, uncertainties, opKey, gapSink, depth = 0) {
  if (!schema || typeof schema !== 'object') return { kind: 'absent' };
  if (schema.$ref) {
    if (!isLocalRef(schema.$ref)) {
      gapSink.push(`schema-remote-ref:${schema.$ref}`);
      uncertainties.push(
        uncertainty('unresolved-ref', `Schema $ref not locally resolved under ${opKey}`, {
          opKey,
          ref: schema.$ref,
        }),
      );
      return { kind: 'unresolved-ref', ref: schema.$ref };
    }
    if (depth > 3) return { kind: 'ref', ref: schema.$ref, truncated: true };
    const resolved = resolveLocalRef(doc, schema.$ref, uncertainties, opKey, gapSink);
    if (!resolved.ok) return { kind: 'missing-ref', ref: schema.$ref };
    return {
      kind: 'ref',
      ref: schema.$ref,
      target: schemaFingerprint(resolved.value, doc, uncertainties, opKey, gapSink, depth + 1),
    };
  }
  const fp = {
    kind: 'inline',
    type: schema.type || null,
    format: schema.format || null,
    enum: Array.isArray(schema.enum) ? [...schema.enum].map((x) => JSON.stringify(x)).sort() : null,
    required: Array.isArray(schema.required) ? [...schema.required].map(String).sort() : null,
  };
  if (schema.properties && typeof schema.properties === 'object' && depth < 2) {
    fp.properties = {};
    for (const name of Object.keys(schema.properties).sort()) {
      const prop = schema.properties[name];
      fp.properties[name] = {
        type: prop?.type || null,
        format: prop?.format || null,
        ref: prop?.$ref || null,
        enum: Array.isArray(prop?.enum) ? [...prop.enum].map((x) => JSON.stringify(x)).sort() : null,
      };
    }
  }
  return fp;
}

function summarizeParams(params, doc, uncertainties, opKey) {
  const gaps = [];
  if (!Array.isArray(params)) return { parameters: [], gaps };
  const byKey = new Map();
  for (const p of params) {
    if (!p || typeof p !== 'object') continue;
    let param = p;
    let ref = null;
    if (p.$ref) {
      ref = p.$ref;
      const resolved = resolveLocalRef(doc, p.$ref, uncertainties, opKey, gaps);
      if (!resolved.ok) {
        byKey.set(`ref:${p.$ref}`, {
          name: null,
          in: null,
          required: null,
          schema: { kind: 'unresolved-ref', ref: p.$ref },
          ref: p.$ref,
        });
        continue;
      }
      param = resolved.value;
    }
    const name = param.name || null;
    const loc = param.in || null;
    byKey.set(`${loc}:${name}`, {
      name,
      in: loc,
      required: Boolean(param.required),
      schema: schemaFingerprint(param.schema || (param.type ? { type: param.type } : null), doc, uncertainties, opKey, gaps),
      ref,
    });
  }
  return {
    parameters: [...byKey.values()].sort((a, b) =>
      `${a.ref || ''}:${a.in}:${a.name}`.localeCompare(`${b.ref || ''}:${b.in}:${b.name}`),
    ),
    gaps,
  };
}

function summarizeSecurity(opSecurity, docSecurity) {
  const src = opSecurity !== undefined ? opSecurity : docSecurity;
  const inherited = opSecurity === undefined;
  if (src == null) {
    return { inherited, requirements: [] };
  }
  if (!Array.isArray(src)) {
    return { inherited, requirements: ['<unparseable-security>'] };
  }
  const requirements = src.map((req) => {
    if (!req || typeof req !== 'object') return '<invalid>';
    return Object.keys(req)
      .sort()
      .map((k) => `${k}:[${[...(req[k] || [])].map(String).sort().join(',')}]`)
      .join(';');
  });
  return { inherited, requirements: requirements.sort() };
}

function summarizeRequestBody(rb, doc, uncertainties, opKey) {
  const gaps = [];
  if (!rb || typeof rb !== 'object') {
    return { present: false, required: false, schema: null, gaps };
  }
  if (rb.$ref) {
    const resolved = resolveLocalRef(doc, rb.$ref, uncertainties, opKey, gaps);
    if (!resolved.ok) {
      return { present: true, required: null, schema: { kind: 'unresolved-ref', ref: rb.$ref }, gaps };
    }
    return summarizeRequestBody(resolved.value, doc, uncertainties, opKey);
  }
  const content = rb.content && typeof rb.content === 'object' ? rb.content : {};
  const schemas = {};
  for (const mt of Object.keys(content).sort()) {
    schemas[mt] = schemaFingerprint(content[mt]?.schema, doc, uncertainties, opKey, gaps);
  }
  return {
    present: true,
    required: Boolean(rb.required),
    schemas,
    gaps,
  };
}

function summarizeResponses(responses, doc, uncertainties, opKey) {
  const gaps = [];
  const out = [];
  for (const code of Object.keys(responses || {}).sort()) {
    const r = responses[code];
    if (!r || typeof r !== 'object') {
      out.push({ code, schema: { kind: 'absent' } });
      continue;
    }
    if (r.$ref) {
      const resolved = resolveLocalRef(doc, r.$ref, uncertainties, opKey, gaps);
      if (!resolved.ok) {
        out.push({ code, schema: { kind: 'unresolved-ref', ref: r.$ref } });
        continue;
      }
      // treat resolved response object
      const content = resolved.value.content && typeof resolved.value.content === 'object' ? resolved.value.content : {};
      const schemas = {};
      for (const mt of Object.keys(content).sort()) {
        schemas[mt] = schemaFingerprint(content[mt]?.schema, doc, uncertainties, opKey, gaps);
      }
      out.push({ code, ref: r.$ref, schemas });
      continue;
    }
    const content = r.content && typeof r.content === 'object' ? r.content : {};
    const schemas = {};
    for (const mt of Object.keys(content).sort()) {
      schemas[mt] = schemaFingerprint(content[mt]?.schema, doc, uncertainties, opKey, gaps);
    }
    out.push({ code, ref: null, schemas });
  }
  return { responses: out, gaps };
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
  return `${p.in}|${p.name}|${p.required}|${JSON.stringify(p.schema || null)}|${p.ref || ''}`;
}

function securitySig(s) {
  return JSON.stringify(s || null);
}

function responsesSig(r) {
  return JSON.stringify(r || []);
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
    if (JSON.stringify(b.requestBody) !== JSON.stringify(a.requestBody)) {
      fieldChanges.push({ field: 'requestBody', before: b.requestBody, after: a.requestBody });
    }
    if (responsesSig(b.responses) !== responsesSig(a.responses)) {
      fieldChanges.push({ field: 'responses', before: b.responses, after: a.responses });
    }
    if (b.operationId !== a.operationId) {
      fieldChanges.push({ field: 'operationId', before: b.operationId, after: a.operationId });
    }
    if (securitySig(b.security) !== securitySig(a.security)) {
      fieldChanges.push({ field: 'security', before: b.security, after: a.security });
    }
    const bp = b.parameters.map(paramSig).join(';');
    const ap = a.parameters.map(paramSig).join(';');
    if (bp !== ap) fieldChanges.push({ field: 'parameters', before: b.parameters, after: a.parameters });
    const gaps = [...new Set([...(b.assessmentGaps || []), ...(a.assessmentGaps || [])])];
    if (fieldChanges.length === 0 && gaps.length) {
      unknowns.push({
        key,
        reason: 'assessment-gaps',
        gaps,
        note: 'Unexamined or unresolved dimensions present; refusing unqualified unchanged.',
      });
    } else if (fieldChanges.length === 0) unchanged.push({ key });
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
  uncertainties.push(...(beforeMap._indexUncertainties || []), ...(afterMap._indexUncertainties || []));
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
