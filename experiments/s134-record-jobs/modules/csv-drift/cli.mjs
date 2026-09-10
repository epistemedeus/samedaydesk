/**
 * CSV schema/row drift with uncertainty (offline).
 * Uses csv-parse on supplied files only. No paid fetch.
 *
 * Named rows are { cells, meta }. Caller headers live only in `cells`
 * (null-prototype map). Width/ragged evidence lives only in `meta`.
 * Legitimate headers such as __status / __extraFields / __proto__ compare normally.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { emit, parseArgs, uncertainty, FREE_BASELINE, stableSort } from '../../lib/common.mjs';

function emptyCells() {
  return Object.create(null);
}

function emptyMeta() {
  return { shortRow: false, missingFieldCount: 0, extraFields: null };
}

function makeRow(cells, meta = {}) {
  return {
    cells,
    meta: {
      shortRow: Boolean(meta.shortRow),
      missingFieldCount: meta.missingFieldCount || 0,
      extraFields: meta.extraFields == null ? null : meta.extraFields,
    },
  };
}

function hasCell(cells, col) {
  return Object.prototype.hasOwnProperty.call(cells, col);
}

function cellPresence(cells, col) {
  if (!hasCell(cells, col)) return 'missing';
  const v = cells[col];
  if (v === '') return 'empty';
  if (v == null) return 'null';
  return 'present';
}

function cellValue(cells, col) {
  return hasCell(cells, col) ? cells[col] : null;
}

function rowIsShortOrWide(row) {
  return Boolean(row?.meta?.shortRow || (row?.meta?.extraFields && row.meta.extraFields.length));
}

function buildNamedRow(objectKeys, rec) {
  const cells = emptyCells();
  for (let i = 0; i < objectKeys.length; i++) {
    if (i < rec.length) {
      // Present (including ""). Distinct from missing (key absent).
      cells[objectKeys[i]] = rec[i];
    }
  }
  const meta = emptyMeta();
  if (rec.length < objectKeys.length) {
    meta.shortRow = true;
    meta.missingFieldCount = objectKeys.length - rec.length;
  }
  if (rec.length > objectKeys.length) {
    meta.extraFields = rec.slice(objectKeys.length);
  }
  return makeRow(cells, meta);
}

/**
 * @param {string} text
 * @param {string} label
 * @param {{ columns?: boolean, relax?: boolean }} [opts]
 *   columns (default true): first record is header; rows are {cells, meta}.
 *   columns false: every record is a data array row; first record is NOT stripped.
 *   relax (default true): csv-parse relax_column_count. When false, uneven widths error.
 */
