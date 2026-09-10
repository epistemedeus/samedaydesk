#!/usr/bin/env node
/**
 * Offline Grexal fee / price-estimate worksheet from published docs formula.
 * platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)
 * Primary: https://docs.grexal.ai/docs/payments
 *
 * This agent has zero upstream LLM cost, so a backsolve is
 * buyer_charge = target_net / 0.80  (then round).
 *
 * Does not call grexal agent price estimate (auth + first push required).
 */
const SOURCE = 'https://docs.grexal.ai/docs/payments';
const FORMULA = 'platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)';

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

export function usdFromMicros(micros) {
  if (!Number.isInteger(micros) || micros < 0) throw new Error(`invalid micros: ${micros}`);
  return micros / 1_000_000;
}

export function worksheetRow(charge) {
  if (!Number.isFinite(charge) || charge < 0) {
    throw new Error(`invalid buyer_charge: ${charge}`);
  }
  const twenty = charge * 0.2;
  const cap = charge * 0.3;
  const floor = 0.02;
  const platformFee = charge === 0 ? 0 : clamp(twenty, floor, cap);
  const earnings = charge - platformFee;
  const effectivePct = charge === 0 ? null : (platformFee / charge) * 100;
  let binding = 'nominal-20pct';
  if (charge === 0) binding = 'zero';
  else if (cap < floor) binding = 'cap-30pct';
  else if (twenty < floor) binding = 'floor-0.02';
  else if (twenty > cap) binding = 'cap-30pct';
  else binding = 'nominal-20pct';

  return {
    buyerChargeUsd: charge,
    twentyPercentUsd: Number(twenty.toFixed(4)),
    floorUsd: floor,
    capUsd: Number(cap.toFixed(4)),
    platformFeeUsd: Number(platformFee.toFixed(4)),
    sellerEarningsUsd: Number(earnings.toFixed(4)),
    effectiveFeePercent: effectivePct === null ? null : Number(effectivePct.toFixed(2)),
    binding,
  };
}

const DOCS_TABLE = [5, 1, 0.2, 0.1, 0.05, 0.02];
const FLOOR_BAND_EXAMPLE = 0.08;
const THIS_AGENT_ZERO_LLM_BACKSOLVE = {
  note: 'This evidence packager makes no paid model calls, so the docs $0.18 example (net $0.10 + Claude $0.04) does not apply. Backsolve is buyer_charge = target_net / 0.80.',
  targetNetUsd: 0.08,
  upstreamLlmUsd: 0,
  rawChargeUsd: 0.1,
  suggestedLineItem: {
    unit: 'run_completed',
    amountUsd: 0.1,
    notInManifest: true,
    setVia: 'npx grexal agent price add run_completed 0.10  # after first push; Root only; not run here',
  },
};

function buildTable(charges) {
  return charges.map(worksheetRow);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(`Usage: fee-worksheet.mjs [buyer_charge_usd]
       fee-worksheet.mjs --table
       fee-worksheet.mjs 0.10 0.18 0.05

Offline docs.grexal.ai/docs/payments clamp. No auth, no spend.
`);
    process.exit(0);
  }

  let tableMode = argv[0] === '--table' || argv.length === 0;
  let charges;
  if (argv[0] === '--micros') {
    tableMode = false;
    charges = argv.slice(1).map((x) => usdFromMicros(Number(x)));
  } else if (tableMode) {
    charges = [...DOCS_TABLE, FLOOR_BAND_EXAMPLE, 0.18];
  } else {
    charges = argv.map(Number);
  }

  for (const c of charges) {
    if (!Number.isFinite(c) || c < 0) {
      console.error(JSON.stringify({ ok: false, error: 'usage: fee-worksheet.mjs <buyer_charge_usd> | --table' }));
      process.exit(1);
    }
  }

  const rows = buildTable(charges);
  const out = {
    ok: true,
    cashBoundaryUsd: 0,
    source: `${SOURCE} (captured 2026-09-10)`,
    formula: FORMULA,
    sellerKeepNominal: 0.8,
    notes: [
      'Normal case ~20% for charges ≥ $0.10.',
      'Micro-run floor $0.02 binds when 20% < $0.02 and 30% of charge still ≥ $0.02 (~$0.0667 ≤ charge < $0.10).',
      'Below ~$0.0667 the 30% cap binds (docs $0.05 and $0.02 rows).',
      'Sandbox compute/build/deploy/storage/listing are covered by the fee; third-party LLM/API spend is not.',
      'This agent has paidModelCalls=0, so do not copy the docs $0.18 Claude backsolve as the list price.',
      'Pricing line items are NOT in grexal.json. grexal agent price add requires login + first push — not run here.',
      'Demand volume unknown — experiment, not a blocker for a dry scaffold.',
    ],
    docsWorkedTable: buildTable(DOCS_TABLE),
    rows,
    thisAgentBacksolve: THIS_AGENT_ZERO_LLM_BACKSOLVE,
    willNotPublishFromWorker: true,
    willNotCallPriceEstimateCli: true,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

const isMain = process.argv[1] && process.argv[1].endsWith('fee-worksheet.mjs');
if (isMain) main();
