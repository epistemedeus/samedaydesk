import test from 'node:test';
import assert from 'node:assert/strict';
import { usdFromMicros, worksheetRow } from '../bin/fee-worksheet.mjs';

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
