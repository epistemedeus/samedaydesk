function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fieldKey(row) {
  return String(row.field).trim();
}

export function readCaptureFlag(snapshot) {
  const cap = snapshot?.capture;
  if (cap === "partial") return { complete: false, declared: false };
  if (isPlainObject(cap) && cap.complete === false) return { complete: false, declared: true };
  if (isPlainObject(cap) && cap.complete === true) return { complete: true, declared: true };
  return { complete: true, declared: false };
}

export function parsePricingSnapshot(json, label) {
  const errors = [];
  if (!isPlainObject(json)) {
    return { ok: false, label, errors: [`${label}: snapshot must be a JSON object`], rows: [], fields: [] };
  }
  if (!Array.isArray(json.rows)) {
    return { ok: false, label, errors: [`${label}: missing rows array`], rows: [], fields: [] };
  }
  const rows = [];
  json.rows.forEach((row, i) => {
    const at = `${label}.rows[${i}]`;
    if (!isPlainObject(row)) {
      errors.push(`${at}: row must be an object`);
      return;
    }
    if (typeof row.field !== "string" || !row.field.trim()) {
      errors.push(`${at}: field must be a non-empty string`);
    }
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
      errors.push(`${at}: value must be a finite number`);
    }
    if (typeof row.unit !== "string" || !row.unit.trim()) {
      errors.push(`${at}: unit must be a non-empty string`);
    }
    if (typeof row.field === "string" && row.field.trim() && typeof row.value === "number" && Number.isFinite(row.value) && typeof row.unit === "string" && row.unit.trim()) {
      rows.push({ field: row.field.trim(), value: row.value, unit: row.unit.trim() });
    }
  });
  const fields = [...new Set(rows.map(fieldKey))].sort();
  return { ok: errors.length === 0, label, errors, rows, fields, capture: readCaptureFlag(json) };
}

