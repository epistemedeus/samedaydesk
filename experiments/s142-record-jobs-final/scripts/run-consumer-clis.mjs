#!/usr/bin/env node
/**
 * Drive the four EXPORTED S134 CLIs with independent S142 consumer fixtures.
 * Does not import s134 test helpers. Cash $0. Offline only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const S134 = path.resolve(ROOT, '../s134-record-jobs');
const FIX = path.join(ROOT, 'consumer-fixtures');
const OUT = path.join(ROOT, 'consumer-out');

fs.mkdirSync(OUT, { recursive: true });

const bins = {
  openapi: path.join(S134, 'modules/openapi-impact/cli.mjs'),
  pricing: path.join(S134, 'modules/pricing-table-change/cli.mjs'),
  csv: path.join(S134, 'modules/csv-drift/cli.mjs'),
  rss: path.join(S134, 'modules/rss-atom-brief/cli.mjs'),
};

function run(name, args) {
  const r = spawnSync(process.execPath, [bins[name], ...args], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  fs.writeFileSync(path.join(OUT, `${name}.json`), r.stdout || '');
  if (r.stderr) fs.writeFileSync(path.join(OUT, `${name}.stderr.txt`), r.stderr);
  if (![0, 2].includes(r.status)) {
    throw new Error(`${name} exited ${r.status}: ${r.stderr}`);
  }
  const parsed = JSON.parse(r.stdout);
  fs.writeFileSync(
    path.join(OUT, `${name}.summary.json`),
    `${JSON.stringify(summarize(name, parsed), null, 2)}\n`,
  );
  return parsed;
}

function summarize(name, parsed) {
  const report = parsed.report;
  if (name === 'openapi') {
    return {
      tool: parsed.tool,
      ok: report.ok,
      unchangedCount: report.impact?.unchanged?.length ?? 0,
      changedKeys: (report.impact?.changed || []).map((c) => c.key),
      changedFields: (report.impact?.changed || []).flatMap((c) =>
        (c.fieldChanges || []).map((f) => f.field),
      ),
      paidValueClaim: parsed.paidValueClaim,
    };
  }
  if (name === 'pricing') {
    return {
      tool: parsed.tool,
      ok: report.ok,
      fieldChangeCount: (report.fieldChanges || []).length,
      unitChangeCount: (report.unitChanges || []).length,
      conflictingReasons: (report.conflicting || []).map((c) => c.reason),
      uncertaintyCodes: (report.uncertainties || []).map((u) => u.code),
      paidValueClaim: parsed.paidValueClaim,
    };
  }
  if (name === 'csv') {
    return {
      tool: parsed.tool,
      ok: report.ok,
      rowDriftMode: report.rowDrift?.mode,
      uncertaintyCodes: (report.uncertainties || []).map((u) => u.code),
      paidValueClaim: parsed.paidValueClaim,
    };
  }
  return {
    tool: parsed.tool,
    ok: report.ok,
    correctedKeys: (report.corrected || []).map((c) => c.key),
    uncertaintyCodes: (report.uncertainties || []).map((u) => u.code),
    paidValueClaim: parsed.paidValueClaim,
  };
}

const openapi = run('openapi', [
  '--before',
  path.join(FIX, 'openapi/before.json'),
  '--after',
  path.join(FIX, 'openapi/after.json'),
  '--used',
  path.join(FIX, 'openapi/used.json'),
]);
const pricing = run('pricing', [
  '--before',
  path.join(FIX, 'pricing/before.json'),
  '--after',
  path.join(FIX, 'pricing/after.json'),
]);
const csv = run('csv', [
  '--before',
  path.join(FIX, 'csv/before.csv'),
  '--after',
  path.join(FIX, 'csv/after.csv'),
  '--key',
  'sku',
]);
const rss = run('rss', [
  '--before',
  path.join(FIX, 'rss/before.xml'),
  '--after',
  path.join(FIX, 'rss/after.xml'),
]);

const openapiFields = (openapi.report.impact.changed || []).flatMap((c) =>
  (c.fieldChanges || []).map((f) => f.field),
);
const pricingReasons = (pricing.report.conflicting || []).map((c) => c.reason);
const rssCodes = (rss.report.uncertainties || []).map((u) => u.code);

const gate = {
  at: new Date().toISOString(),
  owningRepo: 'epistemedeus/samedaydesk',
  s134Path: S134,
  cashUsd: 0,
  gates: {
    openapiNoFalseUnchanged:
      (openapi.report.impact.unchanged || []).length === 0 &&
      openapiFields.includes('security') &&
      openapiFields.includes('responses'),
    pricingNoCrossUnitOrMissingAsFieldChange:
      (pricing.report.fieldChanges || []).length === 0 &&
      pricingReasons.includes('missing-cell') &&
      pricingReasons.includes('cross-unit-incomparable'),
    csvNoSilentDuplicateOverwrite: csv.report.rowDrift?.mode === 'duplicate-keys-blocked',
    rssExposesMissingIdAndDateAmbiguity:
      rssCodes.includes('missing-item-id') && rssCodes.includes('date-ambiguity'),
  },
};

gate.ok = Object.values(gate.gates).every(Boolean);
fs.writeFileSync(path.join(OUT, 'gate.json'), `${JSON.stringify(gate, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
process.exit(gate.ok ? 0 : 1);
