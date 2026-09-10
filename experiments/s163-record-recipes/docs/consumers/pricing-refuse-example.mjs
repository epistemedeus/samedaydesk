#!/usr/bin/env node
/**
 * Consumer sample: preparePricingTable refuses HTML instead of inventing rows.
 * From experiments/s163-record-recipes:
 *   node docs/consumers/pricing-refuse-example.mjs
 *
 * Does not scrape, does not emit total-cost / ROI / demand.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePricingTable } from '../../adapters/pricing-row-unit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = path.join(root, 'sources/pricing/public-model-rows/unsupported-page.html');

const result = preparePricingTable(html, 'unsupported-page.html');
if (!result.refused || result.code !== 'unsupported-html-extraction') {
  console.error('expected unsupported-html-extraction refuse', result);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      refused: result.refused,
      code: result.code,
      paidValueClaim: result.paidValueClaim,
      costClaim: false,
      totalCostClaim: false,
      roiClaim: false,
      demandClaim: false,
    },
    null,
    2,
  ),
);
