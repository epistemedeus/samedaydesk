import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TICKET_SCHEMA } from './pins.mjs';
import { getJob } from './catalog.mjs';
import { createJsonStore } from './store.mjs';
import { digest, fault, putImmutable } from './durable.mjs';
import { assertTermsVersionNotInteger } from './terms.mjs';
import {
  CURRENT_CORE_BASE, EXECUTION_CONTRACT_VERSION, enginePinForJob, freezeConsumerRequest,
  runCurrent, validateExecution, verifyStoredTicket,
} from './current.mjs';

const honesty = { sold: false, purchaseAuthority: false, usefulPaidWork: false, independentDemand: false, jobRevenueUsdc: null, retryAllowed: false };
const reject = (err, extra = {}) => ({ ...extra, ...honesty, ok: false, refused: true, code: err.code || 'internal-error', error: err.message, executionOk: false });
function settlementFor(request) {
  const stated = request.statedSettlement ?? request.settlement ?? { state: 'not-attempted' };
  const unknown = !stated || !['not-attempted', 'simulated'].includes(stated.state);
  return { stated, state: unknown ? 'unknown' : stated.state, amountUsdc: null, evidenceClass: 'caller-statement', verifiedSettlement: false };
}
function pinFor(engineId) {
  try { return enginePinForJob(getJob(engineId)); } catch { return enginePinForJob(engineId); }
}
export function prepareRequest(request = {}) {
  const engineId = request.engineId || request.jobId;
  let frozen = null, entries = [], preparationError = null;
  try { ({ frozen, entries } = freezeConsumerRequest(request)); } catch (err) { preparationError = { code: err.code || 'invalid-input', message: err.message }; }
  const settlement = settlementFor(request);
  const enginePin = pinFor(engineId);
  const terms = { schema: 'samedaydesk.job-request-desk.terms.v2', engineId, orderId: request.orderId || null, example: request.example === true || request.example === 'true',
    inputs: entries.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
    invalidInputs: preparationError ? request.inputs || request.files || {} : null,
    fundingIntent: request.fundingIntent || request.funding || 'unfunded', payment: request.payment || null,
    buyerClass: request.buyerClass || 'owner-qa', statedSettlement: settlement.stated,
    live: { sold: request.sold === true, settle: request.settle === true, liveSettle: request.liveSettle === true },
    coreBase: CURRENT_CORE_BASE, contract: EXECUTION_CONTRACT_VERSION, enginePin };
  const requestId = digest(terms);
  return { requestId, bindingDigest: requestId, termsVersion: `sha256:${requestId}`, terms, frozen, entries, preparationError, settlement, enginePin };
}
export function createDesk({ store, execute = runCurrent, executionOrigin, clock } = {}) {
  if (!store) throw fault('missing-store');
  const now = () => typeof clock === 'function' ? clock() : clock || new Date().toISOString();
  function view(ticket, replay = false) {
    if (!ticket) return reject(fault('unknown-request'));
    try { verifyStoredTicket(ticket); }
    catch (err) { return reject(err, { ...ticket, status: 'unknown', outcomeKind: 'output-integrity-failure', settlement: { ...ticket.settlement, state: 'unknown', amountUsdc: null }, outputs: [], replay }); }
    return { ...ticket, ...honesty, ok: ticket.status === 'queued' || ticket.executionOk === true, refused: ticket.status !== 'queued' && ticket.executionOk !== true, replay };
  }
  function createRequest(request = {}) {
    let ticket;
    let dispatched = false;
    try {
      // Pre-admission refusals (no durable row): integer termsVersion, engine-pin mismatch, same-order swap.
      const prepared = prepareRequest(request);
      const engineId = request.engineId || request.jobId;
      assertTermsVersionNotInteger(request.termsVersion);
      if (request.termsVersion && request.termsVersion !== prepared.termsVersion) throw fault('digest-mismatch');
      const expectedPin = prepared.enginePin;
      if (request.enginePin && ['version', 'sha256', 'bytes'].some(k => request.enginePin[k] != null && request.enginePin[k] !== expectedPin[k])) throw fault('engine-pin-mismatch');
      const orderId = request.orderId || prepared.requestId;
      const old = store.findByOrderId(orderId);
      if (old && old.requestId !== prepared.requestId) throw fault('same-order-id-input-swap');
      const at = now();
      ticket = store.admit({ schema: TICKET_SCHEMA, schemaVersion: 2, requestId: prepared.requestId, bindingDigest: prepared.bindingDigest, orderId, engineId,
        terms: prepared.terms, termsVersion: prepared.termsVersion, enginePin: expectedPin, coreBase: CURRENT_CORE_BASE, contract: EXECUTION_CONTRACT_VERSION,
        inputs: prepared.entries, settlement: prepared.settlement, fundingState: prepared.terms.fundingIntent, outputs: [], resultUri: store.resultUri(prepared.requestId),
        status: 'queued', executionOk: false, statusHistory: [{ status: 'queued', at }], createdAt: at, updatedAt: at, ...honesty });
      const existing = store.read(ticket.requestId);
      if (existing.status !== 'queued') return view(existing, true);
      if (request.defer === true) return view(ticket);
      const claim = store.claim(ticket);
      if (!claim.created) return view(store.read(ticket.requestId), true);
      dispatched = true;
      ticket = { ...ticket, ...claim.attempt, status: 'running', statusHistory: [...ticket.statusHistory, { status: 'running', at: now() }] };
      let result;
      try {
        if (prepared.preparationError) throw fault(prepared.preparationError.code, prepared.preparationError.message);
        const job = getJob(engineId);
        if (prepared.terms.live.sold || prepared.terms.live.settle || prepared.terms.live.liveSettle) throw fault('live-settle-out-of-scope');
        if (prepared.settlement.state === 'unknown') throw fault('possible-spend-unknown');
        if (!['owner-qa', 'fixture-buyer', 'unknown'].includes(prepared.terms.buyerClass)) throw fault('invalid-buyer-class');
        const outDir = store.resultDir(ticket.requestId);
        mkdirSync(outDir, { recursive: true });
        result = execute({ ...prepared.frozen, fundingIntent: prepared.terms.fundingIntent, payment: prepared.terms.payment, executionId: ticket.executionId, outDir }, { executionOrigin });
        if (result && typeof result.then === 'function') throw fault('async-executor-not-supported');
        putImmutable(join(outDir, 'execution-envelope.json'), result);
        const checked = validateExecution(result, { job, requestId: ticket.requestId, executionId: ticket.executionId, entries: prepared.entries, outDir, fundingIntent: prepared.terms.fundingIntent, example: prepared.terms.example });
        ticket = { ...ticket, executionOk: checked.complete, outputs: checked.outputs, outcomeKind: checked.outcomeKind, analysisOutcome: checked.analysisOutcome || result.analysis?.status,
          sample: result.sample === true, fundingState: result.fundingState, execution: result, resultDigest: digest(result), code: checked.code || null,
          status: checked.complete ? result.sample ? 'sample' : 'completed' : 'rejected', settlement: { ...ticket.settlement, evidenceClass: 'simulated-core-and-caller-statement' } };
      } catch (err) {
        // After claim, a thrown executor or bad receipt cannot look like not-attempted.
        const unknown = dispatched && (result != null || ['execution-unknown', 'possible-spend-unknown', 'async-executor-not-supported'].includes(err.code) || result && typeof result.then === 'function');
        ticket = { ...ticket, ...reject(err), status: unknown ? 'unknown' : 'rejected', outcomeKind: unknown ? 'execution-unknown' : 'admission-refused', settlement: { ...ticket.settlement, state: unknown ? 'unknown' : ticket.settlement.state, amountUsdc: null } };
      }
      ticket.updatedAt = now();
      ticket.statusHistory.push({ status: ticket.status, at: ticket.updatedAt });
      store.finish(ticket);
      return view(ticket);
    } catch (err) {
      if (dispatched || ticket?.executionId) {
        return reject(err, { requestId: ticket?.requestId, executionId: ticket?.executionId, status: 'unknown', settlement: { state: 'unknown', amountUsdc: null } });
      }
      return reject(err, ticket ? { requestId: ticket.requestId } : {});
    }
  }
  return { store, createRequest, getRequest(id) { try { return view(store.read(id)); } catch (err) { return reject(err); } },
    listRequests({ engineId } = {}) { try { const requests = store.list().filter(t => !engineId || t.engineId === engineId).map(t => view(t)); return { ok: true, ...honesty, count: requests.length, requests }; } catch (err) { return reject(err); } } };
}
export function openDesk(dir, options = {}) { return createDesk({ store: createJsonStore(dir), ...options }); }
