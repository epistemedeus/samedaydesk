import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDesk, prepareRequest } from '../../job-request-desk/lib/desk.mjs';
import { digest, fault, readDocument, createDocument, putImmutable } from '../../job-request-desk/lib/durable.mjs';
import { CURRENT_CORE_BASE } from '../../job-request-desk/lib/current.mjs';
import { fixturePrice, livePriceMutation } from './prices.mjs';
import { buildBatchTerms, termsVersionForBatch } from './terms.mjs';
import { BatchRefuse, parseBatchRequest } from './request.mjs';

const honesty = { sold: false, anySold: false, purchaseAuthority: false, usefulPaidWork: false, jobRevenueUsdc: null, liveSettlement: 'out-of-scope', liveCatalogWritten: false, retryAllowed: false };
function rootFor(options = {}) { return resolve(options.storeDir || options.outDir || join(options.baseDir || process.cwd(), '.paid-batch-store')); }
const manifestPath = (root, id) => join(root, 'batches', `${digest(id)}.json`);
function rejection(err, batchId = null) { return { schema: 'samedaydesk.paid-batch-ledger.v2', ...honesty, ok: false, status: 'rejected', batchId, code: err.code || 'internal-error', error: err.message, items: [], charges: [] }; }
function summarize(manifest, desk, root) {
  const items = manifest.planned.map(plan => {
    const blocked = readDocument(join(root, 'refusals', `${plan.requestId}.json`));
    const ticket = blocked || desk.getRequest(plan.requestId);
    const missing = !blocked && ticket.code === 'unknown-request';
    const outcome = missing ? 'not-attempted' : ticket.executionOk && ticket.ok ? 'completed' : ticket.status === 'unknown' || !ticket.status ? 'unknown' : 'rejected';
    const buyerClass = ticket.terms?.buyerClass || plan.buyerClass || null;
    return { ...honesty, id: plan.id, chargeId: `${manifest.batchId}:${plan.id}`, engineId: plan.engineId, requestId: plan.requestId, inputDigest: plan.inputDigest,
      executionId: ticket.executionId || null, attempt: ticket.executionId ? { executionId: ticket.executionId, startedAt: ticket.startedAt } : null,
      outcome, code: missing ? 'batch-item-not-attempted' : ticket.code || null, fundingState: ticket.fundingState || plan.fundingIntent,
      settlement: ticket.settlement || plan.settlement, buyerClass,
      outputs: outcome === 'completed' ? ticket.outputs : [], resultDigest: ticket.resultDigest || (missing ? null : digest(ticket)),
      sample: ticket.sample === true, analysisOutcome: ticket.analysisOutcome || null, outcomeKind: ticket.outcomeKind || null,
      price: fixturePrice(plan.engineId, `${manifest.batchId}:${plan.id}`), runner: 'paid-useful-jobs', runnerPin: CURRENT_CORE_BASE,
      ticket: missing ? null : ticket };
  });
  const counts = { items: items.length, completed: 0, rejected: 0, unknown: 0, notAttempted: 0 };
  for (const item of items) counts[item.outcome === 'not-attempted' ? 'notAttempted' : item.outcome]++;
  const complete = counts.completed === counts.items;
  const status = complete ? 'completed' : counts.completed ? 'partial' : counts.unknown || counts.notAttempted ? 'unknown' : 'rejected';
  return { schema: 'samedaydesk.paid-batch-ledger.v2', ...honesty, batchId: manifest.batchId, batchHash: manifest.batchHash, terms: manifest.terms,
    termsVersion: manifest.termsVersion, charges: manifest.terms.charges, runner: 'paid-useful-jobs', runnerPin: CURRENT_CORE_BASE, persistKind: 'durable-file',
    status, ok: complete, complete, counts, items };
}
export function readBatch(batchId, options = {}) {
  const root = rootFor(options);
  const manifest = readDocument(manifestPath(root, batchId));
  if (!manifest) return null;
  if (manifest.batchId !== batchId || digest(manifest.terms) !== manifest.batchHash) throw fault('corrupt-batch-manifest');
  return summarize(manifest, openDesk(join(root, 'desk'), options.deskOptions), root);
}
export async function runBatch(raw, options = {}) {
  let batchId = options.batchId || raw?.batchId || null;
  try {
    const request = parseBatchRequest(raw, { baseDir: options.baseDir || process.cwd() });
    if (request.items.length > 128) throw fault('batch-too-large');
    if (request.publishToLiveCatalog) throw fault('live-price-mutation-refused');
    if (options.f08Root || process.env.F08_PIN_ROOT || options.offerAdapter) throw fault('runner-override-refused', 'Use the current repository core through the request desk');
    const plans = request.items.map(item => {
      const deskRequest = { engineId: item.engineId, inputs: item.files, example: item.example, fundingIntent: item.fundingIntent || item.funding,
        payment: item.payment, settle: item.settle, liveSettle: item.liveSettle, sold: item.sold,
        buyerClass: item.raw.buyerClass || raw.buyerClass || 'owner-qa', statedSettlement: item.raw.statedSettlement ?? raw.statedSettlement };
      const snapshot = prepareRequest(deskRequest);
      if (snapshot.frozen) deskRequest.fileBytes = snapshot.frozen.fileBytes;
      const preflightError = livePriceMutation(item, item);
      return { item, deskRequest, snapshot, preflightError };
    });
    batchId ||= `batch-${digest(plans.map(p => ({ id: p.item.id, requestId: p.snapshot.requestId })))}`;
    if (typeof batchId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(batchId)) throw fault('invalid-batch-id');
    const planned = plans.map(plan => {
      plan.deskRequest.orderId = `batch:${batchId}:item:${plan.item.id}`;
      plan.snapshot = prepareRequest(plan.deskRequest);
      if (plan.snapshot.frozen) plan.deskRequest.fileBytes = plan.snapshot.frozen.fileBytes;
      return { id: plan.item.id, engineId: plan.item.engineId, requestId: plan.snapshot.requestId,
        inputDigest: digest(plan.snapshot.entries), requestDigest: digest(plan.item.raw), fundingIntent: plan.snapshot.terms.fundingIntent,
        settlement: plan.snapshot.settlement, buyerClass: plan.snapshot.terms.buyerClass };
    });
    const terms = { ...buildBatchTerms({ items: request.items }), batchId, requests: planned };
    const batchHash = digest(terms);
    const termsVersion = termsVersionForBatch(terms);
    if (raw.termsVersion && raw.termsVersion !== termsVersion) throw fault('batch-terms-mismatch');
    const root = rootFor(options);
    mkdirSync(root, { recursive: true });
    const manifest = { batchId, batchHash, terms, termsVersion, planned };
    const path = manifestPath(root, batchId);
    if (!createDocument(path, manifest)) {
      const previous = readDocument(path);
      if (previous.batchHash !== batchHash) throw fault('batch-id-conflict');
      // Replay reconciles only. Interrupted dispatch cannot resume unknown work.
      const ledger = { ...readBatch(batchId, options), replay: true };
      if (options.persist) await options.persist(ledger);
      return ledger;
    }
    const desk = openDesk(join(root, 'desk'), options.deskOptions);
    for (const plan of plans) {
      if (plan.preflightError) {
        putImmutable(join(root, 'refusals', `${plan.snapshot.requestId}.json`), { ...honesty, ok: false, status: 'rejected', executionOk: false,
          requestId: plan.snapshot.requestId, code: plan.preflightError.code, settlement: plan.snapshot.settlement, fundingState: 'rejected',
          buyerClass: plan.snapshot.terms.buyerClass, terms: { buyerClass: plan.snapshot.terms.buyerClass } });
      } else {
        desk.createRequest(plan.deskRequest);
      }
    }
    const ledger = summarize(manifest, desk, root);
    if (options.persist) await options.persist(ledger);
    return ledger;
  } catch (err) { return rejection(err, batchId); }
}
export { parseBatchRequest, BatchRefuse };
