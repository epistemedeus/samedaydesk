import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_LEDGER } from './pins.mjs';
import { digest, readDocument, createDocument, putImmutable, fault } from '../../job-request-desk/lib/durable.mjs';
export function emptyLedger() { return { schema: SCHEMA_LEDGER, independentDemand: false, organicDemand: false, jobRevenueUsdc: null, citedBankedUsdcIsNotJobRevenue: true, usefulPaidWork: false, rows: [] }; }
export function loadLedger(filePath) {
  if (!filePath) return emptyLedger();
  const legacy = readDocument(filePath) || emptyLedger();
  if (!Array.isArray(legacy.rows)) throw fault('invalid-ledger');
  let names = [];
  try { names = readdirSync(`${filePath}.rows`).filter(n => /^[a-f0-9]{64}\.json$/.test(n)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  const byId = new Map();
  for (const row of [...legacy.rows, ...names.map(n => readDocument(join(`${filePath}.rows`, n)))]) {
    if (!row?.runId) throw fault('invalid-value-row');
    const previous = byId.get(row.runId);
    if (previous && digest(previous) !== digest(row)) throw fault('value-event-conflict');
    byId.set(row.runId, row);
  }
  return { ...emptyLedger(), rows: [...byId.values()].sort((a, b) => a.runId.localeCompare(b.runId)) };
}
export function saveLedger(filePath, ledger) {
  createDocument(filePath, emptyLedger());
  for (const row of ledger.rows) appendRow(filePath, row);
  return loadLedger(filePath);
}
export function appendRow(filePath, row) {
  if (row.usefulPaidWork !== false || row.jobRevenueUsdc !== null || row.independentDemand !== false || row.organicDemand !== false) throw fault('value-is-not-revenue');
  createDocument(filePath, emptyLedger());
  putImmutable(join(`${filePath}.rows`, `${digest(row.runId)}.json`), row);
  return loadLedger(filePath);
}
