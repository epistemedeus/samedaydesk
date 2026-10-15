import { canonical, digestJson, sha256 } from '../vendor/change-monitor/src/canonical.mjs';
import { sourceProjectionAdapter } from '../vendor/change-monitor/src/adapters/source-projection.mjs';
import { parseSnapshot } from '../vendor/change-monitor/vendor/s12-observatory/envelope.js';
import { projectSnapshot } from '../vendor/change-monitor/vendor/s12-observatory/projection.js';
import { sealObservation } from '../vendor/change-monitor/src/transition.mjs';

export { canonical, digestJson, sha256 };
export const iso = ms => new Date(ms).toISOString();
export function jsonPointer(document, pointer) {
  let value = document;
  for (const key of pointer.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return { found: false };
    value = value[key];
  }
  return { found: true, value };
}
export function normalize(config, result, now) {
  const common = {
    adapterId: 'bounded-http', schemaId: 'continuous-monitoring.http.v1',
    sourceKind: 'http', sourceScope: config.scopeKey, sourceVersion: 'http.v1',
    observedAt: iso(now), coverage: { complete: true }, nonSemantic: { capture: 'http' },
  };
  const fail = code => sealObservation({ ...common, evidenceClass: 'source_failure', failureCode: code, material: null });
  if (result.failure) return fail(result.failure);
  if (result.status === 304) return fail('unexpected_not_modified'); // handled with a saved comparable baseline by worker
  if (result.status >= 500 || [408, 425, 429].includes(result.status)) return fail(`http_${result.status}`);
  let material;
  if (config.mode === 'http') {
    material = { status: result.status, contentType: result.headers['content-type']?.split(';')[0] ?? null,
      bodyDigest: sha256(result.body) };
  } else {
    if (result.status !== 200) return fail(`http_${result.status}`);
    let document;
    try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.body)); }
    catch { return fail('invalid_json'); }
    if (config.mode === 'observatory') {
      // Published envelopes need the maintained projection's coverage/population
      // normalization, exactly as readMaintainedProjection does after its GET.
      const input = document?.schemaVersion === 'pilot.external-observatory.v1' && Array.isArray(document.observations)
        ? { projection: projectSnapshot(parseSnapshot(document, { fetchedAt: iso(now) }), { observedAt: iso(now) }) }
        : document;
      const adapted = sourceProjectionAdapter.normalize({ source: { kind: 'source-projection', scope: `source-projection:${config.sourceId}` } }, input);
      if (adapted.evidenceClass !== 'comparable') return fail(adapted.failureCode || 'incomparable');
      material = adapted.material;
    } else {
      material = { status: result.status, fields: {} };
      for (const pointer of config.pointers) {
        const selected = jsonPointer(document, pointer);
        // A required missing value is incomplete evidence, never a synthetic null/zero.
        if (!selected.found) return fail('partial_fields');
        material.fields[pointer] = selected.value;
      }
    }
  }
  try {
    if (Buffer.byteLength(canonical(material)) > 16384) return fail('material_limit');
    return sealObservation({ ...common, evidenceClass: 'comparable', material, failureCode: null });
  } catch { return fail('unsafe_material'); }
}
export function materialDiff(before, after) {
  // Bounded top-level comparison. JSON monitors expose each selected pointer separately.
  const left = before?.fields || before || {};
  const right = after?.fields || after || {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap(field => {
    const oldValue = Object.hasOwn(left, field) ? left[field] : null;
    const newValue = Object.hasOwn(right, field) ? right[field] : null;
    return canonical(oldValue) === canonical(newValue) ? [] : [{ field, before: oldValue, after: newValue }];
  });
}
