#!/usr/bin/env node
/**
 * Offline Grexal fee worksheet from published docs formula.
 * platform_fee = clamp(buyer_charge * 0.20, 0.02, buyer_charge * 0.30)
 */
const charge = Number(process.argv[2] ?? '0.10');
if (!Number.isFinite(charge) || charge < 0) {
  console.error(JSON.stringify({ ok: false, error: 'usage: fee-worksheet.mjs <buyer_charge_usd>' }));
  process.exit(1);
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

const platformFee = clamp(charge * 0.2, 0.02, charge * 0.3);
const earnings = charge - platformFee;
const effectivePct = charge === 0 ? null : (platformFee / charge) * 100;

const out = {
  ok: true,
  cashBoundaryUsd: 0,
  source: 'https://docs.grexal.ai/docs/payments (captured 2026-09-10)',
  formula: 'platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)',
  buyerChargeUsd: charge,
  platformFeeUsd: Number(platformFee.toFixed(4)),
  sellerEarningsUsd: Number(earnings.toFixed(4)),
  effectiveFeePercent: effectivePct === null ? null : Number(effectivePct.toFixed(2)),
  notes: [
    'Normal case ~20% for charges ≥ $0.10.',
    'Micro-run floor $0.02 can raise effective % below $0.10.',
    'Fee never exceeds 30% of charge.',
    'Demand volume unknown — experiment, not a blocker for a dry scaffold.',
  ],
  willNotPublishFromWorker: true,
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
