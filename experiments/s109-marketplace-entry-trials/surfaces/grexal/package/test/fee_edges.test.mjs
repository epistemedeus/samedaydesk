import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  usdFromMicros,
  parseMicros,
  microsFromUsd,
  bindingFromChargeMicros,
  worksheetRow,
} from '../bin/fee-worksheet.mjs';

const feeBin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/fee-worksheet.mjs');

function runFee(args) {
  return spawnSync(process.execPath, [feeBin, ...args], { encoding: 'utf8' });
}

test('micros conversion and floor/cap bindings', () => {
  assert.equal(usdFromMicros(50000), 0.05);
  const a = worksheetRow(0.05);
  const b = worksheetRow(0.08);
  const c = worksheetRow(0.1);
  assert.equal(a.binding, 'cap-30pct');
  assert.equal(b.binding, 'floor-0.02');
  assert.equal(c.binding, 'nominal-20pct');
  assert.equal(a.platformFeeUsd, 0.015);
  assert.equal(b.platformFeeUsd, 0.02);
  assert.equal(c.platformFeeUsd, 0.02);
});

test('C6 dollar edges: $0.05 cap, $0.066667 floor boundary, $0.08 floor, $0.10 nominal', () => {
  const rows = {
    '0.05': worksheetRow(0.05),
    '0.066667': worksheetRow(0.066667),
    '0.08': worksheetRow(0.08),
    '0.10': worksheetRow(0.1),
  };
  assert.equal(rows['0.05'].binding, 'cap-30pct');
  assert.equal(rows['0.05'].platformFeeUsd, 0.015);
  assert.equal(rows['0.05'].sellerEarningsUsd, 0.035);
  assert.equal(rows['0.05'].effectiveFeePercent, 30);
  assert.equal(rows['0.05'].buyerChargeMicros, 50000);

  assert.equal(rows['0.066667'].binding, 'floor-0.02');
  assert.equal(rows['0.066667'].platformFeeUsd, 0.02);
  assert.equal(rows['0.066667'].buyerChargeUsd, 0.066667);
  assert.equal(rows['0.066667'].buyerChargeMicros, 66667);
  // 4-decimal display rounds cap 0.0200001 → 0.02; binding still uses exact rails.
  assert.equal(rows['0.066667'].capUsd, 0.02);
  assert.equal(rows['0.066667'].floorUsd, 0.02);

  assert.equal(rows['0.08'].binding, 'floor-0.02');
  assert.equal(rows['0.08'].platformFeeUsd, 0.02);
  assert.equal(rows['0.08'].effectiveFeePercent, 25);
  assert.equal(rows['0.08'].buyerChargeMicros, 80000);

  assert.equal(rows['0.10'].binding, 'nominal-20pct');
  assert.equal(rows['0.10'].platformFeeUsd, 0.02);
  assert.equal(rows['0.10'].sellerEarningsUsd, 0.08);
  assert.equal(rows['0.10'].effectiveFeePercent, 20);
  assert.equal(rows['0.10'].buyerChargeMicros, 100000);
});

test('C6 --micros 50000 66667 80000 100000 match dollar edges and keep integer micros', () => {
  const pairs = [
    [50000, 0.05, 'cap-30pct', 0.015],
    [66667, 0.066667, 'floor-0.02', 0.02],
    [80000, 0.08, 'floor-0.02', 0.02],
    [100000, 0.1, 'nominal-20pct', 0.02],
  ];
  for (const [micros, usd, binding, fee] of pairs) {
    assert.equal(usdFromMicros(micros), usd);
    assert.equal(usdFromMicros(String(micros)), usd);
    assert.equal(parseMicros(String(micros)), micros);
    const fromMicros = worksheetRow(usdFromMicros(micros), { chargeMicros: micros });
    const fromUsd = worksheetRow(usd);
    assert.equal(fromMicros.binding, binding);
    assert.equal(fromUsd.binding, binding);
    assert.equal(fromMicros.platformFeeUsd, fee);
    assert.equal(fromUsd.platformFeeUsd, fee);
    assert.equal(fromMicros.buyerChargeMicros, micros);
    assert.equal(fromUsd.buyerChargeMicros, micros);
  }

  const cli = runFee(['--micros', '50000', '66667', '80000', '100000']);
  assert.equal(cli.status, 0, cli.stderr + cli.stdout);
  const out = JSON.parse(cli.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.cashBoundaryUsd, 0);
  assert.equal(out.microsPerUsd, 1_000_000);
  assert.deepEqual(
    out.rows.map((r) => ({ m: r.buyerChargeMicros, b: r.binding, f: r.platformFeeUsd })),
    [
      { m: 50000, b: 'cap-30pct', f: 0.015 },
      { m: 66667, b: 'floor-0.02', f: 0.02 },
      { m: 80000, b: 'floor-0.02', f: 0.02 },
      { m: 100000, b: 'nominal-20pct', f: 0.02 },
    ],
  );

  const usdCli = runFee(['0.05', '0.066667', '0.08', '0.10']);
  assert.equal(usdCli.status, 0, usdCli.stderr + usdCli.stdout);
  const usdOut = JSON.parse(usdCli.stdout);
  assert.deepEqual(
    usdOut.rows.map((r) => r.binding),
    out.rows.map((r) => r.binding),
  );
  assert.deepEqual(
    usdOut.rows.map((r) => r.platformFeeUsd),
    out.rows.map((r) => r.platformFeeUsd),
  );
});

test('integer-micro floor/cap crossover is 66666 cap then 66667 floor; 99999 floor then 100000 nominal', () => {
  assert.equal(bindingFromChargeMicros(66666), 'cap-30pct');
  assert.equal(bindingFromChargeMicros(66667), 'floor-0.02');
  assert.equal(bindingFromChargeMicros(99999), 'floor-0.02');
  assert.equal(bindingFromChargeMicros(100000), 'nominal-20pct');
  assert.equal(worksheetRow(usdFromMicros(66666), { chargeMicros: 66666 }).binding, 'cap-30pct');
  assert.equal(worksheetRow(usdFromMicros(66667), { chargeMicros: 66667 }).binding, 'floor-0.02');
  assert.equal(microsFromUsd(0.02 / 0.3), 66667); // 1/15 USD rounds to nearest micro on the floor side
});

test('--micros rejects non-integers with JSON error (no uncaught throw)', () => {
  const r = runFee(['--micros', '66667.5']);
  assert.equal(r.status, 1);
  const err = JSON.parse(r.stderr.trim());
  assert.equal(err.ok, false);
  assert.match(err.error, /invalid micros/);
});
