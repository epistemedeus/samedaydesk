import { resolve, createGap } from '../../capabilities/src/index.mjs';
import { isI01TermsVersion } from '../../../../packs/contributor-desk/src/terms-version.mjs';
import { bounded, exact, freeze, id, oneOf, requireValue, schema } from './safe.mjs';
export const ENVELOPE = schema('participation');
export const MODES = Object.freeze(['report-gap', 'counterexample', 'adapt-artifact', 'maintain-cell']);
const minimumSeconds = { 'report-gap': 15, counterexample: 60, 'adapt-artifact': 300, 'maintain-cell': 900 };
const assessments = new WeakSet();

/** HOST API: request must already be permission-cleared; policy is never caller JSON. */
export function assessVF01({ snapshot, request, options, gap, permission }) {
  requireValue(permission !== undefined, 'permission_required');
  const cleared = bounded(permission); exact(cleared, ['provenance', 'authorizationRef']);
  oneOf(cleared.provenance, ['synthetic', 'authorized']); id(cleared.authorizationRef);
  requireValue(!gap || gap.reproducer?.permission === cleared.provenance, 'permission_mismatch');
  let resolution, genuineGap = null;
  try {
    resolution = resolve(snapshot, request, options);
    // The actual VF01 API decides whether this is a genuine gap.
    if (gap) genuineGap = createGap(snapshot, request, options, gap);
  } catch (error) {
    if (error?.code !== 'NOT_A_GAP') throw new Error('resolver_context_invalid');
  }
  const status = genuineGap ? 'genuine-miss' : resolution.status === 'compatible' ? 'known-hit'
    : !resolution.coverage.complete || !resolution.coverage.outcomes.includes(request.outcome) ? 'incomplete-coverage' : 'unknown';
  const assessment = Object.freeze({ status, gap: genuineGap, selected: resolution.selected });
  assessments.add(assessment); return assessment;
}
export function facts(raw) {
  const x = bounded(raw); exact(x, ['actionability', 'rights', 'funding', 'cost', 'termsVersion']);
  oneOf(x.actionability, ['actionable', 'not-actionable', 'unknown']);
  exact(x.rights, ['status', 'ref']); oneOf(x.rights.status, ['allowed', 'denied', 'unknown']); if (x.rights.ref !== null) id(x.rights.ref);
  exact(x.funding, ['kind', 'ref']); oneOf(x.funding.kind, ['voluntary', 'unfunded-request', 'funded', 'unknown']);
  if (x.funding.ref !== null) id(x.funding.ref); requireValue(x.funding.kind !== 'funded' || x.funding.ref !== null);
  if (x.cost !== null) { exact(x.cost, ['units', 'currency']); requireValue(Number.isSafeInteger(x.cost.units) && x.cost.units >= 0); id(x.cost.currency); }
  requireValue(x.termsVersion === null || isI01TermsVersion(x.termsVersion));
  return x;
}
/** No original result/error is inspected. It remains in the host's original lane. */
export function negotiate({ accepts = [], modes = MODES, budgetSeconds = 0 } = {}, { assessment, condition = 'unknown', disclosure }) {
  const caps = bounded({ accepts, modes, budgetSeconds }, { maxBytes: 4096 });
  requireValue(Array.isArray(caps.accepts) && caps.accepts.length <= 8 && caps.accepts.every(x => typeof x === 'string' && x.length <= 256) && Array.isArray(caps.modes) && caps.modes.length <= 4 && caps.modes.every(m => MODES.includes(m)));
  requireValue(Number.isInteger(budgetSeconds) && budgetSeconds >= 0 && budgetSeconds <= 86400);
  if (!accepts.includes(ENVELOPE)) return null;
  oneOf(condition, ['resolved', 'unknown', 'auth-failure', 'temporary-outage', 'quota-pressure']);
  const d = facts(disclosure);
  const status = condition === 'resolved' && assessments.has(assessment) ? assessment.status : condition === 'resolved' ? 'unknown' : condition;
  const allowed = status === 'genuine-miss' && d.rights.status === 'allowed' && ['voluntary', 'unfunded-request'].includes(d.funding.kind);
  return freeze({ schema: ENVELOPE, status, optional: true, originalAccess: 'unconditional', ...d,
    modes: allowed ? MODES.filter(m => modes.includes(m) && budgetSeconds >= minimumSeconds[m]) : [],
    costKnown: d.cost !== null, authority: 'host-owned', contributionState: 'not-started' });
}
export function decline(original, envelope = null) {
  const supplied = envelope ? bounded(envelope) : null;
  requireValue(!supplied || supplied.schema === ENVELOPE);
  const disclosure = supplied ? facts({ actionability: supplied.actionability, rights: supplied.rights, funding: supplied.funding, cost: supplied.cost, termsVersion: supplied.termsVersion })
    : { actionability: 'unknown', rights: { status: 'unknown', ref: null }, funding: { kind: 'unknown', ref: null }, cost: null, termsVersion: null };
  return { original, participation: freeze({ ...negotiate({ accepts: [ENVELOPE] }, { disclosure }), status: 'declined' }) };
}
export function conditionFromHttp(status) {
  if (status === 401 || status === 403) return 'auth-failure';
  if (status === 429) return 'quota-pressure';
  if (status >= 500 && status <= 599) return 'temporary-outage';
  return 'unknown'; // Includes generic 404, 400, and 200; none prove demand.
}
