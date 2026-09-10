#!/usr/bin/env node
/**
 * Buyer-replay / economics worksheets for S109 (offline, $0).
 * Surfaces: agensi | grexal | dealwork
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const surface = process.argv[2];
const outArg = process.argv.indexOf('--out');
const outPath = outArg >= 0 ? process.argv[outArg + 1] : null;

function fee(charge) {
  const platformFee = Math.min(Math.max(charge * 0.2, 0.02), charge * 0.3);
  return {
    buyerChargeUsd: charge,
    platformFeeUsd: Number(platformFee.toFixed(4)),
    sellerEarningsUsd: Number((charge - platformFee).toFixed(4)),
    effectiveFeePercent: Number(((platformFee / charge) * 100).toFixed(2)),
  };
}

const commonAttribution = {
  upstreamRecipes: 'epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666',
  merchantEvidence: 'epistemedeus/x402-url-extractor@3516cd40ba275c9f228443158097137cac44d003',
  rule: 'Do not resell free public skill text as proprietary; sell packaging/acceptance/delivery support only.',
};

const worksheets = {
  agensi: {
    surface: 'agensi',
    cashBoundaryUsd: 0,
    newFact:
      'Anonymous buyers cannot verify Agensi sell-page payout rails; buyer-replay is limited to offline descriptor checks until Root archives authenticated /sell copy.',
    buyerCanVerifyOffline: [
      'offer-descriptor.json schema via surfaces/agensi/package/bin/checklist.mjs',
      'skillRecipePin points at public gateway recipes',
      'paidDeliverable vs freeAlternative delta is explicit',
    ],
    buyerCannotVerifyYet: [
      'Stripe eligibility',
      'Solana USDC eligibility',
      'Live listing contents behind Cloudflare Access',
    ],
    freeAlternative: 'Direct use of public x402-data-gateway-skills recipes + DIY acceptance notes',
    paidDelta: 'Packaging, acceptance checklist, and delivery support against marketplace criteria',
    attributionPlan: commonAttribution,
    nextMeasurableEvent: 'Root CF Access + archived sell-page payout text enabling a truthful public listing draft',
  },
  grexal: {
    surface: 'grexal',
    cashBoundaryUsd: 0,
    newFact:
      'Buyer can validate I/O schema from grexal.json offline without paying; marketplace fee is independent of upstream recipe licenses.',
    feeWorksheet: {
      source: 'https://docs.grexal.ai/docs/payments',
      formula: 'platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)',
      run018: fee(0.18),
      micro005: fee(0.05),
    },
    buyerReplayWithoutPaying: [
      'Read grexal.json input_schema/output_schema (manifest_version 3, typed fields)',
      'Run local entrypoint agent/pack_evidence.js on a git range or supplied unifiedDiff',
      'Do not call grexal publish/auth from this worker',
    ],
    freeAlternative: 'git diff + manual acceptance JSON',
    paidDelta: 'Hosted per-run packaging agent with Grexal billing (if Root later publishes)',
    attributionPlan: {
      ...commonAttribution,
      grexalRuntimeFee: '20% normal marketplace fee accrues to Grexal; upstream recipes remain separately licensed',
    },
    nextMeasurableEvent: 'Root creates Grexal agent identity + sets pricing/visibility without this worker spending',
  },
  dealwork: {
    surface: 'dealwork',
    cashBoundaryUsd: 0,
    newFact:
      'Public GET /api/v1/jobs enables buyer-side job discovery without auth; bid/deliver/approve remain auth-gated per OpenAPI.',
    acceptanceArtifacts: [
      'Pinned commit range + unified diff',
      'acceptance.json with pass/fail checklist',
      'Command transcript hashes (no secrets)',
    ],
    escrowApproveFromOpenApi:
      'OpenAPI documents authenticated delivery/approval paths; this worksheet does not invoke them. Buyer acceptance is provider-controlled escrow — not certifiable by a wrapper.',
    freeAlternative: 'DIY git+curl against public jobs list + local evidence pack',
    paidDelta: 'Agent labor to produce acceptance-ready evidence packs matched to a specific job brief',
    attributionPlan: commonAttribution,
    sampleJobsSource: 'fixtures/dealwork-jobs-sample.json',
    nextMeasurableEvent: 'Root claims existing Dealwork owner identity (do not recreate) and optionally posts a bid from Root-controlled session',
  },
};

if (!worksheets[surface]) {
  console.error(JSON.stringify({ ok: false, error: 'usage: buyer-worksheet.mjs agensi|grexal|dealwork [--out path]' }));
  process.exit(1);
}

const result = { ok: true, ...worksheets[surface] };
const text = `${JSON.stringify(result, null, 2)}\n`;
if (outPath) fs.writeFileSync(outPath, text);
else process.stdout.write(text);

// grexal: cross-check fee bin
if (surface === 'grexal') {
  const feeBin = path.join(ROOT, 'surfaces/grexal/package/bin/fee-worksheet.mjs');
  const r = spawnSync(process.execPath, [feeBin, '0.18'], { encoding: 'utf8' });
  if (r.status !== 0) process.exit(r.status);
}
