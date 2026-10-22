import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BOUNDARY, FEATURE, PRINCIPLE, REPO_ROOT, WRITE_BOUNDARY } from "./root.mjs";

export { BOUNDARY, FEATURE, PRINCIPLE, WRITE_BOUNDARY };

const REQUIRED_WITHHELD = Object.freeze([
  "demand",
  "organic_demand",
  "repeat_demand",
  "paid_demand_population",
  "conversion_funnel",
  "cross_source_total",
]);

/** Real SDS files this corpus cold-reads. Needles are exact substrings. */
export const PIN_CITES = Object.freeze([
  {
    id: "observatory-contract-zeros",
    rel: "server/lib/observatory/contract.js",
    needles: [
      "Unavailable, partial, and stale are not zeros.",
      "Sources are not additive.",
      "x402scan data endpoints require micropayment; documented only, never called as success",
    ],
  },
  {
    id: "moltjobs-composition",
    rel: "server/lib/observatory/adapters/moltjobs.js",
    needles: [
      "Missing is not zero. Sources are not additive.",
      "not a conversion from attention to paid demand",
      "Not a conversion-funnel denominator.",
      "Marketplace paid-activity metrics are missing, not zero.",
    ],
  },
  {
    id: "moltjobs-stats-nonclaim",
    rel: "server/lib/market-observations/moltjobs-stats-adapter.js",
    needles: ["demand, traffic, customers, settlement, or profit."],
  },
  {
    id: "market-stats-missing-not-zero",
    rel: "server/lib/market-observations/normalize-market-stats.js",
    needles: ["does not treat missing as zero"],
  },
  {
    id: "x402stats-series-buyers",
    rel: "server/lib/observatory/adapters/x402stats.js",
    needles: [
      "Series buyers are not summed into snapshot metrics and are not classified as unique humans.",
      "organicSellers and organicVolumeUsd are provider heuristics, not unique customers or organic demand proof",
    ],
  },
  {
    id: "smithery-catalog",
    rel: "server/lib/observatory/adapters/smithery-mcp.js",
    needles: [
      "A catalog registration count is not paid demand, traffic, or unique customers.",
      "pagination.totalCount is catalog registrations. Registry listings are not traffic, paid customers, or heartbeats.",
    ],
  },
  {
    id: "pulse-not-demand",
    rel: "server/lib/pulse.js",
    needles: [
      "Not durable, not cross-process unique, and not payment or demand evidence.",
      "An empty counts map does not mean zero tools/call",
      "GET /mcp hits the MCP endpoint setup or purchase-return plain-text surface.",
      "Not unique agents, buyers, demand, payment, or protocol use.",
    ],
  },
  {
    id: "paid-activity-explicit",
    rel: "server/scripts/test-observatory-paid-activity-other.js",
    needles: ["paidActivity must be present so absence of paid demand is explicit"],
  },
  {
    id: "work-brief-not-demand",
    rel: "tools/recurring-job-recipes/lib/work-brief.mjs",
    needles: [
      "Owner QA only — not demand or network claims.",
      "notDemand: true",
      "Owner QA only (not demand)",
    ],
  },
  {
    id: "machine-entry-discovery",
    rel: "client/src/data/machineEntry.mjs",
    needles: [
      "Owner QA issues are not demand.",
      "Discovery is not authorization, settlement,",
      "demand, or revenue.",
    ],
  },
  {
    id: "presence-snapshot-nonclaim",
    rel: "tools/presence/REGISTRY-CONSUMER.md",
    needles: ["This snapshot is not demand and not a publish."],
  },
  {
    id: "for-agents-cold-read-nonclaim",
    rel: "tools/presence/FOR-AGENTS-COLD-READ.md",
    needles: ["not evidence of independent demand or a diagnosis of every failed request."],
  },
  {
    id: "pricing-row-nonclaim",
    rel: "experiments/s163-record-recipes/docs/families/pricing-row-unit.md",
    needles: ["Presence, absence, or change of a row is not market demand."],
  },
  {
    id: "scoped-no-change-nonclaim",
    rel: "experiments/s163-record-recipes/docs/consumers/next-run-manifest.md",
    needles: ["Scoped no-change is not runtime compatibility, not demand, not ROI."],
  },
  {
    id: "buyer-setup-not-demand",
    rel: "tools/recurring-job-recipes/recipes/buyer-setup-trace.mjs",
    needles: ["notDemand: true", "paymentSent: false"],
  },
  {
    id: "evidence-records-prohibited",
    rel: "tools/evidence-records/catalog.json",
    needles: [
      "analytics_count_is_independent_demand",
      "catalog_presence_is_demand",
    ],
  },
]);

