/**
 * Pricing-row prep for s134-pricing-table-change.
 * Accepts pre-extracted {rows:[{field,value,unit}]} only.
 * Refuses HTML/PDF/scrape blobs — does not synthesize prices.
 */
import fs from 'node:fs';
import path from 'node:path';
import { refuse, isProbablyHtml, requireFields } from './refuse-unsupported.mjs';

export function preparePricingTable(input, label = 'pricing') {
  if (input == null) return refuse('null-pricing-input', `${label} is null`);
  let text = input;
  let obj = input;
  if (typeof input === 'string') {
    if (fs.existsSync(input)) {
      text = fs.readFileSync(input, 'utf8');
      if (isProbablyHtml(text)) {
        return refuse('unsupported-html-extraction', 'HTML pricing pages are not auto-extracted; supply curated rows with field/value/unit', {
          path: input,
        });
      }
      try {
        obj = JSON.parse(text);
      } catch {
        return refuse('unsupported-pricing-format', 'Need JSON array or {rows|items:[...]} with field/value/unit', { path: input });
      }
    } else {
      try {
        obj = JSON.parse(input);
      } catch {
        return refuse('unsupported-pricing-format', 'Need JSON pricing extract');
      }
    }
  }
  if (obj == null || (typeof obj !== 'object')) {
    return refuse('unsupported-pricing-shape', `${label} must be a JSON array or {rows|items:[...]}`, {
      got: obj === null ? 'null' : typeof obj,
    });
  }
  if (!Array.isArray(obj) && obj.rows == null && obj.items == null) {
    return refuse('unsupported-pricing-shape', 'Object must include rows[]', { keys: Object.keys(obj) });
  }
  const rows = Array.isArray(obj) ? obj : obj.rows || obj.items || [];
  if (!rows.length) return refuse('empty-pricing-rows', `${label} has zero rows`);
  for (const [i, r] of rows.entries()) {
    const miss = requireFields(r, ['field', 'value'], `row ${i}`);
    if (miss) return miss;
    // unit may be null but if present must be string — preserve as-is (no case fold)
    if (r.unit != null && typeof r.unit !== 'string') {
      return refuse('invalid-unit-type', `row ${i} unit must be string when present`, { row: r });
    }
  }
  return {
    ok: true,
    label,
    table: { rows: rows.map((r) => ({ field: r.field, value: r.value, unit: r.unit ?? null })) },
    citations: obj.citations || null,
    retainUnits: true,
    paidValueClaim: false,
    costClaim: false,
    note: 'Unit/currency changes are reported factually; no ROI or total-cost inference.',
  };
}

export function writePreparedTable(prep, outPath) {
  if (!prep.ok) return prep;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(prep.table, null, 2)}\n`);
  return { ok: true, path: outPath };
}

export function buildPricingCliArgs({ before, after, s134Root }) {
  const b = preparePricingTable(before, 'before');
  if (!b.ok) return b;
  const a = preparePricingTable(after, 'after');
  if (!a.ok) return a;
  const cli = path.join(s134Root, 'modules/pricing-table-change/cli.mjs');
  return { ok: true, argv: [cli, '--before', before, '--after', after], prepared: { before: b, after: a } };
}
