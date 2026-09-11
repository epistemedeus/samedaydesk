function short(value) {
  if (!value) return "(missing)";
  if (value.length <= 40) return value;
  return `${value.slice(0, 24)}...`;
}

export function toMarkdown(report) {
  const lines = [
    "# Dependency-update trial",
    "",
    `Transport: **${report.transport.ok ? "ok" : "failed"}** (${report.transport.outcome})`,
    `Analysis: **${report.analysis.outcome}**`,
    `Engine status: ${report.engine.status || "(none)"}.`,
    `Valid refusal: ${report.analysis.validRefusal === true}. Valid no-change: ${report.analysis.validNoChange === true}.`,
    "",
    `Engine pin: \`${report.tested.engineSha}\` \`${report.tested.enginePath}\`.`,
    `Wrapper pin: \`${report.tested.wrapperSha}\` (catalog job still unbound).`,
    "",
  ];

  if (report.journey) {
    lines.push(
      `Journey: \`${report.journey.id}\` ${report.journey.beforeRef || ""} → ${report.journey.afterRef || ""}.`,
      `Lock path: \`${report.journey.lockPath || "package-lock.json"}\`.`,
      "",
    );
  }

  if (report.analysis.outcome === "refused") {
    lines.push(`Refusal code: \`${report.analysis.code}\`.`, "");
  }

  if (report.changed?.length) {
    lines.push("## Changed (engine pins + staged resolved)", "");
    for (const item of report.changed) {
      lines.push(`- \`${item.name}\` at \`${item.id}\``);
      if (item.changeKinds?.includes("version")) {
        lines.push(`  - version: ${item.before.version} -> ${item.after.version}`);
      }
      if (item.changeKinds?.includes("integrity")) {
        lines.push(`  - integrity: ${short(item.before.integrity)} -> ${short(item.after.integrity)}`);
      }
      if (item.changeKinds?.includes("resolved") || item.before.resolved !== item.after.resolved) {
        lines.push(`  - resolved: ${item.before.resolved} -> ${item.after.resolved}`);
      }
      lines.push(`  - pin termsHash: ${item.before.termsHash} -> ${item.after.termsHash}`);
    }
    lines.push("");
  }

  if (report.added?.length) {
    lines.push("## Added", "");
    for (const pin of report.added) {
      lines.push(`- \`${pin.name}@${pin.version}\` resolved ${pin.resolved || "(none)"}`);
    }
    lines.push("");
  }

  if (report.removed?.length) {
    lines.push("## Removed", "");
    for (const pin of report.removed) {
      lines.push(`- \`${pin.name}@${pin.version}\` resolved ${pin.resolved || "(none)"}`);
    }
    lines.push("");
  }

  if (report.omittedResolved?.length) {
    lines.push("## Resolved-source overlay (engine omitted these)", "");
    lines.push(
      "The pinned engine compares name+version+integrity only. These IDs have the same version and integrity, with a different `resolved` URL in the staged lockfiles.",
      "",
    );
    for (const item of report.omittedResolved) {
      lines.push(`- \`${item.name}\` at \`${item.id}\``);
      lines.push(`  - resolved: ${item.before.resolved} -> ${item.after.resolved}`);
    }
    lines.push("");
  }

  if (!report.changed?.length && !report.added?.length && !report.removed?.length && !report.omittedResolved?.length) {
    lines.push("No added, removed, changed, or resolved-only pins. Unchanged packages omitted.", "");
  }

  lines.push(
    "Offline. Not an npm install, audit, purchase, settlement, or customer demand claim.",
    `Purchase authority: ${report.payment.purchaseAuthority}. Field execution: ${report.payment.fieldExecution}.`,
    "",
  );
  return `${lines.join("\n")}\n`;
}