function readCite(rel) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) {
    const err = new Error(`missing pin cite ${rel}`);
    err.code = "PIN_MISSING";
    throw err;
  }
  return { abs, rel, text: readFileSync(abs, "utf8") };
}

function scanCite(cite) {
  const { abs, rel, text } = readCite(cite.rel);
  const missing = cite.needles.filter((needle) => !text.includes(needle));
  return {
    id: cite.id,
    rel,
    abs,
    ok: missing.length === 0,
    missingNeedles: missing,
    bytes: Buffer.byteLength(text),
  };
}

async function importRepoModule(rel) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) {
    const err = new Error(`missing pin module ${rel}`);
    err.code = "PIN_MISSING";
    throw err;
  }
  return import(pathToFileURL(abs).href);
}

function includesAll(list, required) {
  const set = new Set(Array.isArray(list) ? list : []);
  return required.filter((item) => !set.has(item));
}

function failRow(id, rel, missingNeedles, error) {
  return {
    id,
    rel,
    abs: join(REPO_ROOT, rel),
    ok: false,
    missingNeedles,
    error: error ? { code: error.code || "PIN_IMPORT", message: error.message } : undefined,
  };
}

/**
 * Cold-read real SDS artifacts. Fail closed if a pin file or needle is gone,
 * or if imported modules no longer withhold demand. Never fetches, never pays.
 */
