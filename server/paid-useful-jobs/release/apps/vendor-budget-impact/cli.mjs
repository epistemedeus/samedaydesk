#!/usr/bin/env node
import path from "node:path";
import {
  assertArchivePins, recordRepeatBin, runNodeJson, writeJson, writeText, readJson, parseArgs, fixture, labelSample,
} from "../../lib/common.mjs";
import { envelope, digestObj } from "../../lib/artifact.mjs";
import { requireCallerInputs, resolveOutDir } from "../../lib/cli-runtime.mjs";

const APP = "vendor-budget-impact";
const OUTPUTS = ["budget-impact.json", "budget-impact.md"];

function validatePricingInput(file) {
  const json = readJson(file);
  const valid = json && typeof json === "object" && !Array.isArray(json)
    && Array.isArray(json.rows) && json.rows.every((row) =>
      row && typeof row === "object" && !Array.isArray(row)
      && typeof row.field === "string" && row.field.trim()
      && typeof row.value === "number" && Number.isFinite(row.value)
      && typeof row.unit === "string" && row.unit.trim());
  if (!valid) {
    const error = new Error("Pricing snapshots require a rows array with non-empty field and unit strings and finite numeric values.");
    error.code = "input-schema-mismatch";
    throw error;
  }
}

export function buildImpact(underlying, caller) {
  const outer = underlying?.report || underlying || {};
  const inner = outer.report || outer;
  const counts = inner.counts || {};
  const unitChanges = inner.unitChanges || [];
  const fieldChanges = inner.fieldChanges || [];
  const added = inner.added || [];
  const removed = inner.removed || [];
  const refused = underlying?.ok === false || inner.ok === false;
  const partial = (counts.conflicting || 0) > 0 || (counts.unknown || 0) > 0;
  const hasDelta =
    (counts.unitChanges || unitChanges.length) +
      (counts.fieldChanges || fieldChanges.length) +
      (counts.added || added.length) +
      (counts.removed || removed.length) >
    0;
  // Incomplete/conflicting evidence stays partial even without a known delta.
  const status = refused ? "refused" : partial ? "partial" : hasDelta ? "actionable" : "informational";
  const actions = [];
  for (const u of unitChanges) {
    actions.push({
      priority: "high",
      kind: "normalize-unit-before-budgeting",
      fieldKey: u.fieldKey,
      beforeUnit: u.beforeUnit,
      afterUnit: u.afterUnit,
      note: "Unit label changed; do not compare numeric fields until units match. No purchase authorized.",
    });
  }
  for (const f of fieldChanges) {
    actions.push({
      priority: "medium",
      kind: "review-price-field",
      fieldKey: f.fieldKey || f.key,
      beforeValue: f.beforeValue,
      afterValue: f.afterValue,
      unit: f.unit,
      ...(typeof f.unit === "string" && f.unit.trim() && Number.isFinite(f.beforeValue) && Number.isFinite(f.afterValue)
        ? { delta: f.afterValue - f.beforeValue } : {}),
      note: "Same-unit list-price field change in supplied snapshots. Delta is after minus before per stated unit, not a bill change or live quote.",
    });
  }
  for (const row of added) {
    actions.push({
      priority: "medium",
      kind: "review-added-price-field",
      fieldKey: row.fieldKey,
      afterValue: row.after.value,
      unit: row.after.unit,
      note: "Field appears in the after snapshot. Check source coverage and SKU identity; this does not establish a new vendor offering, a replacement, or a bill increase.",
    });
  }
  for (const row of removed) {
    actions.push({
      priority: "medium",
      kind: "review-removed-price-field",
      fieldKey: row.fieldKey,
      beforeValue: row.before.value,
      unit: row.before.unit,
      note: "Field is absent from the after snapshot. Check source coverage; absence does not establish retirement or a bill reduction.",
    });
  }
  if (!actions.length && !refused) {
    actions.push({
      priority: partial ? "high" : "low",
      kind: partial ? "resolve-conflicting-or-unknown-rows" : hasDelta ? "review-unresolved-price-delta" : "no-budget-delta",
      note: partial
        ? "Conflicting/unknown pricing evidence present; impact is non-final even without a known delta"
        : hasDelta
          ? "Row deltas were counted but field-level details are unavailable. Review source evidence."
          : "No row deltas detected in supplied snapshots. This does not establish an unchanged bill.",
    });
  }
  const art = envelope({
    appId: APP,
    status,
    summary: refused
      ? "Pricing compare refused"
      : `Pricing-row scan: added=${counts.added || added.length} removed=${counts.removed || removed.length} fieldChanges=${counts.fieldChanges || fieldChanges.length} unitChanges=${counts.unitChanges || unitChanges.length} conflicting=${counts.conflicting || 0} unknown=${counts.unknown || 0}`,
    actions,
    gaps: partial ? ["conflicting or unknown pricing rows present; treat impact as non-final"] : [],
    underlying: { family: "pricing-row-unit", counts, ok: !refused },
    caller: labelSample(caller),
  });
  art.purchaseAuthority = false;
  art.scope = {
    kind: "supplied-pricing-row-diff",
    billCalculation: false,
    liveQuote: false,
    unitsConverted: false,
    sourceCoverageVerified: false,
    note: "Caller supplies dated snapshots with stable field identity and comparable units. Actual usage and all tariff terms are required for a bill estimate.",
  };
  art.digest = digestObj({ status: art.status, actions: art.actions, counts, caller: art.caller, scope: art.scope });
  return art;
}

