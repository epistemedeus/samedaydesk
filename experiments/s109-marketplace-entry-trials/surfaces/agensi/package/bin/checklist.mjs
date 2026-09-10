#!/usr/bin/env node
/**
 * Offline Agensi listing checklist validator.
 * Does not hit Cloudflare Access, list skills, or spend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '..');
const descriptorPath =
  process.argv[2] || path.join(PKG, 'offer-descriptor.json');

const REQUIRED = [
  'surface',
  'cashBoundaryUsd',
  'skillRecipePin',
  'paidDeliverable',
  'freeAlternative',
  'rootHandoff',
  'willNotListFromWorker',
];

function fail(msg) {
  console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(descriptorPath, 'utf8');
} catch (e) {
  fail(`cannot read ${descriptorPath}: ${e.message}`);
}

let d;
try {
  d = JSON.parse(raw);
} catch (e) {
  fail(`invalid JSON: ${e.message}`);
}

for (const k of REQUIRED) {
  if (d[k] === undefined || d[k] === null || d[k] === '') {
    fail(`missing required key: ${k}`);
  }
}

if (d.surface !== 'agensi') fail('surface must be agensi');
if (d.cashBoundaryUsd !== 0) fail('cashBoundaryUsd must be 0');
if (d.willNotListFromWorker !== true) fail('willNotListFromWorker must be true');
if (!String(d.skillRecipePin).includes('82d0f019713c7223898806144da08fdbeed5c666')) {
  fail('skillRecipePin must reference gateway skills pin 82d0f019713c7223898806144da08fdbeed5c666');
}
if (!d.rootHandoff?.cloudflareAccessUrl) {
  fail('rootHandoff.cloudflareAccessUrl required');
}
if (!Array.isArray(d.rootHandoff?.steps) || d.rootHandoff.steps.length < 3) {
  fail('rootHandoff.steps needs ≥3 concrete UI steps');
}
if (!d.payoutClaimsVerified || d.payoutClaimsVerified.status !== 'blocked-by-access') {
  fail('payoutClaimsVerified.status must be blocked-by-access until Root authenticates');
}

const out = {
  ok: true,
  cashBoundaryUsd: 0,
  descriptorPath: path.relative(process.cwd(), descriptorPath) || descriptorPath,
  surface: d.surface,
  publicListingSupported: false,
  publicListingNote:
    'Anonymous worker cannot read /sell; Root must complete Cloudflare Access (GitHub) then paste verified Stripe/SolanaUSDC text before any listing copy goes public.',
  nextMeasurableEvent: d.nextMeasurableEvent || 'Root CF Access session + paste of sell-page payout section',
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
