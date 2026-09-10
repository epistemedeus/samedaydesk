/**
 * Factual extracted pricing-table field/unit change (offline).
 * Inputs are already-extracted table JSON (rows of {field, value, unit?}).
 * Does not scrape URLs, invent prices, or claim paid catalog value.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, parseArgs, uncertainty, FREE_BASELINE, stableSort } from '../../lib/common.mjs';

function normalizeUnit(u) {
  // Preserve case: USD/GB and USD/Gb are not equivalent. Only trim whitespace.
  // No silent alias folding / case-folding without an explicit equivalence table.
  // Blank/whitespace-only units are missing, not an empty comparable unit.
  if (u == null) return null;
  const s = String(u).trim();
  return s === '' ? null : s;
}

function normalizeField(f) {
  return String(f ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function loadPricingTable(doc, label) {
  const uncertainties = [];
  if (doc == null) return { ok: false, error: 'null-document', label, rows: [], uncertainties };
  if (typeof doc === 'string') {
    try {
      doc = JSON.parse(doc);
    } catch (e) {
      return { ok: false, error: 'parse-error', detail: String(e.message || e), label, rows: [], uncertainties };
    }
  }
  let rows = [];
  if (Array.isArray(doc)) rows = doc;
  else if (doc && Array.isArray(doc.rows)) rows = doc.rows;
  else if (doc && Array.isArray(doc.items)) rows = doc.items;
  else {
    return {
      ok: false,
      error: 'unsupported-shape',
      label,
      rows: [],
      uncertainties: [uncertainty('unsupported-shape', 'Need array or {rows|items:[...]}')],
    };
  }
  if (rows.length === 0) {
    uncertainties.push(uncertainty('empty-table', `${label} has zero rows`));
  }
  const normalized = [];
  for (const [i, r] of rows.entries()) {
    if (!r || typeof r !== 'object') {
      uncertainties.push(uncertainty('malformed-row', `row ${i} not object`, { index: i }));
      continue;
    }
    const field = r.field ?? r.name ?? r.key ?? null;
    if (field == null || String(field).trim() === '') {
      uncertainties.push(uncertainty('missing-field', `row ${i} missing field/name/key`, { index: i, row: r }));
      continue;
    }
    const value = r.value ?? r.amount ?? r.price ?? null;
    const unit = r.unit ?? r.currency ?? r.uom ?? null;
    if (value == null) {
      uncertainties.push(uncertainty('missing-value', `row ${i} missing value`, { field }));
    }
    normalized.push({
      field: String(field),
      fieldKey: normalizeField(field),
      value,
      unit: unit == null ? null : String(unit),
      unitKey: normalizeUnit(unit),
      raw: r,
    });
  }
  // Duplicate field keys → conflicting
  const seen = new Map();
  for (const row of normalized) {
    if (!seen.has(row.fieldKey)) seen.set(row.fieldKey, []);
    seen.get(row.fieldKey).push(row);
  }
  for (const [fk, list] of seen) {
    if (list.length > 1) {
      uncertainties.push(
        uncertainty('duplicate-field', `multiple rows for fieldKey=${fk}`, {
          fieldKey: fk,
          count: list.length,
        }),
      );
    }
  }
  return { ok: true, label, rows: normalized, byKey: seen, uncertainties };
}

export function comparePricingTables(beforeDoc, afterDoc) {
  const before = loadPricingTable(beforeDoc, 'before');
  const after = loadPricingTable(afterDoc, 'after');
  const uncertainties = [...before.uncertainties, ...after.uncertainties];
  if (!before.ok || !after.ok) {
    return {
      module: 'pricing-table-change',
      ok: false,
      errors: [before.ok ? null : before, after.ok ? null : after].filter(Boolean),
      uncertainties,
      freeBaseline: FREE_BASELINE,
      differenceInDeliveredOutput: 'No pricing delta: input tables failed local structural load.',
    };
  }

  const fieldChanges = [];
  const unitChanges = [];
  const added = [];
  const removed = [];
  const unchanged = [];
  const conflicting = [];
  const unknown = [];

  const keys = new Set([...before.byKey.keys(), ...after.byKey.keys()]);
  for (const key of [...keys].sort()) {
    const bList = before.byKey.get(key) || [];
    const aList = after.byKey.get(key) || [];
    if (bList.length === 0 && aList.length === 1) {
      added.push({ fieldKey: key, after: aList[0] });
      continue;
    }
    if (bList.length === 1 && aList.length === 0) {
      removed.push({ fieldKey: key, before: bList[0] });
      continue;
    }
    if (bList.length === 0 && aList.length === 0) {
      unknown.push({ fieldKey: key, reason: 'empty-both' });
      continue;
    }
    if (bList.length > 1 || aList.length > 1) {
      conflicting.push({
        fieldKey: key,
        reason: 'duplicate-rows-prevent-unique-compare',
        beforeCount: bList.length,
        afterCount: aList.length,
      });
      continue;
    }
    const b = bList[0];
    const a = aList[0];
    const bMissing = b.value == null;
    const aMissing = a.value == null;
    const valueChanged = JSON.stringify(b.value) !== JSON.stringify(a.value);
    const unitChanged = b.unitKey !== a.unitKey;
    const bUnitMissing = b.unitKey == null;
    const aUnitMissing = a.unitKey == null;
    if (bUnitMissing || aUnitMissing) {
      unknown.push({
        fieldKey: key,
        reason: 'unit-unknown',
        before: { value: b.value, unit: b.unit },
        after: { value: a.value, unit: a.unit },
        note: 'Missing or blank unit is outside definitive price comparability; values are not compared.',
      });
      uncertainties.push(
        uncertainty('missing-unit', `field ${key} missing/blank unit; price comparison withheld`, {
          fieldKey: key,
          beforeUnit: b.unit,
          afterUnit: a.unit,
        }),
      );
      continue;
    }
    if (!valueChanged && !unitChanged) {
      unchanged.push({ fieldKey: key });
      continue;
    }
    // Missing cells: never emit a numeric fieldChange that looks like a priced delta.
    if (bMissing || aMissing) {
      conflicting.push({
        fieldKey: key,
        reason: 'missing-cell',
        before: { value: b.value, unit: b.unit },
        after: { value: a.value, unit: a.unit },
        note: 'One or both values are missing; refusing price comparison for this field.',
      });
      uncertainties.push(
        uncertainty('missing-cell', `field ${key} has missing value(s); comparison withheld`, {
          fieldKey: key,
          beforeMissing: bMissing,
          afterMissing: aMissing,
        }),
      );
      continue;
    }
    // Unit differs: never treat raw numeric equality/inequality as a priced comparison.
    if (unitChanged) {
      conflicting.push({
        fieldKey: key,
        reason: 'cross-unit-incomparable',
        before: { value: b.value, unit: b.unit },
        after: { value: a.value, unit: a.unit },
        note: 'Units differ; numeric values are not compared and are not asserted equal or changed.',
      });
      uncertainties.push(
        uncertainty('cross-unit', `field ${key} units differ; no conversion table supplied`, {
          fieldKey: key,
          beforeUnit: b.unit,
          afterUnit: a.unit,
        }),
      );
      // Still record the unit surface change without implying value comparability.
      unitChanges.push({
        fieldKey: key,
        beforeUnit: b.unit,
        afterUnit: a.unit,
        numericComparison: 'not-applicable-across-units',
        beforeValueRaw: b.value,
        afterValueRaw: a.value,
      });
      continue;
    }
    if (valueChanged) {
      fieldChanges.push({
        fieldKey: key,
        beforeValue: b.value,
        afterValue: a.value,
        unit: a.unit ?? b.unit,
      });
    }
  }

  const hasDelta =
    added.length +
      removed.length +
      fieldChanges.length +
      unitChanges.length +
      conflicting.length +
      unknown.length >
    0;

  return {
    module: 'pricing-table-change',
    ok: true,
    counts: {
      beforeRows: before.rows.length,
      afterRows: after.rows.length,
      added: added.length,
      removed: removed.length,
      fieldChanges: fieldChanges.length,
      unitChanges: unitChanges.length,
      conflicting: conflicting.length,
      unchanged: unchanged.length,
      unknown: unknown.length,
    },
    added: stableSort(added, (x) => x.fieldKey),
    removed: stableSort(removed, (x) => x.fieldKey),
    fieldChanges: stableSort(fieldChanges, (x) => x.fieldKey),
    unitChanges: stableSort(unitChanges, (x) => x.fieldKey),
    conflicting: stableSort(conflicting, (x) => x.fieldKey),
    unchanged: stableSort(unchanged, (x) => x.fieldKey),
    unknown: stableSort(unknown, (x) => x.fieldKey),
    uncertainties,
    freeBaseline: FREE_BASELINE,
    differenceInDeliveredOutput: hasDelta
      ? 'Emits field/unit deltas over supplied extracted rows. Does not scrape live pages, convert currencies, or assert SKU truth.'
      : 'No field/unit deltas (or only empty/unknown inputs). Still not a marketplace price proof.',
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`Usage: s134-pricing-table-change --before <json> --after <json>\n`);
    process.exit(0);
  }
  if (!args.before || !args.after) {
    process.stderr.write('missing --before/--after\n');
    process.exit(2);
  }
  const beforeDoc = JSON.parse(fs.readFileSync(args.before, 'utf8'));
  const afterDoc = JSON.parse(fs.readFileSync(args.after, 'utf8'));
  const report = comparePricingTables(beforeDoc, afterDoc);
  emit({
    tool: 's134-pricing-table-change',
    inputs: { before: path.resolve(args.before), after: path.resolve(args.after) },
    report,
  });
  process.exit(report.ok ? 0 : 2);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
