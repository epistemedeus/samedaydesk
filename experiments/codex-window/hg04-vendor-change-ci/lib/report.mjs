import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function toMarkdown(result) {
  const lines = [
    "# Vendor change CI (no purchase authority)",
    "",
    `Wrapper status: **${result.wrapperStatus}**`,
    `Kit status: **${result.kitStatus || "not-run"}**`,
    `Machine action: **${result.machineAction.kind}** (ci=${result.machineAction.ci}, updateBaseline=false)`,
    "",
    result.summary,
    "",
    "## Truth",
    "",
    `- Schema: ${result.truth.schema.ok ? "ok" : "failed"}`,
    `- Unit comparable: ${result.truth.unit.unitComparable}`,
    `- Coverage complete: ${result.truth.coverage.complete}`,
    `- Membership added: ${result.truth.membership.added.join(", ") || "(none)"}`,
    `- Membership removed: ${result.truth.membership.removed.join(", ") || "(none)"}`,
    `- Membership shared: ${result.truth.membership.shared.join(", ") || "(none)"}`,
    "",
    result.truth.coverage.note,
    "",
    "## Independent same-unit arithmetic",
    "",
  ];
  if (!result.independentArithmetic.length) {
    lines.push("None. No same-field same-unit finite deltas.");
  } else {
    for (const row of result.independentArithmetic) {
      lines.push(`- \`${row.field}\`: ${row.before} -> ${row.after} (${row.unit}); delta ${row.delta} (after minus before). Not a bill.`);
    }
  }
  lines.push("", "## Kit actions", "");
  for (const action of result.kitActions || []) {
    lines.push(`- (${action.priority || "n/a"}) ${action.kind}${action.fieldKey ? `: \`${action.fieldKey}\`` : ""}`);
  }
  if (result.baseline?.compared) {
    lines.push("", "## Baseline", "", result.baseline.matched ? "Matched frozen expected.json." : "Mismatch. Baseline was not updated.");
  }
  lines.push(
    "",
    "## Honesty",
    "",
    `- invoiceClaim: ${result.invoiceClaim}`,
    `- forecast: ${result.forecast}`,
    `- purchaseAuthority: false`,
    `- updateBaseline: false`,
    "",
    result.billingNote,
    "",
    "_Supplied dated snapshots only. Not current market prices, customer demand, or a live quote._",
    "",
  );
  return lines.join("\n");
}

export function writeArtifacts(outDir, result) {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "vendor-change-ci.json");
  const mdPath = join(outDir, "vendor-change-ci.md");
  const actionPath = join(outDir, "machine-action.json");
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(mdPath, toMarkdown(result));
  writeFileSync(
    actionPath,
    `${JSON.stringify(
      {
        schema: "samedaydesk.hg04.vendor-change-ci.action.v1",
        ...result.machineAction,
        wrapperStatus: result.wrapperStatus,
        kitStatus: result.kitStatus,
        baselineMatched: result.baseline?.matched ?? null,
        baselineUpdated: false,
      },
      null,
      2,
    )}\n`,
  );
  return { jsonPath, mdPath, actionPath };
}