export function toMarkdown(art) {
  const lines = [
    "# Vendor budget impact (no purchase authority)",
    "",
    `Status: **${art.status}**`,
    "",
    art.summary,
    "",
    "## Recommended reviews",
  ];
  for (const a of art.actions) {
    lines.push(`- (${a.priority}) ${a.kind}${a.fieldKey ? `: \`${a.fieldKey}\`` : ""} - ${a.note}`);
  }
  for (const a of art.actions) {
    if (a.kind === "review-price-field") {
      lines.push("", `${a.fieldKey}: before=${a.beforeValue}; after=${a.afterValue}; unit=${a.unit}.`);
      if (a.delta !== undefined) lines.push(`List-price delta per stated unit: ${a.delta} (after minus before).`);
    } else if (a.kind === "review-added-price-field") {
      lines.push("", `${a.fieldKey}: after=${a.afterValue}; unit=${a.unit}.`);
    } else if (a.kind === "review-removed-price-field") {
      lines.push("", `${a.fieldKey}: before=${a.beforeValue}; unit=${a.unit}.`);
    }
  }
  lines.push("", "_Supplied pricing rows only. No live quote, unit conversion, bill calculation, or customer-demand evidence. Packaged examples are labeled samples._", "");
  return lines.join("\n");
}

export function run(args) {
  assertArchivePins();
  const mode = requireCallerInputs(args, ["before", "after"]);
  const exampleMode = mode.mode === "example";
  const before = exampleMode ? fixture("pricing/a/before.json") : args.before;
  const after = exampleMode ? fixture("pricing/a/after.json") : args.after;
  validatePricingInput(before);
  validatePricingInput(after);
  const outDir = resolveOutDir(APP, args, [before, after], OUTPUTS);
  const r = runNodeJson(recordRepeatBin(), [
    "run",
    "--family",
    "pricing-row-unit",
    "--before",
    before,
    "--after",
    after,
  ]);
  if (!r.json) throw new Error(`record-repeat failed: ${r.combined.slice(0, 800)}`);
  const art = buildImpact(r.json, {
    before,
    after,
    exampleMode,
    sampleLabel: exampleMode ? "explicit-example" : "caller-input",
  });
  writeJson(path.join(outDir, "budget-impact.json"), art);
  writeText(path.join(outDir, "budget-impact.md"), toMarkdown(art));
  art.outDir = outDir;
  return art;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const art = run(parseArgs(process.argv.slice(2)));
    process.stdout.write(
      JSON.stringify({
        ok: true,
        appId: APP,
        status: art.status,
        digest: art.digest,
        outDir: art.outDir,
        purchaseAuthority: false,
      }) + "\n",
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        refused: true,
        code: err.code || "error",
        error: err.message,
        detail: err.detail || null,
      }) + "\n",
    );
    process.exit(err.exitCode || 2);
  }
}