export async function loadPins() {
  const scans = PIN_CITES.map((cite) => {
    try {
      return scanCite(cite);
    } catch (error) {
      return failRow(cite.id, cite.rel, cite.needles, error);
    }
  });

  const live = [];

  try {
    const contract = await importRepoModule("server/lib/observatory/contract.js");
    const missingWithheld = includesAll(contract.WITHHELD_CONCLUSIONS, REQUIRED_WITHHELD);
    live.push({
      id: "import-observatory-withheld",
      rel: "server/lib/observatory/contract.js",
      ok: missingWithheld.length === 0,
      missingNeedles: missingWithheld,
      withheldConclusions: [...(contract.WITHHELD_CONCLUSIONS || [])],
    });

    const documented = [...(contract.DOCUMENTED_UNAVAILABLE_SOURCES || [])];
    const x402scan = documented.find((row) => row.sourceId === "x402scan");
    const scanMissing = [];
    if (!x402scan) scanMissing.push("sourceId:x402scan");
    if (x402scan && x402scan.called !== false) scanMissing.push("x402scan.called:false");
    if (x402scan && x402scan.availability !== "unavailable") scanMissing.push("x402scan.availability:unavailable");
    if (x402scan && !String(x402scan.reason || "").includes("never called as success")) {
      scanMissing.push("x402scan.reason:never called as success");
    }
    if (x402scan && !(x402scan.withheldConclusions || []).includes("demand")) {
      scanMissing.push("x402scan.withheld:demand");
    }
    live.push({
      id: "import-x402scan-documented-unavailable",
      rel: "server/lib/observatory/contract.js",
      ok: scanMissing.length === 0,
      missingNeedles: scanMissing,
      sourceId: x402scan?.sourceId || null,
      called: x402scan?.called ?? null,
      availability: x402scan?.availability || null,
    });
  } catch (error) {
    live.push(failRow("import-observatory-withheld", "server/lib/observatory/contract.js", [...REQUIRED_WITHHELD], error));
    live.push(failRow("import-x402scan-documented-unavailable", "server/lib/observatory/contract.js", ["sourceId:x402scan"], error));
  }

  try {
    const moltjobs = await importRepoModule("server/lib/observatory/adapters/moltjobs.js");
    const doesNot = [...(moltjobs.descriptor?.doesNotEstablish || [])];
    const missing = [];
    if (!doesNot.includes("a registration-to-paid conversion funnel")) {
      missing.push("doesNotEstablish:a registration-to-paid conversion funnel");
    }
    if (!doesNot.includes("cross-market totals")) missing.push("doesNotEstablish:cross-market totals");
    live.push({
      id: "import-moltjobs-descriptor",
      rel: "server/lib/observatory/adapters/moltjobs.js",
      ok: missing.length === 0,
      missingNeedles: missing,
      doesNotEstablish: doesNot,
    });

    const paid = moltjobs.buildPaidActivity({}, {});
    const refused = [...(paid?.block?.refusedRatios || [])];
    const paidMissing = [];
    if (!refused.some((row) => row.key === "marketplaceJobs_over_totalJobs_as_conversion")) {
      paidMissing.push("refusedRatios:marketplaceJobs_over_totalJobs_as_conversion");
    }
    if (paid?.block?.available !== false) paidMissing.push("paidActivity.available:false");
    if (!(paid?.block?.doesNotEstablish || []).includes("a registration-to-paid conversion funnel")) {
      paidMissing.push("paidActivity.doesNotEstablish:conversion funnel");
    }
    live.push({
      id: "import-moltjobs-paid-activity-refused-ratio",
      rel: "server/lib/observatory/adapters/moltjobs.js",
      ok: paidMissing.length === 0,
      missingNeedles: paidMissing,
      available: paid?.block?.available ?? null,
      refusedRatioKeys: refused.map((row) => row.key),
    });
  } catch (error) {
    live.push(failRow("import-moltjobs-descriptor", "server/lib/observatory/adapters/moltjobs.js", ["doesNotEstablish:conversion funnel"], error));
    live.push(failRow("import-moltjobs-paid-activity-refused-ratio", "server/lib/observatory/adapters/moltjobs.js", ["refusedRatios"], error));
  }

  try {
    const smithery = await importRepoModule("server/lib/observatory/adapters/smithery-mcp.js");
    const doesNot = [...(smithery.descriptor?.doesNotEstablish || [])];
    const withheld = [...(smithery.descriptor?.withheldConclusions || [])];
    const missing = [];
    if (!doesNot.includes("demand")) missing.push("doesNotEstablish:demand");
    if (!withheld.includes("paid_demand_population")) missing.push("withheld:paid_demand_population");
    if (!withheld.includes("demand")) missing.push("withheld:demand");
    live.push({
      id: "import-smithery-descriptor",
      rel: "server/lib/observatory/adapters/smithery-mcp.js",
      ok: missing.length === 0,
      missingNeedles: missing,
      doesNotEstablish: doesNot,
    });
  } catch (error) {
    live.push(failRow("import-smithery-descriptor", "server/lib/observatory/adapters/smithery-mcp.js", ["doesNotEstablish:demand"], error));
  }

  try {
    const x402 = await importRepoModule("server/lib/observatory/adapters/x402stats.js");
    const doesNot = [...(x402.descriptor?.doesNotEstablish || [])];
    const withheld = [...(x402.descriptor?.withheldConclusions || [])];
    const missing = [];
    if (!doesNot.includes("organic demand proof")) missing.push("doesNotEstablish:organic demand proof");
    if (!doesNot.includes("repeat demand")) missing.push("doesNotEstablish:repeat demand");
    if (!withheld.includes("organic_demand_proof")) missing.push("withheld:organic_demand_proof");
    if (!withheld.includes("paid_demand_population")) missing.push("withheld:paid_demand_population");
    live.push({
      id: "import-x402stats-descriptor",
      rel: "server/lib/observatory/adapters/x402stats.js",
      ok: missing.length === 0,
      missingNeedles: missing,
      doesNotEstablish: doesNot,
    });
  } catch (error) {
    live.push(failRow("import-x402stats-descriptor", "server/lib/observatory/adapters/x402stats.js", ["doesNotEstablish:organic demand proof"], error));
  }

  try {
    const stats = await importRepoModule("server/lib/market-observations/normalize-market-stats.js");
    const missing = [];
    if (!(stats.WITHHELD_CONCLUSIONS || []).includes("demand")) missing.push("WITHHELD_CONCLUSIONS:demand");
    live.push({
      id: "import-normalize-market-stats-withheld",
      rel: "server/lib/market-observations/normalize-market-stats.js",
      ok: missing.length === 0,
      missingNeedles: missing,
      withheldConclusions: [...(stats.WITHHELD_CONCLUSIONS || [])],
    });
  } catch (error) {
    live.push(failRow("import-normalize-market-stats-withheld", "server/lib/market-observations/normalize-market-stats.js", ["WITHHELD_CONCLUSIONS:demand"], error));
  }

  try {
    const { listCatalog } = await importRepoModule("server/lib/observatory/registry.js");
    const catalog = listCatalog();
    const documented = [...(catalog.documentedUnavailable || [])];
    const x402scan = documented.find((row) => row.sourceId === "x402scan");
    const missing = [];
    if (catalog.additivity !== "not_additive") missing.push("additivity:not_additive");
    if (!x402scan) missing.push("documentedUnavailable:x402scan");
    if (x402scan && x402scan.called !== false) missing.push("x402scan.called:false");
    live.push({
      id: "import-registry-catalog-x402scan",
      rel: "server/lib/observatory/registry.js",
      ok: missing.length === 0,
      missingNeedles: missing,
      additivity: catalog.additivity || null,
      sourceIds: (catalog.sources || []).map((row) => row.sourceId),
    });
  } catch (error) {
    live.push(failRow("import-registry-catalog-x402scan", "server/lib/observatory/registry.js", ["x402scan"], error));
  }

  try {
    const { preparePricingTable } = await importRepoModule(
      "experiments/s163-record-recipes/adapters/pricing-row-unit.mjs",
    );
    const empty = preparePricingTable({ rows: [] });
    const okPrep = preparePricingTable([{ field: "unit", value: 1, unit: "USD" }]);
    const missing = [];
    if (!empty?.refused || empty.code !== "empty-pricing-rows") missing.push("empty-pricing-rows");
    if (empty?.paidValueClaim !== false) missing.push("empty.paidValueClaim:false");
    if (okPrep?.paidValueClaim !== false) missing.push("ok.paidValueClaim:false");
    live.push({
      id: "import-pricing-empty-rows-refuse",
      rel: "experiments/s163-record-recipes/adapters/pricing-row-unit.mjs",
      ok: missing.length === 0,
      missingNeedles: missing,
      emptyCode: empty?.code || null,
      paidValueClaim: okPrep?.paidValueClaim ?? null,
    });
  } catch (error) {
    live.push(failRow("import-pricing-empty-rows-refuse", "experiments/s163-record-recipes/adapters/pricing-row-unit.mjs", ["empty-pricing-rows"], error));
  }

  try {
    const { buildWorkBrief } = await importRepoModule("tools/recurring-job-recipes/lib/work-brief.mjs");
    const fixturePath = join(REPO_ROOT, "tools/recurring-job-recipes/fixtures/issues/samedaydesk-1.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const brief = buildWorkBrief(fixture.issue, { clock: fixture.observedAt, source: "fixture" });
    const missing = [];
    if (brief?.claims?.notDemand !== true) missing.push("claims.notDemand");
    if (brief?.claims?.ownerQaOnly !== true) missing.push("claims.ownerQaOnly");
    live.push({
      id: "import-work-brief-issue-1",
      rel: "tools/recurring-job-recipes/lib/work-brief.mjs",
      ok: missing.length === 0,
      missingNeedles: missing,
      claims: brief?.claims || null,
      issueNumber: fixture.issue?.number ?? null,
    });
  } catch (error) {
    live.push(failRow("import-work-brief-issue-1", "tools/recurring-job-recipes/lib/work-brief.mjs", ["claims.notDemand"], error));
  }

  try {
    const handoff = await importRepoModule("tools/portfolio-discovery/handoff.mjs");
    const missing = [];
    if (handoff.HANDOFF_CLAIMS?.demand !== "not_observed") missing.push("HANDOFF_CLAIMS.demand");
    live.push({
      id: "import-handoff-claims",
      rel: "tools/portfolio-discovery/handoff.mjs",
      ok: missing.length === 0,
      missingNeedles: missing,
      demand: handoff.HANDOFF_CLAIMS?.demand ?? null,
    });
  } catch (error) {
    live.push(failRow("import-handoff-claims", "tools/portfolio-discovery/handoff.mjs", ["HANDOFF_CLAIMS.demand"], error));
  }

  try {
    const catalogPath = join(REPO_ROOT, "tools/evidence-records/catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    const prohibited = Array.isArray(catalog.prohibitedInferences) ? catalog.prohibitedInferences : [];
    const missing = [];
    if (!prohibited.includes("analytics_count_is_independent_demand")) {
      missing.push("analytics_count_is_independent_demand");
    }
    if (!prohibited.includes("catalog_presence_is_demand")) {
      missing.push("catalog_presence_is_demand");
    }
    live.push({
      id: "read-evidence-records-catalog",
      rel: "tools/evidence-records/catalog.json",
      ok: missing.length === 0,
      missingNeedles: missing,
      prohibitedInferences: prohibited,
    });
  } catch (error) {
    live.push(failRow("read-evidence-records-catalog", "tools/evidence-records/catalog.json", ["analytics_count_is_independent_demand", "catalog_presence_is_demand"], error));
  }

  const rows = [...scans, ...live];
  const failed = rows.filter((row) => !row.ok);
  return {
    ok: failed.length === 0,
    principle: PRINCIPLE,
    boundary: { ...BOUNDARY },
    repoRoot: REPO_ROOT,
    total: rows.length,
    failed: failed.length,
    rows,
    error: failed.length
      ? {
          code: failed.some((row) => row.error?.code === "PIN_MISSING") ? "PIN_MISSING" : "PIN_DRIFT",
          message: `${failed.length} SDS pin(s) missing or drifted`,
          failed: failed.map((row) => ({
            id: row.id,
            rel: row.rel,
            missingNeedles: row.missingNeedles,
            error: row.error || null,
          })),
        }
      : null,
  };
}
