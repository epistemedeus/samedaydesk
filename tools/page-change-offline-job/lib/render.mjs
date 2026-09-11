export function renderMarkdown(report, { job } = {}) {
  const lines = [
    "# Page-change brief",
    "",
    "Offline compare of already-held `samedaydesk.extract-batch.v0` JSON. Does not fetch, pay, or import merchant `compare.mjs`.",
    "",
    `- verdict: **${report.verdict}**`,
    `- schema: ${report.schema}`,
    `- fields: ${report.fields.join(", ")}`,
    `- clock: ${report.provenance?.comparedWithClock ?? "missing"}`,
    `- freshness: ${report.freshness} (current/fresh stay false unless a later owner proves currency)`,
    `- usefulOutputProven: ${report.claims.usefulOutputProven}`,
    `- paymentImpliesUsefulOutput: ${report.claims.paymentImpliesUsefulOutput}`,
    `- charged is not useful output`,
    "",
    "## Summary",
    "",
    `| matched | missing | failed | unknown | coverageUnknown | semantic | order |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    `| ${report.summary.matched} | ${report.summary.missing} | ${report.summary.failed} | ${report.summary.unknown} | ${report.summary.coverageUnknown} | ${report.summary.semantic} | ${report.summary.order} |`,
    "",
  ];
  if (job?.id) {
    lines.push(`Job \`${job.id}\`${job.title ? `: ${job.title}` : ""}.`, "");
  }
  if (report.changes.length) {
    lines.push("## Changes", "");
    for (const change of report.changes) {
      lines.push(`- ${change.class} ${change.op} \`${change.path}\` \`${change.sourceKey ?? ""}\``);
      if (change.beforeEvidence !== undefined) lines.push(`  - before: ${change.beforeEvidence}`);
      if (change.afterEvidence !== undefined) lines.push(`  - after: ${change.afterEvidence}`);
    }
    lines.push("");
  } else {
    lines.push("No selected-field content changes recorded.", "");
  }
  if (report.coverageUnknown.length) {
    lines.push("## Coverage unknown", "");
    lines.push("Absent selected field is coverage unknown, not deletion.", "");
    for (const item of report.coverageUnknown) {
      lines.push(`- ${item.sourceKey ?? item.side ?? ""} ${item.field ?? item.code ?? item.reason}`);
    }
    lines.push("");
  }
  if (report.rows.missing.length || report.rows.failed.length) {
    lines.push("## Incomplete rows", "");
    for (const item of report.rows.missing) {
      lines.push(`- missing ${item.missingSide} ${item.sourceKey} status=${item.status}`);
    }
    for (const item of report.rows.failed) {
      lines.push(`- failed ${item.sourceKey} before=${item.before.status} after=${item.after.status}`);
    }
    lines.push("");
  }
  lines.push("", `termsVersion: \`${report.provenance.termsVersion}\``);
  lines.push(`engine: ${report.provenance.engine}@${report.provenance.engineVersion}`);
  lines.push(`merchantCompareImported: ${report.provenance.merchantCompareImported}`);
  lines.push(`networkUsed: ${report.provenance.networkUsed}`);
  return `${lines.join("\n")}\n`;
}

export function renderJson(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