export function parseCsvFile(text, label, { columns = true, relax = true } = {}) {
  const uncertainties = [];
  const raw = String(text ?? '');
  if (raw.trim() === '') {
    return {
      ok: true,
      label,
      headers: [],
      headerRecord: [],
      rows: [],
      uncertainties: [uncertainty('empty-csv', `${label} is empty`)],
      parseStatus: 'empty',
      columnsMode: Boolean(columns),
      relaxMode: Boolean(relax),
    };
  }
  try {
    const matrix = parseCsv(raw, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: Boolean(relax),
      trim: true,
      bom: true,
    });
    if (!Array.isArray(matrix) || matrix.length === 0) {
      return {
        ok: true,
        label,
        headers: [],
        headerRecord: [],
        rows: [],
        uncertainties: [uncertainty('empty-csv', `${label} has no records`)],
        parseStatus: 'empty',
        columnsMode: Boolean(columns),
        relaxMode: Boolean(relax),
      };
    }

    // columns:false — matrix of array rows; do not treat first record as a header.
    if (!columns) {
      const expectedWidth = matrix[0]?.length ?? 0;
      const ragged = [];
      for (const [i, rec] of matrix.entries()) {
        if (rec.length !== expectedWidth) {
          ragged.push({ rowIndex: i, width: rec.length, expectedWidth });
        }
      }
      if (ragged.length) {
        uncertainties.push(
          uncertainty('inconsistent-row-width', `${label} has rows whose field count differs (columns:false matrix)`, {
            expectedWidth,
            examples: ragged.slice(0, 10),
            count: ragged.length,
          }),
        );
      }
      return {
        ok: true,
        label,
        headers: null,
        headerRecord: null,
        rows: matrix.map((rec) => ({ values: rec.map((c) => (c == null ? null : c)), meta: emptyMeta() })),
        uncertainties,
        parseStatus: ragged.length ? 'partial' : 'ok',
        columnsMode: false,
        relaxMode: Boolean(relax),
        rowShape: 'arrays',
      };
    }

    const headerRecord = matrix[0].map((h) => (h == null ? '' : String(h)));
    const dataRecords = matrix.slice(1);

    const headerCounts = new Map();
    for (const h of headerRecord) headerCounts.set(h, (headerCounts.get(h) || 0) + 1);
    const duplicateHeaders = [...headerCounts.entries()].filter(([, n]) => n > 1).map(([h, n]) => ({ header: h, count: n }));
    for (const [i, h] of headerRecord.entries()) {
      if (h == null || String(h).trim() === '') {
        uncertainties.push(uncertainty('blank-header', `blank header at index ${i}`, { index: i }));
      }
    }
    if (duplicateHeaders.length) {
      uncertainties.push(
        uncertainty('duplicate-header', 'Duplicate header names in CSV; positional compare only (object mapping would drop earlier values)', {
          duplicates: duplicateHeaders,
        }),
      );
    }

    const expectedWidth = headerRecord.length;
    const ragged = [];
    for (const [i, rec] of dataRecords.entries()) {
      if (rec.length !== expectedWidth) {
        ragged.push({ rowIndex: i, width: rec.length, expectedWidth });
      }
    }
    if (ragged.length) {
      uncertainties.push(
        uncertainty('inconsistent-row-width', `${label} has rows whose field count differs from header width ${expectedWidth}`, {
          expectedWidth,
          examples: ragged.slice(0, 10),
          count: ragged.length,
        }),
      );
    }

    const nameCounts = new Map();
    const objectKeys = headerRecord.map((h) => {
      const n = (nameCounts.get(h) || 0) + 1;
      nameCounts.set(h, n);
      if (headerCounts.get(h) > 1) return n === 1 ? h : `${h}__${n}`;
      return h;
    });

    if (duplicateHeaders.length) {
      return {
        ok: true,
        label,
        headers: objectKeys,
        headerRecord,
        rows: dataRecords.map((rec) => buildNamedRow(objectKeys, rec)),
        uncertainties,
        parseStatus: 'duplicate-headers',
        duplicateHeaders,
        columnsMode: true,
        relaxMode: Boolean(relax),
        rowShape: 'named',
      };
    }

    const rows = dataRecords.map((rec) => buildNamedRow(objectKeys, rec));
    if (rows.length === 0) {
      uncertainties.push(uncertainty('header-only', `${label} has headers but no data rows`));
    }

    return {
      ok: true,
      label,
      headers: objectKeys,
      headerRecord,
      rows,
      uncertainties,
      parseStatus: ragged.length ? 'partial-widths' : 'ok',
      columnsMode: true,
      relaxMode: Boolean(relax),
      rowShape: 'named',
    };
  } catch (e) {
    return {
      ok: false,
      error: 'csv-parse-error',
      detail: String(e.message || e),
      label,
      headers: [],
      headerRecord: [],
      rows: [],
      uncertainties,
      parseStatus: 'error',
      columnsMode: Boolean(columns),
      relaxMode: Boolean(relax),
    };
  }
}

function keyOfRow(row, keyColumns) {
  return keyColumns.map((c) => JSON.stringify(cellValue(row.cells, c))).join('\u001f');
}

function compareSharedCells(beforeRow, afterRow, columnsShared) {
  const fields = [];
  for (const col of columnsShared) {
    const beforePresence = cellPresence(beforeRow.cells, col);
    const afterPresence = cellPresence(afterRow.cells, col);
    const before = cellValue(beforeRow.cells, col);
    const after = cellValue(afterRow.cells, col);
    if (beforePresence !== afterPresence || JSON.stringify(before) !== JSON.stringify(after)) {
      fields.push({
        column: col,
        before,
        after,
        beforePresence,
        afterPresence,
      });
    }
  }
  return fields;
}

