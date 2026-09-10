#!/usr/bin/env node
/**
 * Unpaid buyer replay: validate agent I/O schema from grexal.json and
 * run the local entrypoint. No Grexal login, credits, publish, or runs invoke.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packEvidence } from '../package/agent/pack_evidence.js';
import { validateManifest } from '../package/bin/validate-manifest.mjs';
import { worksheetRow } from '../package/bin/fee-worksheet.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '../package');
const MANIFEST_PATH = path.join(PKG, 'grexal.json');
const TYPED = ['text', 'file', 'number', 'boolean', 'json'];

const SAMPLE_DIFF =
  'diff --git a/replay.txt b/replay.txt\n--- a/replay.txt\n+++ b/replay.txt\n@@ -1 +1 @@\n-old\n+new\n';

function jsMatchesGrexal(value, grexalType) {
  switch (grexalType) {
    case 'text':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'json':
      return value !== null && typeof value === 'object';
    case 'file':
      return typeof value === 'string' || (value !== null && typeof value === 'object');
    default:
      return false;
  }
}

function checkSchemaShape(schema, pathPrefix) {
  const checks = [];
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    checks.push({ path: pathPrefix, pass: false, detail: 'schema must be a typed map' });
    return checks;
  }
  for (const [key, spec] of Object.entries(schema)) {
    const p = `${pathPrefix}.${key}`;
    const okType = spec && TYPED.includes(spec.type);
    checks.push({
      path: p,
      pass: okType,
      grexalType: spec?.type ?? null,
      required: spec?.required === true,
      detail: okType ? spec.type : `type must be one of ${TYPED.join('|')}`,
    });
  }
  return checks;
}

function checkValueAgainstSchema(obj, schema, pathPrefix) {
  const checks = [];
  for (const [key, spec] of Object.entries(schema)) {
    const p = `${pathPrefix}.${key}`;
    if (!(key in obj)) {
      checks.push({
        path: p,
        pass: spec.required !== true,
        grexalType: spec.type,
        present: false,
        detail: spec.required === true ? 'required field missing' : 'optional field absent',
      });
      continue;
    }
    const match = jsMatchesGrexal(obj[key], spec.type);
    checks.push({
      path: p,
      pass: match,
      grexalType: spec.type,
      present: true,
      jsType: obj[key] === null ? 'null' : Array.isArray(obj[key]) ? 'array' : typeof obj[key],
      detail: match ? 'type matches grexal.json' : `value does not match ${spec.type}`,
    });
  }
  const extra = Object.keys(obj).filter((k) => !(k in schema));
  for (const key of extra) {
    checks.push({
      path: `${pathPrefix}.${key}`,
      pass: false,
      present: true,
      detail: 'undeclared output key (not in grexal.json output_schema)',
    });
  }
  return checks;
}

export function replayBuyerIo() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const identityPath = path.join(PKG, '.grexal', 'agent.json');
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  const entrypointAbs = path.join(PKG, manifest.entrypoint);
  const manifestErrors = validateManifest(manifest, {
    entrypointExists: fs.existsSync(entrypointAbs),
  });

  const dashboardKeys = [
    'name',
    'description',
    'category',
    'tags',
    'homepage',
    'repository',
    'icon',
    'is_open_source',
    'pricing',
    'visibility',
  ];
  const dashboardAbsent = dashboardKeys.filter((k) => manifest[k] === undefined);

  const inputSchemaChecks = checkSchemaShape(manifest.input_schema, 'input_schema');
  const outputSchemaChecks = checkSchemaShape(manifest.output_schema, 'output_schema');

  const sampleInput = {
    unifiedDiff: SAMPLE_DIFF,
    baseRef: 'replay-base',
    headRef: 'replay-head',
    acceptanceNotes: 'G3 unpaid I/O replay',
  };
  const inputValueChecks = checkValueAgainstSchema(sampleInput, manifest.input_schema, 'input');
  // repoPath is optional and omitted on this path (buyer supplies unifiedDiff).
  const inputValuePass = inputValueChecks
    .filter((c) => c.present)
    .every((c) => c.pass);

  const output = packEvidence(sampleInput);
  const outputValueChecks = checkValueAgainstSchema(output, manifest.output_schema, 'output');

  const paidModelCallsZero = output.paidModelCalls === 0 && output.acceptanceReport?.paidModelCalls === 0;

  const schemaOk =
    manifestErrors.length === 0 &&
    inputSchemaChecks.every((c) => c.pass) &&
    outputSchemaChecks.every((c) => c.pass) &&
    inputValuePass &&
    outputValueChecks.every((c) => c.pass) &&
    paidModelCallsZero &&
    dashboardAbsent.length === dashboardKeys.length;

  return {
    ok: schemaOk,
    cashBoundaryUsd: 0,
    paid: false,
    grexalAuth: false,
    grexalRunsInvoke: false,
    grexalJson: path.relative(process.cwd(), MANIFEST_PATH),
    grexalJsonSha256: createHash('sha256').update(fs.readFileSync(MANIFEST_PATH)).digest('hex'),
    identityStub: identity,
    manifest_version: manifest.manifest_version,
    entrypoint: manifest.entrypoint,
    runtimeLanguage: manifest.runtime?.language ?? null,
    manifestErrors,
    pricingInManifest: manifest.pricing !== undefined,
    dashboardFieldsAbsent: dashboardAbsent,
    inputFields: Object.keys(manifest.input_schema),
    outputFields: Object.keys(manifest.output_schema),
    inputSchemaChecks,
    outputSchemaChecks,
    inputValueChecks,
    outputValueChecks,
    paidModelCalls: output.paidModelCalls,
    sampleOutputSummary: output.summary,
    sampleCommitRange: output.commitRange,
    sampleDiffBytes: output.diffBytes,
    how: [
      'Read grexal.json input_schema and output_schema (manifest_version 3 typed maps). Pricing is not in this file.',
      'Offline-validate the manifest (grexal@0.4.1 rules; no login).',
      'Run local entrypoint agent/pack_evidence.js on a supplied unifiedDiff (no git, no network).',
      'Type-check returned keys against output_schema (text|number|json).',
      'Confirm paidModelCalls=0.',
      'Do not call grexal login, push, publish, agent price, or runs invoke. Do not top up buyer credits.',
    ],
    doesNotProve: [
      'Hosted Grexal sandbox identity (requires Root push + publish).',
      'Listed buyer price (pricing is a dashboard/CLI line item, not grexal.json).',
      'Marketplace typical-price baseline (docs: 10+ organic completed runs).',
      'Settlement, earnings, or cash-out.',
    ],
    feeRowsForBuyer: {
      source: 'https://docs.grexal.ai/docs/payments',
      formula: 'platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)',
      run018: worksheetRow(0.18),
      micro005: worksheetRow(0.05),
      floorBand008: worksheetRow(0.08),
    },
  };
}

function main() {
  const result = replayBuyerIo();
  const outArg = process.argv.indexOf('--out');
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outArg >= 0 && process.argv[outArg + 1]) {
    const dest = path.resolve(process.argv[outArg + 1]);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
  }
  process.stdout.write(text);
  process.exit(result.ok ? 0 : 1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
