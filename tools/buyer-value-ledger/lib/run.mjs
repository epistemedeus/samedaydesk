import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDesk } from '../../job-request-desk/lib/desk.mjs';
import { digest, fault } from '../../job-request-desk/lib/durable.mjs';
import { inspectBuyerClass, refuse } from './labels.mjs';
import { appendRow } from './ledger.mjs';
import { SCHEMA_ROW } from './pins.mjs';
import { insertRow as postgresInsert } from './postgres.mjs';
import { readBatch } from '../../paid-batch-reconciler/lib/ledger.mjs';

function rowFor(ticket, buyerClass, batch = null) {
  const usefulDelivery = ticket.ok === true && ticket.executionOk === true && ticket.outputs?.length > 0;
  const outcomeKind = usefulDelivery ? ticket.outcomeKind === 'analysis-refused' ? 'analysis_refusal' : /unchanged|no.change|informational/.test(ticket.analysisOutcome || '') ? 'analysis_no_change' : 'analysis_success' : ticket.status === 'unknown' ? 'execution_unknown' : 'engine_failure';
  const outputs = usefulDelivery ? ticket.outputs : [];
  return {
    schema: SCHEMA_ROW, runId: `bvl_${digest({ requestId: ticket.requestId, executionId: ticket.executionId || null, buyerClass, batch })}`,
    requestId: ticket.requestId, requestHash: ticket.bindingDigest || ticket.requestId, executionId: ticket.executionId || null,
    resultDigest: ticket.resultDigest || null, jobId: ticket.engineId, batch, buyerClass,
    sample: ticket.sample === true, outcomeKind, status: ticket.status, code: ticket.code || null,
    outputs, outputBytes: outputs.reduce((sum, o) => sum + o.bytes, 0), outputsDigest: usefulDelivery ? digest(outputs.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }))) : null,
    durationMs: ticket.startedAt && ticket.updatedAt ? Math.max(0, Date.parse(ticket.updatedAt) - Date.parse(ticket.startedAt)) : null,
    startedAt: ticket.startedAt || null, endedAt: ticket.updatedAt || null, usableOutput: usefulDelivery, producedThisRun: usefulDelivery, usefulDelivery,
    usefulPaidWork: false, purchaseAuthority: false, independentDemand: false, organicDemand: false, jobRevenueUsdc: null, retryAllowed: false,
    paidWorkBlockers: ['owner-or-caller-qa', 'nonsettling-execution', 'no-independent-payment-evidence'],
    settlement: ticket.settlement || { state: 'unknown', amountUsdc: null },
    settlementJoin: { status: 'unbound', boundToThisJob: false, thisJobPayment: false, reason: 'Caller settlement statements are not verified settlement evidence' },
    fundingState: ticket.fundingState || 'unknown', engine: ticket.execution?.receipt?.engine || { verified: false },
    evidence: { callerInputs: 'caller-or-owner-qa', jobExecution: 'current-shared-core', externalAcceptance: false },
  };
}
export function measureRequest({ storeDir, requestId, buyerClass, ledgerPath, postgres, batch = null } = {}) {
  const labelled = inspectBuyerClass({ buyerClass });
  if (!labelled.ok) return labelled;
  const ticket = openDesk(storeDir).getRequest(requestId);
  if (!ticket.requestId) return refuse(ticket.code || 'unknown-request', ticket.error || 'Request unavailable');
  if (ticket.terms?.buyerClass !== buyerClass) return refuse('buyer-class-conflict', 'Value classification must match the admitted request');
  const row = rowFor(ticket, buyerClass, batch);
  if (ledgerPath) appendRow(ledgerPath, row);
  if (postgres) postgresInsert(postgres, row);
  return { ok: ticket.ok && ticket.executionOk, refused: row.outcomeKind === 'analysis_refusal', outcomeKind: row.outcomeKind,
    usefulPaidWork: false, usefulDelivery: row.usefulDelivery, row, ledgerPath: ledgerPath || null,
    honesty: { purchaseAuthority: false, independentDemand: false, jobRevenueUsdc: null } };
}
export function measureBatch({ batchId, storeDir, ledgerPath } = {}) {
  const batch = readBatch(batchId, { storeDir });
  if (!batch) throw fault('batch-not-found');
  const rows = batch.items.map(item => {
    if (!item.ticket?.terms) {
      const row = rowFor({ requestId: item.requestId, engineId: item.engineId, status: item.outcome, settlement: item.settlement, fundingState: item.fundingState }, 'owner-qa', { batchId, itemId: item.id });
      if (ledgerPath) appendRow(ledgerPath, row);
      return row;
    }
    return measureRequest({ storeDir: join(storeDir, 'desk'), requestId: item.requestId, buyerClass: item.ticket.terms.buyerClass, ledgerPath, batch: { batchId, itemId: item.id } }).row;
  });
  return { ok: batch.ok, complete: batch.complete, batchId, rows, usefulPaidWork: false, jobRevenueUsdc: null };
}
export async function runLabelledJob(request = {}, adapters = {}) {
  const labelled = inspectBuyerClass(request);
  if (!labelled.ok) return labelled;
  if (adapters.engine || adapters.paidOffer || adapters.settlements || adapters.settlementRecords || Object.keys(request.kitOptions || {}).length) {
    return refuse('runner-override-refused', 'Value measurement uses the current shared-core request desk and its stored receipt', { usefulPaidWork: false, usefulDelivery: false });
  }
  const storeDir = request.storeDir || (request.ledgerPath ? `${request.ledgerPath}.requests` : request.outDir ? join(request.outDir, '.requests') : mkdtempSync(join(tmpdir(), 'cw62-value-')));
  let ticket;
  try {
    const desk = openDesk(storeDir);
    ticket = request.requestId ? desk.getRequest(request.requestId) : desk.createRequest({ ...request, engineId: request.jobId, inputs: request.files, buyerClass: labelled.buyerClass });
    if (!ticket.requestId) return { ...ticket, usefulDelivery: false, usefulPaidWork: false };
    return measureRequest({ ...request, storeDir, requestId: ticket.requestId, buyerClass: labelled.buyerClass });
  } catch (err) { return refuse(err.code || 'value-record-failed', err.message, { usefulPaidWork: false, usefulDelivery: false }); }
}
