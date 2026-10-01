import { assertCorrespondenceOrigin } from '../../../correspondence/client.mjs';
import { isI01TermsVersion } from '../../../../packs/contributor-desk/src/terms-version.mjs';
import { bounded, digest, equalMac, exact, freeze, id, mac, oneOf, requireValue, schema, secretKey } from './safe.mjs';
import { MODES } from './core.mjs';
const operations = ['create', 'claim', 'checkpoint', 'submit'];
const outcomes = new Set(['auth-failure', 'forbidden', 'not-found', 'stale-revision', 'stale-terms', 'stale-grant', 'stale-fence', 'conflict', 'quota-pressure', 'payload-too-large', 'invalid-input', 'temporary-outage', 'unknown-outcome']);
export function safeOutcome(error, mutation = true) {
  // Do not propagate server descriptions, exception causes, request dumps or URLs.
  let code;
  try { code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined; } catch {}
  return outcomes.has(code) ? code : mutation ? 'unknown-outcome' : 'temporary-outage';
}
/** Stateless host client. Intent is an exact retry hint, never server authority. */
export class ParticipationSession {
  #key; #binding; #port; #terms;
  constructor({ identityKey, binding, port, currentTerms }) {
    this.#key = secretKey(identityKey);
    this.#binding = bounded(binding); exact(this.#binding, ['origin', 'tenantId', 'grantFingerprint']);
    this.#binding.origin = assertCorrespondenceOrigin(this.#binding.origin); id(this.#binding.tenantId); digest(this.#binding.grantFingerprint);
    requireValue(port && operations.every(op => typeof port[op] === 'function') && typeof port.read === 'function' && typeof port.validate === 'function');
    requireValue(typeof currentTerms === 'function'); this.#port = port; this.#terms = currentTerms;
  }
  prepare({ mode, operation, cellId = null, termsVersion, body, consent }) {
    requireValue(consent === true, 'explicit_consent_required'); oneOf(mode, MODES); oneOf(operation, operations);
    requireValue(isI01TermsVersion(termsVersion), 'invalid_terms');
    requireValue(operation === 'create' ? cellId === null : typeof cellId === 'string'); if (cellId !== null) id(cellId);
    requireValue(mode !== 'report-gap' || operation === 'create', 'mode_mismatch');
    requireValue(operation !== 'submit' || ['counterexample', 'adapt-artifact', 'maintain-cell'].includes(mode), 'mode_mismatch');
    const command = bounded(body);
    this.#port.validate(operation, command);
    const payload = { schema: schema('participation-intent'), binding: this.#binding, mode, operation, cellId, termsVersion, body: command };
    const requestId = `vf05_${mac(this.#key, 'mutation-v1', payload)}`;
    return freeze({ ...payload, requestId, seal: mac(this.#key, 'intent-v1', { ...payload, requestId }) });
  }
  #verify(raw) {
    const x = bounded(raw, { maxBytes: 32768 });
    exact(x, ['schema', 'binding', 'mode', 'operation', 'cellId', 'termsVersion', 'body', 'requestId', 'seal']);
    const { seal, ...payload } = x;
    requireValue(x.schema === schema('participation-intent') && equalMac(seal, mac(this.#key, 'intent-v1', payload)), 'intent_binding_mismatch');
    requireValue(mac(this.#key, 'binding-v1', x.binding) === mac(this.#key, 'binding-v1', this.#binding), 'intent_binding_mismatch');
    oneOf(x.operation, operations); this.#port.validate(x.operation, x.body); return x;
  }
  async execute(raw) { return this.#send(raw, false); }
  async reconcile(raw) { return this.#send(raw, true); }
  async #send(raw, reconciling) {
    const intent = this.#verify(raw);
    let terms;
    try { terms = await this.#terms({ cellId: intent.cellId, operation: intent.operation }); }
    catch (error) { return { status: safeOutcome(error, false), requestId: intent.requestId }; }
    if (terms !== intent.termsVersion) return { status: 'stale-terms', requestId: intent.requestId };
    try {
      const receipt = await this.#port[intent.operation]({ cellId: intent.cellId, requestId: intent.requestId, termsVersion: intent.termsVersion, body: intent.body });
      return { status: 'committed', requestId: intent.requestId, reconciling, receipt,
        nextStep: 'read-current-state', authority: 'server-receipt' };
    } catch (error) { return { status: safeOutcome(error), requestId: intent.requestId, nextStep: 'read-or-reconcile-exact-intent' }; }
  }
  async resume(raw) {
    // No mutation, even if a public hint contains a forged revision or cell id.
    const hint = bounded(raw, { maxBytes: 4096 }); exact(hint, ['schema', 'cellId']);
    requireValue(hint.schema === schema('participation-hint')); id(hint.cellId);
    try { return { status: 'read', current: await this.#port.read({ cellId: hint.cellId }) }; }
    catch (error) { return { status: safeOutcome(error, false) }; }
  }
}
export function continuationHint(cellId) { return freeze({ schema: schema('participation-hint'), cellId: id(cellId) }); }