function compareRowMeta(beforeRow, afterRow) {
  const metaChanges = [];
  const bExtra = beforeRow.meta?.extraFields ?? null;
  const aExtra = afterRow.meta?.extraFields ?? null;
  if (JSON.stringify(bExtra) !== JSON.stringify(aExtra)) {
    metaChanges.push({ field: 'extraFields', before: bExtra, after: aExtra });
  }
  const bShort = Boolean(beforeRow.meta?.shortRow);
  const aShort = Boolean(afterRow.meta?.shortRow);
  const bMiss = beforeRow.meta?.missingFieldCount || 0;
  const aMiss = afterRow.meta?.missingFieldCount || 0;
  if (bShort !== aShort || bMiss !== aMiss) {
    metaChanges.push({
      field: 'rowWidth',
      before: { short: bShort, missingFieldCount: bMiss },
      after: { short: aShort, missingFieldCount: aMiss },
    });
  }
  return metaChanges;
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

  const beforeHeaders = before.headerRecord || before.headers || [];
  const afterHeaders = after.headerRecord || after.headers || [];
  const beforeSet = new Set(beforeHeaders);
  const afterSet = new Set(afterHeaders);
  const columnsAdded = afterHeaders.filter((h) => !beforeSet.has(h));
  const columnsRemoved = beforeHeaders.filter((h) => !afterSet.has(h));
  const columnsShared = beforeHeaders.filter((h) => afterSet.has(h));
  const columnsReordered =
    columnsShared.length === beforeHeaders.length &&
    columnsShared.length === afterHeaders.length &&
    beforeHeaders.join('\0') !== afterHeaders.join('\0');
  if (before.parseStatus === 'duplicate-headers' || after.parseStatus === 'duplicate-headers') {
    uncertainties.push(
      uncertainty(
        'duplicate-header-blocks-named-compare',
        'Duplicate headers present; named column identity is ambiguous. Schema uses positional header records.',
      ),
    );
  }
  const shortOrWide = before.rows.some(rowIsShortOrWide) || after.rows.some(rowIsShortOrWide);
  if (shortOrWide) {
    uncertainties.push(
      uncertainty(
        'row-width-partial',
        'One or more data rows differ in width from the header record; treated as partial rows, not schema column add/remove.',
      ),
    );
  }

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
    } else if (before.parseStatus === 'duplicate-headers' || after.parseStatus === 'duplicate-headers') {
      rowDrift = {
        mode: 'duplicate-headers-blocked',
        keyColumns,
        note: 'Refusing keyed compare: duplicate headers would drop earlier column values under object mapping.',
        beforeParseStatus: before.parseStatus,
        afterParseStatus: after.parseStatus,
      };
    } else {
      const bMap = new Map();
      const aMap = new Map();
      const dupB = [];
      const dupA = [];
      for (const row of before.rows) {
        const k = keyOfRow(row, keyColumns);
        if (bMap.has(k)) dupB.push(k);
        bMap.set(k, row);
      }
      for (const row of after.rows) {
        const k = keyOfRow(row, keyColumns);
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
            const fields = compareSharedCells(br, row, columnsShared);
            const metaChanges = compareRowMeta(br, row);
            if (fields.length || metaChanges.length) {
              changed.push({
                key: k,
                fields,
                ...(metaChanges.length ? { metaChanges } : {}),
              });
            }
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

  let missingCellRate = null;
  if (columnsShared.length && after.rows.length) {
    let missing = 0;
    const total = after.rows.length * columnsShared.length;
    for (const row of after.rows) {
      for (const c of columnsShared) {
        const p = cellPresence(row.cells, c);
        if (p === 'missing' || p === 'empty' || p === 'null') missing++;
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
    rowDrift.mode === 'duplicate-headers-blocked' ||
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