function indexByField(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = fieldKey(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export function conflictingFields(rows) {
  const out = [];
  for (const [field, group] of indexByField(rows)) {
    if (group.length < 2) continue;
    const units = new Set(group.map((r) => r.unit));
    const values = new Set(group.map((r) => r.value));
    if (units.size > 1 || values.size > 1) {
      out.push({ field, count: group.length, units: [...units], values: [...values] });
    }
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}

export function membershipTruth(beforeRows, afterRows) {
  const before = new Set(beforeRows.map(fieldKey));
  const after = new Set(afterRows.map(fieldKey));
  const added = [...after].filter((f) => !before.has(f)).sort();
  const removed = [...before].filter((f) => !after.has(f)).sort();
  const shared = [...before].filter((f) => after.has(f)).sort();
  return { added, removed, shared };
}

export function unitTruth(beforeRows, afterRows) {
  const before = indexByField(beforeRows);
  const after = indexByField(afterRows);
  const mismatches = [];
  const comparable = [];
  for (const field of [...before.keys()].filter((f) => after.has(f)).sort()) {
    const bUnits = [...new Set(before.get(field).map((r) => r.unit))];
    const aUnits = [...new Set(after.get(field).map((r) => r.unit))];
    if (bUnits.length === 1 && aUnits.length === 1 && bUnits[0] === aUnits[0]) {
      comparable.push({ field, unit: bUnits[0] });
    } else {
      mismatches.push({ field, beforeUnits: bUnits, afterUnits: aUnits });
    }
  }
  return { comparable, mismatches, unitComparable: mismatches.length === 0 };
}

export function coverageTruth({ beforeParsed, afterParsed, source }) {
  const declared = Array.isArray(source?.declaredFields)
    ? source.declaredFields.map((f) => String(f).trim()).filter(Boolean)
    : [];
  const afterFields = new Set(afterParsed.fields);
  const missingDeclared = declared.filter((f) => !afterFields.has(f)).sort();
  const captureIncomplete = beforeParsed.capture?.complete === false || afterParsed.capture?.complete === false || source?.capture?.complete === false;
  const complete = !captureIncomplete && missingDeclared.length === 0;
  return {
    complete,
    captureComplete: beforeParsed.capture?.complete !== false && afterParsed.capture?.complete !== false && source?.capture?.complete !== false,
    declaredFields: declared,
    missingDeclared,
    note: complete
      ? "Declared fields are present in the after snapshot."
      : "A supplied snapshot is an incomplete capture; missing fields are coverage holes, not retirements or confirmed additions.",
  };
}

export function independentArithmetic(beforeRows, afterRows) {
  const before = indexByField(beforeRows);
  const after = indexByField(afterRows);
  const out = [];
  for (const field of [...before.keys()].filter((f) => after.has(f)).sort()) {
    const b = before.get(field);
    const a = after.get(field);
    if (b.length !== 1 || a.length !== 1) continue;
    if (b[0].unit !== a[0].unit) continue;
    if (!Number.isFinite(b[0].value) || !Number.isFinite(a[0].value)) continue;
    const delta = a[0].value - b[0].value;
    if (!Number.isFinite(delta)) continue;
    out.push({
      field,
      before: b[0].value,
      after: a[0].value,
      delta,
      unit: b[0].unit,
    });
  }
  return out;
}

export function loadUsage(usage) {
  if (usage == null) {
    return { present: false, labeledHypothetical: false, measured: false };
  }
  if (!isPlainObject(usage)) {
    return { present: false, labeledHypothetical: false, measured: false, error: "usage must be an object" };
  }
  const labeledHypothetical = usage.label === "hypothetical" || usage.hypothetical === true;
  const measured = usage.measured === true || usage.kind === "measured-receipt";
  return { present: true, labeledHypothetical, measured, rows: usage.rows || null };
}

export function invoiceAndForecast(usageInfo) {
  const canBill = Boolean(usageInfo?.present && usageInfo.measured);
  return {
    invoiceClaim: false,
    forecast: false,
    usagePresent: Boolean(usageInfo?.present),
    usageMeasured: Boolean(usageInfo?.measured),
    note: canBill
      ? "Measured usage was supplied, but this consumer still does not emit an invoice or forecast. Pair list-price deltas with a separate billing system."
      : "No measured usage. List-price field deltas are not a bill, invoice, or forecast.",
  };
}

export function decideWrapperStatus({ schemaOk, unitComparable, coverageComplete, conflicts, kitStatus }) {
  if (!schemaOk) return "refused";
  if (!coverageComplete || !unitComparable || conflicts.length > 0) return "partial";
  if (kitStatus === "refused" || kitStatus === "partial" || kitStatus === "actionable" || kitStatus === "informational") {
    return kitStatus;
  }
  return "partial";
}

export function machineAction({ wrapperStatus, baselineMatched, invoiceClaim }) {
  const flags = {
    updateBaseline: false,
    purchaseAuthority: false,
    invoiceClaim: false,
    forecast: false,
  };
  if (invoiceClaim) {
    return { kind: "refuse-invoice-without-billing-system", ci: "fail", ...flags };
  }
  if (wrapperStatus === "refused") {
    return { kind: "refuse-input", ci: "fail", ...flags };
  }
  if (baselineMatched === false) {
    return { kind: "hold-baseline", ci: "fail", ...flags };
  }
  if (wrapperStatus === "partial") {
    return { kind: "resolve-partial-capture", ci: "fail", ...flags };
  }
  if (wrapperStatus === "actionable") {
    return { kind: "review-list-price-fields", ci: "pass", ...flags };
  }
  return { kind: "no-budget-delta", ci: "pass", ...flags };
}

export function evaluatePair({ beforeJson, afterJson, source = null, usage = null, kitArtifact = null }) {
  const before = parsePricingSnapshot(beforeJson, "before");
  const after = parsePricingSnapshot(afterJson, "after");
  const schemaOk = before.ok && after.ok;
  const schemaErrors = [...before.errors, ...after.errors];
  const conflicts = [...conflictingFields(before.rows), ...conflictingFields(after.rows)];
  const membership = membershipTruth(before.rows, after.rows);
  const unit = unitTruth(before.rows, after.rows);
  const coverage = coverageTruth({ beforeParsed: before, afterParsed: after, source });
  const arithmetic = independentArithmetic(before.rows, after.rows);
  const beforeIndex = indexByField(before.rows), afterIndex = indexByField(after.rows);
  const arithmeticOverflow = unit.comparable.some(({ field }) => {
    const b = beforeIndex.get(field), a = afterIndex.get(field);
    return b.length === 1 && a.length === 1 && !Number.isFinite(a[0].value - b[0].value);
  });
  const usageInfo = loadUsage(usage);
  const billing = invoiceAndForecast(usageInfo);
  const kitStatus = kitArtifact?.status || null;
  const wrapperStatus = decideWrapperStatus({
    schemaOk,
    unitComparable: unit.unitComparable,
    coverageComplete: coverage.complete && !arithmeticOverflow,
    conflicts,
    kitStatus,
  });
  return {
    schema: { ok: schemaOk, errors: schemaErrors },
    unit,
    coverage,
    membership,
    conflicts,
    independentArithmetic: arithmetic,
    arithmeticOverflow,
    usage: usageInfo,
    billing,
    wrapperStatus,
    kitStatus,
  };
}

export function baselineView(evalResult, kitCounts, action) {
  return {
    wrapperStatus: evalResult.wrapperStatus,
    kitStatus: evalResult.kitStatus,
    truth: {
      schemaOk: evalResult.schema.ok,
      unitComparable: evalResult.unit.unitComparable,
      coverageComplete: evalResult.coverage.complete,
      membership: evalResult.membership,
    },
    kitCounts: {
      added: kitCounts?.added ?? null,
      removed: kitCounts?.removed ?? null,
      fieldChanges: kitCounts?.fieldChanges ?? null,
      unitChanges: kitCounts?.unitChanges ?? null,
      conflicting: kitCounts?.conflicting ?? null,
      unknown: kitCounts?.unknown ?? null,
    },
    independentArithmetic: evalResult.independentArithmetic,
    invoiceClaim: false,
    forecast: false,
    purchaseAuthority: false,
    machineActionKind: action.kind,
    ci: action.ci,
    updateBaseline: false,
  };
}

function roundDelta(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  const scaled = value * 1e12;
  return Number.isFinite(scaled) ? Math.round(scaled) / 1e12 : value;
}

export function comparableBaseline(view) {
  return {
    wrapperStatus: view.wrapperStatus,
    kitStatus: view.kitStatus,
    truth: view.truth,
    kitCounts: view.kitCounts,
    independentArithmetic: (view.independentArithmetic || []).map((row) => ({
      field: row.field,
      before: row.before,
      after: row.after,
      delta: roundDelta(row.delta),
      unit: row.unit,
    })),
    invoiceClaim: false,
    forecast: false,
    purchaseAuthority: false,
    machineActionKind: view.machineActionKind,
    ci: view.ci,
    updateBaseline: false,
  };
}
