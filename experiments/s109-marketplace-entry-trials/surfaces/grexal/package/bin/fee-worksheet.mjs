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
 *
 * Exact units: 1 USD = 1_000_000 micros. Binding is decided on integer micros
 * (equivalent to the float clamp for every integer-micro charge):
 *   cap-30pct   when 30% of charge < $0.02  (micros <= 66666)
 *   floor-0.02  when 20% of charge < $0.02 and cap does not bind (66667..99999)
 *   nominal-20pct when charge >= $0.10 (micros >= 100000)
 */
const SOURCE = 'https://docs.grexal.ai/docs/payments';
const FORMULA = 'platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)';
const MICROS_PER_USD = 1_000_000;
const FLOOR_USD = 0.02;
const FLOOR_MICROS = 20_000;
const RATE = 0.2;
const CAP_RATE = 0.3;

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

/** Parse a non-negative safe integer, including argv decimal-digit strings. */
export function parseMicros(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
      throw new Error(`invalid micros: ${value}`);
    }
    return value;
  }
  if (typeof value === 'string') {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new Error(`invalid micros: ${value}`);
    }
    const n = Number(value);
    if (!Number.isSafeInteger(n)) {
      throw new Error(`invalid micros: ${value}`);
    }
    return n;
  }
  throw new Error(`invalid micros: ${value}`);
}

export function usdFromMicros(micros) {
  return parseMicros(micros) / MICROS_PER_USD;
}

export function microsFromUsd(usd) {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`invalid buyer_charge: ${usd}`);
  }
  return parseMicros(Math.round(usd * MICROS_PER_USD));
}

/**
 * Integer-micro binding for clamp(charge×0.20, $0.02, charge×0.30).
 * 30% < $0.02  <=>  3*micros < 200_000  <=>  micros <= 66666
 * 20% < $0.02  <=>  2*micros < 200_000  <=>  micros <  100000
 */
export function bindingFromChargeMicros(chargeMicros) {
  const m = parseMicros(chargeMicros);
  if (m === 0) return 'zero';
  if (m * 3 < FLOOR_MICROS * 10) return 'cap-30pct';
  if (m * 2 < FLOOR_MICROS * 10) return 'floor-0.02';
  return 'nominal-20pct';
}

export function worksheetRow(charge, opts = {}) {
  if (!Number.isFinite(charge) || charge < 0) {
    throw new Error(`invalid buyer_charge: ${charge}`);
  }
  const chargeMicros = opts.chargeMicros != null ? parseMicros(opts.chargeMicros) : microsFromUsd(charge);
  if(opts.chargeMicros != null && microsFromUsd(charge)!==chargeMicros) throw new Error('USD and micros disagree');
  charge=usdFromMicros(chargeMicros);
  const m=BigInt(chargeMicros);
  const feeTenths=(2n*m>200000n?2n*m:200000n)<3n*m?(2n*m>200000n?2n*m:200000n):3n*m;
  const twenty = charge * RATE;
  const cap = charge * CAP_RATE;
  const floor = FLOOR_USD;
  const platformFee = charge === 0 ? 0 : clamp(twenty, floor, cap);
  const earnings = charge - platformFee;
  const effectivePct = charge === 0 ? null : (platformFee / charge) * 100;
  const binding = bindingFromChargeMicros(chargeMicros);

  return {
    platformFeeMicrosNumerator: String(feeTenths),
    sellerEarningsMicrosNumerator: String(10n*m-feeTenths),
    exactMicrosDenominator: 10,
    precisionNote: 'Formula before provider rounding; USD display rounded to four decimals',
    buyerChargeUsd: charge,
    buyerChargeMicros: chargeMicros,
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
  note: 'This evidence packager makes no paid model calls, so the docs $0.18 example (net $0.10 + Claude $0.04) does not apply. For this $0.10 normal-band charge only, buyer_charge = target_net / 0.80.',
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

function buildTable(charges, microsByIndex = null) {
  return charges.map((c, i) =>
    worksheetRow(c, microsByIndex ? { chargeMicros: microsByIndex[i] } : {}),
  );
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(`Usage: fee-worksheet.mjs [buyer_charge_usd...]
       fee-worksheet.mjs --table
       fee-worksheet.mjs --micros 50000 66667 80000 100000
       fee-worksheet.mjs 0.05 0.066667 0.08 0.10

Offline docs.grexal.ai/docs/payments clamp. 1 USD = 1e6 micros. No auth, no spend.
`);
    process.exit(0);
  }

  let tableMode = argv[0] === '--table' || argv.length === 0;
  let charges;
  let microsList = null;
  try {
    if (argv[0] === '--micros') {
      tableMode = false;
      microsList = argv.slice(1).map(parseMicros);
      charges = microsList.map(usdFromMicros);
    } else if (tableMode) {
      charges = [...DOCS_TABLE, FLOOR_BAND_EXAMPLE, 0.18];
    } else {
      charges = argv.map(Number);
    }
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
    process.exit(1);
  }

  for (const c of charges) {
    if (!Number.isFinite(c) || c < 0) {
      console.error(
        JSON.stringify({
          ok: false,
          error: 'usage: fee-worksheet.mjs <buyer_charge_usd...> | --table | --micros <int...>',
        }),
      );
      process.exit(1);
    }
  }

  const rows = buildTable(charges, microsList);
  const out = {
    ok: true,
    cashBoundaryUsd: 0,
    source: `${SOURCE} (captured 2026-09-10)`,
    formula: FORMULA,
    sellerKeepNominal: 0.8,
    microsPerUsd: MICROS_PER_USD,
    notes: [
      'Normal case ~20% for charges ≥ $0.10.',
      'Micro-run floor $0.02 binds when 20% < $0.02 and 30% of charge still ≥ $0.02 (~$0.0667 ≤ charge < $0.10).',
      'Below ~$0.0667 the 30% cap binds (docs $0.05 and $0.02 rows).',
      'Exact units: 1 USD = 1_000_000 micros. Floor/cap crossover is 0.02/0.30 = 1/15 USD ≈ 66666.6̅ micros; 66667 is the first integer micro in the floor band.',
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
