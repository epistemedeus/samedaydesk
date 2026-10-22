function lineForRoute(route) {
  const robots = route.robots ? ` robots=${route.robots}` : "";
  return `- \`${route.path}\` canonical=${route.canonical}${robots}`;
}

export function formatMarkdown(diff) {
  const lines = [
    "# Route table diff",
    "",
    `Published route table: **no**`,
    `SAMPLE fixture: **${diff.sample ? "yes" : "no"}**`,
    `Evidence class: before=${diff.evidenceClass.before}, after=${diff.evidenceClass.after}`,
    `Outcome: **${diff.outcome}**. Breaking: **${diff.breaking ? "yes" : "no"}**. Order changed: **${diff.orderChanged ? "yes" : "no"}**.`,
    `Before digest: \`${diff.tableDigest.before}\``,
    `After digest: \`${diff.tableDigest.after}\``,
    "",
    `Added: ${diff.counts.added}. Removed: ${diff.counts.removed}. Changed (canonical or robots): ${diff.counts.changed}. Collisions: ${diff.counts.collisions}.`,
    "",
    "## Added",
    "",
  ];
  if (!diff.added.length) lines.push("(none)");
  else for (const route of diff.added) lines.push(lineForRoute(route));
  lines.push("", "## Removed", "");
  if (!diff.removed.length) lines.push("(none)");
  else for (const route of diff.removed) lines.push(lineForRoute(route));
  lines.push("", "## Changed (canonical or robots)", "");
  if (!diff.changed.length) lines.push("(none)");
  else {
    for (const item of diff.changed) {
      const bits = item.fields.map((field) => {
        const from = item.before[field];
        const to = item.after[field];
        return `${field}: ${from ?? "(absent)"} -> ${to ?? "(absent)"}`;
      });
      lines.push(`- \`${item.path}\` ${bits.join("; ")}`);
    }
  }
  if (diff.titleOnly.length) {
    lines.push("", "## Title-only (not a canonical/robots change)", "");
    for (const item of diff.titleOnly) {
      lines.push(`- \`${item.path}\` ${item.before} -> ${item.after}`);
    }
  }
  if (diff.collisions.length) {
    lines.push("", "## Collisions (breaking)", "");
    for (const item of diff.collisions) {
      if (item.kind === "canonical") {
        lines.push(`- canonical \`${item.canonical}\` paths ${item.paths.map((p) => `\`${p}\``).join(", ")} (${item.side})`);
      } else {
        lines.push(`- path \`${item.path}\` appears ${item.indexes.length} times (${item.side})`);
      }
    }
  }
  lines.push(
    "",
    "This job does not rewrite the homepage, spa-route-shells.js, or live listings.",
    "SAMPLE catalogs are not the published route table.",
    "",
  );
  return lines.join("\n");
}
