import { artifact, bounded, digest, exact, id, oneOf, ParticipationError, requireValue, schema } from './safe.mjs';
/** Narrow receiving seam; VF09 supplies its actual transactional host and transport.
 * The injected host methods must bind auth/terms/revisions/idempotency atomically.
 * No resolver, store, lease, grants, verifier, publication or payment logic here.
 */
export function vf04Port(host) {
  requireValue(['create', 'claim', 'checkpoint', 'submit', 'read'].every(k => typeof host[k] === 'function'));
  function validate(op, x) {
    const fields = {
      create: ['proposalRef', 'resolverRef', 'reproducerRef', 'fundingKind'],
      claim: ['expectedRevision', 'ttlSeconds', 'voluntaryOptIn'],
      checkpoint: ['expectedRevision', 'fence', 'checkpointRef'],
      submit: ['expectedRevision', 'fence', 'contributionRef'],
    };
    requireValue(Object.hasOwn(fields, op)); exact(x, fields[op]);
    if (op === 'create') {
      ['proposalRef', 'resolverRef', 'reproducerRef'].forEach(k => artifact(x[k]));
      oneOf(x.fundingKind, ['voluntary', 'unfunded-request']);
    } else requireValue(Number.isInteger(x.expectedRevision) && x.expectedRevision >= 1);
    if (op === 'claim') requireValue(x.voluntaryOptIn === true && Number.isInteger(x.ttlSeconds) && x.ttlSeconds >= 1 && x.ttlSeconds <= 900);
    if (['checkpoint', 'submit'].includes(op)) {
      requireValue(Number.isInteger(x.fence) && x.fence >= 1); artifact(x[op === 'checkpoint' ? 'checkpointRef' : 'contributionRef']);
    }
  }
  const port = { validate, async read({ cellId }) {
    id(cellId); const result = bounded(await host.read({ cellId }));
    requireValue(result.cellId === cellId && Number.isInteger(result.revision) && result.revision >= 1, 'temporary-outage');
    return result;
  } };
  for (const op of ['create', 'claim', 'checkpoint', 'submit']) port[op] = async raw => {
    const x = bounded(raw); validate(op, x.body); digest(x.termsVersion);
    const result = bounded(await host[op](x));
    // Receiving contract must return exact request and operation binding.
    if (result.schema !== schema('participation-receipt') || result.requestId !== x.requestId || result.operation !== op
      || result.termsVersion !== x.termsVersion || !Number.isInteger(result.revision) || result.revision < 1
      || result.revision !== (x.body.expectedRevision ?? 0) + 1
      || typeof result.replayed !== 'boolean' || (x.cellId !== null && result.cellId !== x.cellId)) throw new ParticipationError('unknown-outcome');
    id(result.cellId); return result;
  };
  return Object.freeze(port);
}
