/**
 * CSV schema/row drift with uncertainty (offline).
 * Uses csv-parse on supplied files only. No paid fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { emit, parseArgs, uncertainty, FREE_BASELINE, stableSort } from '../../lib/common.mjs';

export function parseCsvFile(text, label, { columns = true, relax = true } = {}) {
  const uncertainties = [];
  const raw = String(text ?? '');
  if (raw.trim() === '') {
    return {
      ok: true,
      label,
      headers: [],
      rows: [],
      uncertainties: [uncertainty('empty-csv', `${label} is empty`)],
    };
  }
  try {
    const records = parseCsv(raw, {
      columns,
      skip_empty_lines: true,
      relax_column_count: relax,
      trim: true,
      bom: true,
    });
    if (!Array.isArray(records)) {
      return { ok: false, error: 'unexpected-parse-result', label, headers: [], rows: [], uncertainties };
    }
    let headers = [];
    let rows = [];
    if (columns) {
      if (records.length === 0) {
        // header-only or empty body: re-parse header line
        const firstLine = raw.split(/\r?\n/).find((l) => l.trim());
        headers = firstLine
          ? parseCsv(firstLine, { columns: false, trim: true, bom: true })[0] || []
          : [];
        if (headers.length) uncertainties.push(uncertainty('header-only', `${label} has headers but no data rows`));
      } else {
        headers = Object.keys(records[0]);
        rows = records;
        // detect blank header names
        for (const [i, h] of headers.entries()) {
          if (h == null || String(h).trim() === '') {
            uncertainties.push(uncertainty('blank-header', `blank header at index ${i}`, { index: i }));
          }
        }
        // duplicate headers
        const seen = new Map();
        for (const h of headers) {
          seen.set(h, (seen.get(h) || 0) + 1);
        }
        for (const [h, n] of seen) {
          if (n > 1) uncertainties.push(uncertainty('duplicate-header', `header "${h}" appears ${n} times`, { header: h, count: n }));
        }
      }
    } else {
      rows = records;
      headers = records[0] ? records[0].map((_, i) => String(i)) : [];
    }
    return { ok: true, label, headers, rows, uncertainties };
  } catch (e) {
    return {
      ok: false,
      error: 'csv-parse-error',
      detail: String(e.message || e),
      label,
      headers: [],
      rows: [],
      uncertainties,
    };
  }
}

function rowFingerprint(row, headers) {
  return headers.map((h) => JSON.stringify(row?.[h] ?? null)).join('\u001f');
}

export function compareCsvDrift(beforeText, afterText, opts = {}) {
  const keyColumns = Array.isArray(opts.keyColumns) ? opts.keyColumns : opts.keyColumns ? [opts.keyColumns] : [];
  const before = parseCsvFile(beforeText, 'before');
  const after = parseCsvFile(afterText, 'after');
  const uncertainties = [...before.uncertainties, ...after.uncertainties];

  if (!before.ok || !after.ok) {
    return {
      module: 'csv-drift',
      ok: false,
      errors: [before.ok ? null : before, after.ok ? null : after].filter(Boolean),
      uncertainties,
      freeBaseline: FREE_BASELINE,
      differenceInDeliveredOutput: 'No CSV drift report: parse failed.',
    };
  }

  const beforeHeaders = before.headers;
  const afterHeaders = after.headers;
  const beforeSet = new Set(beforeHeaders);
  const afterSet = new Set(afterHeaders);
  const columnsAdded = afterHeaders.filter((h) => !beforeSet.has(h));
  const columnsRemoved = beforeHeaders.filter((h) => !afterSet.has(h));
  const columnsShared = beforeHeaders.filter((h) => afterSet.has(h));
  const columnsReordered =
    columnsShared.length === beforeHeaders.length &&
    columnsShared.length === afterHeaders.length &&
    beforeHeaders.join('\0') !== afterHeaders.join('\0');

  // Keyed row drift when keys provided and present in both
  let rowDrift = { mode: 'unkeyed-count-only', added: null, removed: null, changed: null };
  if (keyColumns.length === 0) {
    uncertainties.push(
      uncertainty(
        'unkeyed-row-compare',
        'No --key provided; row identity uncertain. Reporting row-count delta only, not per-row add/remove.',
      ),
    );
    rowDrift = {
      mode: 'unkeyed-count-only',
      beforeRowCount: before.rows.length,
      afterRowCount: after.rows.length,
      rowCountDelta: after.rows.length - before.rows.length,
    };
  } else {
    const missingKeys = keyColumns.filter((k) => !beforeSet.has(k) || !afterSet.has(k));
    if (missingKeys.length) {
      uncertainties.push(
        uncertainty('key-columns-missing', 'One or more key columns absent in before/after schema', {
          missingKeys,
        }),
      );
      rowDrift = { mode: 'keys-unavailable', missingKeys };
    } else {
      const bMap = new Map();
      const aMap = new Map();
      const dupB = [];
      const dupA = [];
      for (const row of before.rows) {
        const k = keyColumns.map((c) => JSON.stringify(row[c] ?? null)).join('\u001f');
        if (bMap.has(k)) dupB.push(k);
        bMap.set(k, row);
      }
      for (const row of after.rows) {
        const k = keyColumns.map((c) => JSON.stringify(row[c] ?? null)).join('\u001f');
        if (aMap.has(k)) dupA.push(k);
        aMap.set(k, row);
      }
      if (dupB.length) {
        uncertainties.push(
          uncertainty('duplicate-keys-before', 'Duplicate key rows in before; keyed compare blocked to avoid silent last-wins overwrite', {
            count: dupB.length,
            keys: [...new Set(dupB)].slice(0, 20),
          }),
        );
      }
      if (dupA.length) {
        uncertainties.push(
          uncertainty('duplicate-keys-after', 'Duplicate key rows in after; keyed compare blocked to avoid silent last-wins overwrite', {
            count: dupA.length,
            keys: [...new Set(dupA)].slice(0, 20),
          }),
        );
      }
      if (dupB.length || dupA.length) {
        rowDrift = {
          mode: 'duplicate-keys-blocked',
          keyColumns,
          duplicateKeysBefore: [...new Set(dupB)],
          duplicateKeysAfter: [...new Set(dupA)],
          beforeRowCount: before.rows.length,
          afterRowCount: after.rows.length,
          note: 'Refusing keyed add/remove/change: duplicate keys would silently overwrite rows.',
        };
      } else {
        const added = [];
        const removed = [];
        const changed = [];
        for (const [k, row] of aMap) {
          if (!bMap.has(k)) added.push({ key: k, row });
          else {
            const br = bMap.get(k);
            const fields = [];
            for (const col of columnsShared) {
              if (JSON.stringify(br[col] ?? null) !== JSON.stringify(row[col] ?? null)) {
                fields.push({ column: col, before: br[col] ?? null, after: row[col] ?? null });
              }
            }
            if (fields.length) changed.push({ key: k, fields });
          }
        }
        for (const [k, row] of bMap) {
          if (!aMap.has(k)) removed.push({ key: k, row });
        }
        rowDrift = {
          mode: 'keyed',
          keyColumns,
          addedCount: added.length,
          removedCount: removed.length,
          changedCount: changed.length,
          added: added.slice(0, 50),
          removed: removed.slice(0, 50),
          changed: changed.slice(0, 50),
          truncated: added.length > 50 || removed.length > 50 || changed.length > 50,
        };
      }
    }
  }

  // Partial/ragged: if relax detected uneven columns via __parsed_extra or empty
  // csv-parse with relax_column_count may produce incomplete objects — flag when shared col missing often
  let missingCellRate = null;
  if (columnsShared.length && after.rows.length) {
    let missing = 0;
    let total = after.rows.length * columnsShared.length;
    for (const row of after.rows) {
      for (const c of columnsShared) {
        if (row[c] == null || row[c] === '') missing++;
      }
    }
    missingCellRate = total ? missing / total : 0;
    if (missingCellRate > 0.2) {
      uncertainties.push(
        uncertainty('partial-cells', `>${Math.round(missingCellRate * 100)}% empty cells among shared columns in after`, {
          missingCellRate,
        }),
      );
    }
  }

  const hasSchemaDrift = columnsAdded.length + columnsRemoved.length > 0 || columnsReordered;
  const hasRowSignal =
    rowDrift.mode === 'duplicate-keys-blocked' ||
    (rowDrift.mode === 'keyed' &&
      (rowDrift.addedCount > 0 || rowDrift.removedCount > 0 || rowDrift.changedCount > 0)) ||
    (rowDrift.mode === 'unkeyed-count-only' && rowDrift.rowCountDelta !== 0);

  return {
    module: 'csv-drift',
    ok: true,
    schema: {
      beforeHeaders,
      afterHeaders,
      columnsAdded,
      columnsRemoved,
      columnsReordered,
      columnsShared,
    },
    rowDrift,
    missingCellRate,
    uncertainties,
    freeBaseline: FREE_BASELINE,
    differenceInDeliveredOutput:
      hasSchemaDrift || hasRowSignal
        ? 'Reports schema column add/remove/reorder and keyed row deltas when keys are supplied. Without keys, only row-count delta is stated (identity unknown). Not a warehouse migration plan.'
        : 'No schema/row drift signal (or empty inputs). Uncertainty list may still describe empty/partial/duplicate cases.',
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      `Usage: s134-csv-drift --before <csv> --after <csv> [--key col] [--key col2]\n`,
    );
    process.exit(0);
  }
  if (!args.before || !args.after) {
    process.stderr.write('missing --before/--after\n');
    process.exit(2);
  }
  // collect repeated --key
  const keyColumns = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--key' && argv[i + 1]) keyColumns.push(argv[++i]);
  }
  const beforeText = fs.readFileSync(args.before, 'utf8');
  const afterText = fs.readFileSync(args.after, 'utf8');
  const report = compareCsvDrift(beforeText, afterText, { keyColumns });
  emit({
    tool: 's134-csv-drift',
    inputs: { before: path.resolve(args.before), after: path.resolve(args.after), keyColumns },
    report,
  });
  process.exit(report.ok ? 0 : 2);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
