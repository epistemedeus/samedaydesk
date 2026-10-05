import { SCHEMA, SCHEMA_VERSION, NOT_API_UPGRADE_BRIEF, NOT_OPENAPI } from "./paths.mjs";
import { createHashTermsAdapter } from "./hash-adapter.mjs";

export function buildTermsBody({
  kind,
  status,
  exampleMode,
  sample,
  impact,
  inputDigests,
  provenance,
}) {
  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    kind,
    usedOnly: true,
    notOpenApi: NOT_OPENAPI,
    notApiUpgradeBrief: NOT_API_UPGRADE_BRIEF,
    purchaseAuthority: false,
    sold: false,
    customerBrief: false,
    sample: Boolean(sample),
    exampleMode: Boolean(exampleMode),
    notMarketFact: true,
    notCustomerDemand: true,
    payment: {
      settling: false,
      prototype: true,
      paid: false,
    },
    provenance,
    inputs: inputDigests,
    impact,
    status,
  };
}

export function attachTermsVersion(brief, hashAdapter = createHashTermsAdapter()) {
  const termsVersion = hashAdapter.hashTermsVersion(brief);
  return { ...brief, termsVersion };
}

function typeLabel(fp) {
  if (!fp || fp.kind === "absent") return "absent";
  if (fp.kind === "boolean-schema") return fp.allows ? "true-schema" : "false-schema";
  if (fp.kind === "schema-object") {
    return Array.isArray(fp.type) ? fp.type.join("|") : fp.type || "untyped";
  }
  if (fp.kind === "example-value" || fp.kind === "literal") return fp.jsonType;
  if (fp.kind === "local-ref") return `ref ${fp.ref}`;
  return fp.kind;
}

export function toMarkdown(brief) {
  const lines = [
    "# JSON Schema / webhook used-path drift brief",
    "",
    `Status: **${brief.status}**`,
    `Kind: ${brief.kind}`,
    brief.exampleMode || brief.sample ? "Label: **SAMPLE** (not a customer brief)" : "Label: caller-input (still not a sale)",
    "",
    brief.summary,
    "",
    "This job is not OpenAPI and not api-upgrade-brief. Unused paths are ignored.",
    "Nonsettling prototype. purchaseAuthority=false. sold=false. customerBrief=false.",
    "",
    "## Breaking used-path changes",
  ];
  const breaking = brief.impact.breaking || [];
  if (!breaking.length) {
    lines.push("- none");
  } else {
    for (const row of breaking) {
      lines.push(
        `- \`${row.pointer}\`: ${row.reason} (${typeLabel(row.before)} -> ${typeLabel(row.after)})`,
      );
    }
  }
  lines.push("", "## Compatible used-path changes");
  const compatible = brief.impact.compatible || [];
  if (!compatible.length) {
    lines.push("- none");
  } else {
    for (const row of compatible) {
      lines.push(
        `- \`${row.pointer}\`: ${row.reason} (${typeLabel(row.before)} -> ${typeLabel(row.after)})`,
      );
    }
  }

  lines.push("", "## Deleted used paths");
  const deleted = brief.impact.deleted || [];
  if (!deleted.length) lines.push("- none");
  else for (const row of deleted) lines.push(`- \`${row.pointer}\``);

  lines.push("", "## Added used paths");
  const added = brief.impact.added || [];
  if (!added.length) lines.push("- none");
  else for (const row of added) lines.push(`- \`${row.pointer}\``);

  lines.push("", "## Unknown used paths");
  const unknown = brief.impact.unknown || [];
  if (!unknown.length) lines.push("- none");
  else {
    for (const row of unknown) {
      lines.push(`- \`${row.pointer}\`: ${row.reason} (unknown, not deleted)`);
    }
  }

  if (brief.exampleMode || brief.sample) {
    lines.push("", "SAMPLE output is not a customer brief, live webhook, or purchase authority.");
  }
  lines.push("", `_termsVersion: ${brief.termsVersion}_`, "");
  return `${lines.join("\n")}\n`;
}

export function summarize(impact, refused) {
  if (refused) return "Used-path comparison refused.";
  const breaking = (impact.breaking || []).length;
  const compatible = (impact.compatible || []).length;
  const deleted = (impact.deleted || []).length;
  const unknown = (impact.unknown || []).length;
  if (breaking + deleted > 0) {
    return `Used-path drift: ${breaking} breaking, ${compatible} compatible, ${deleted} deleted, ${unknown} unknown. Unused paths ignored.`;
  }
  if (unknown > 0) return `Partial used-path report: ${unknown} unknown pointer(s).`;
  if (compatible > 0) {
    return `Used-path drift: ${compatible} compatible weakening change(s). Valid analysis, not a transport failure.`;
  }
  return "No structural used-path drift. Not a runtime compatibility proof.";
}
