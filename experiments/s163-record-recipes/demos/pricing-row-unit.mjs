#!/usr/bin/env node
import path from 'node:path';
import { ROOT, s134Module, runNode, parseCliJson } from './lib.mjs';
import { preparePricingTable } from '../adapters/pricing-row-unit.mjs';

const before = path.join(ROOT, 'sources/pricing/public-model-rows/before.json');
const after = path.join(ROOT, 'sources/pricing/public-model-rows/after-unit-case.json');
const html = path.join(ROOT, 'sources/pricing/public-model-rows/unsupported-page.html');

const refused = preparePricingTable(html, 'html');
if (!refused.refused) {
  console.error('expected HTML refuse', refused);
  process.exit(2);
}

const prepB = preparePricingTable(before, 'before');
const prepA = preparePricingTable(after, 'after');
if (!prepB.ok || !prepA.ok) {
  console.error({ prepB, prepA });
  process.exit(2);
}

const r = runNode(s134Module('pricing-table-change'), ['--before', before, '--after', after]);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}
const report = parseCliJson(r.stdout).report;
console.log(
  JSON.stringify(
    {
      demo: 'pricing-row-unit',
      htmlRefuseCode: refused.code,
      unitChanges: report.unitChanges,
      counts: report.counts,
      paidValueClaim: false,
      costClaim: false,
    },
    null,
    2,
  ),
);
