import { validateCapability, inputsCompatible } from '../../../scale-lab/capability-market/src/validate.mjs';
import { discloseCapability } from '../../../scale-lab/capability-market/src/journey.mjs';
import { classifyEvidenceTrust, classifyCostLanes } from '../../../../packs/capability-preflight/src/trust.mjs';
import { SCHEMAS, check, copy, createVersion, freeze, iso, ref, id, plain, str } from './contracts.mjs';

const ADAPTER_SCHEMA = 'neomorphic.foundry.capability-adapter.v1';
function shape(requirements) {
  // Fail closed for unsupported types/constraints instead of widening them.
  check(plain(requirements) && Object.keys(requirements).every(k => ['required', 'properties'].includes(k)), 'unsupported S04 shape');
  function normalize(spec) {
    check(plain(spec), 'S04 property must be an object');
    const result = copy(spec);
    if (result.type === 'object') {
      result.required ??= [];
      result.properties ??= {};
      for (const [key, child] of Object.entries(result.properties)) result.properties[key] = normalize(child);
    }
    if (result.items !== undefined) result.items = normalize(result.items);
    return result;
  }
  return normalize({ type: 'object', required: copy(requirements.required || []), properties: copy(requirements.properties || {}) });
}
export function adaptS04(raw, { source, rights, environment = {}, now, inputs = null } = {}) {
  const original = copy(raw); iso(now); const validation = validateCapability(original, { nowMs: Date.parse(now) });
  check(validation.ok, `S04 validation failed: ${validation.errors.join('; ')}`, 'ADAPTER_REJECTED');
  const historical = original.historical === true || original.active === false || Boolean(original.supersededBy);
  const classification = original.demo ? 'demo' : historical ? 'historical' : 'maintained';
  const declaredFunding = ['voluntary', 'unfunded-request', 'funded'].includes(original.fundingKind) ? original.fundingKind : 'unknown';
  const declaredActionability = ['actionable', 'not-actionable', 'unknown'].includes(original.actionability) ? original.actionability : 'unknown';
  // Qualification of the original S04 key is a reversible namespace mapping, not a new registry ID.
  const version = createVersion({ schema: SCHEMAS['capability-version'], capabilityId: `s04:${original.id}`,
    version: `git:${source.revision}`, source: copy(source), outcomes: copy(original.outcomes),
    input: shape(original.inputRequirements), output: shape(original.outputRequirements), dependencies: [], rights: copy(rights), environment: copy(environment),
    provenance: { refs: [`s04:${original.id}`, `git:${source.revision}`], origin: 'source:s04-capability-market', maintainer: 'operator:neomorphic',
      classification, funding: declaredFunding, actionability: classification === 'maintained' ? declaredActionability : 'not-actionable', original } });
  return freeze({ schema: ADAPTER_SCHEMA, adapter: 's04', version,
    disclosure: discloseCapability(original, { nowMs: Date.parse(now) }),
    inputCheck: inputs === null ? null : inputsCompatible(original, copy(inputs)),
    validation, observations: [], note: 'Advertisement and local fixture adapter presence are not execution or verification. Prices do not establish funding.' });
}
export function adaptPackage({ manifest, source, outcomes, input, output, dependencies = [], rights, environment, provenance }) {
  const metadata = copy(manifest); str(metadata.name, 'package.name'); str(metadata.version, 'package.version');
  check(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(metadata.name), 'unsupported package name');
  return createVersion({ schema: SCHEMAS['capability-version'], capabilityId: `npm:${metadata.name}`,
    version: `${metadata.version}+git.${source.revision}`, source: copy(source), outcomes: copy(outcomes), input: copy(input), output: copy(output),
    dependencies: copy(dependencies), rights: copy(rights), environment: copy(environment),
    provenance: { ...copy(provenance), original: { manifest: metadata, suppliedProvenance: copy(provenance.original) } } });
}
export function adaptPreflight(report, { target, receiptRef } = {}) {
  const original = copy(report); ref(target); id(receiptRef);
  check(plain(original), 'preflight report must be an object');
  if (original.costReport !== null && original.costReport !== undefined) {
    check(plain(original.costReport), 'costReport must be an object');
    const comparisons = original.costReport.comparisons ?? [];
    check(Array.isArray(comparisons) && comparisons.length <= 1000, 'cost comparisons must be a bounded array');
    for (const c of comparisons) {
      check(plain(c), 'cost comparison must be an object');
      if (c.amountAtomic !== null && c.amountAtomic !== undefined) {
        check((Number.isSafeInteger(c.amountAtomic) && c.amountAtomic >= 0)
          || (typeof c.amountAtomic === 'string' && /^(0|[1-9][0-9]*)$/.test(c.amountAtomic)), 'amountAtomic must use integer units');
        str(c.currency, 'cost currency');
      }
    }
  }
  return freeze({ schema: ADAPTER_SCHEMA, adapter: 'preflight', target: copy(target), receiptRef,
    trust: classifyEvidenceTrust({ advertised: original.advertised ?? null, binding: original.binding ?? null,
      executionVerified: original.executionVerified ?? null, accepted: original.accepted ?? null }),
    costs: classifyCostLanes(original.costReport ?? null), original, observations: [],
    note: 'Supplied preflight claims/content binding remain claims. VF03 must admit independently assigned observations before resolver use.' });
}
