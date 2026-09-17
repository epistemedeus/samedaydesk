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
]);

/** Real SDS files this corpus cold-reads. Needles are exact substrings. */
export const PIN_CITES = Object.freeze([
  {
    id: "observatory-contract",
    rel: "server/lib/observatory/contract.js",
    needles: [
      "Unavailable, partial, and stale are not zeros.",
      '  "demand",\n  "organic_demand",\n  "repeat_demand",',
      '"paid_demand_population"',
    ],
  },
  {
    id: "smithery-catalog",
    rel: "server/lib/observatory/adapters/smithery-mcp.js",
    needles: [
      "A catalog registration count is not paid demand, traffic, or unique customers.",
      "pagination.totalCount is catalog registrations. Registry listings are not traffic, paid customers, or heartbeats.",
      "available: false",
    ],
  },
  {
    id: "x402stats-organic",
    rel: "server/lib/observatory/adapters/x402stats.js",
    needles: [
      "Not independently verified organic demand and not a paid-customer count.",
      "not unique customers or organic demand proof",
      "organicSellers and organicVolumeUsd are provider heuristics, not unique customers or organic demand proof",
    ],
  },
  {
    id: "pulse-not-demand",
    rel: "server/lib/pulse.js",
    needles: [
      "Not durable, not cross-process unique, and not payment or demand evidence.",
      "An empty counts map does not mean zero tools/call",
      "Not unique agents, buyers, demand, payment, or protocol use.",
      "Not unique agents, buyers, demand, or payment.",
      "GET /mcp hits the MCP endpoint setup or purchase-return plain-text surface.",
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
    id: "issue-brief-not-demand",
    rel: "tools/recurring-job-recipes/lib/issue-evidence-brief.mjs",
    needles: ["notDemandSignal: true"],
  },
  {
    id: "issue-model-not-demand",
    rel: "tools/recurring-job-recipes/lib/issue-evidence-model.mjs",
    needles: ["notDemand: true"],
  },
  {
    id: "issue-to-work-brief-spec",
    rel: "tools/recurring-job-recipes/specs/issue-to-work-brief.recipe.json",
    needles: [
      '"notDemand": true',
      "Do not promote fixture or issue activity as demand.",
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
    id: "pricing-row-nonclaim",
    rel: "experiments/s163-record-recipes/docs/families/pricing-row-unit.md",
    needles: ["Presence, absence, or change of a row is not market demand."],
  },
  {
    id: "registry-consumer-snapshot",
    rel: "tools/presence/REGISTRY-CONSUMER.md",
    needles: ["This snapshot is not demand and not a publish."],
  },
  {
    id: "moltjobs-stats-nonclaim",
    rel: "server/lib/market-observations/moltjobs-stats-adapter.js",
    needles: ["demand, traffic, customers, settlement, or profit."],
  },
  {
    id: "owner-qa-issue-fixture",
    rel: "tools/recurring-job-recipes/fixtures/issues/samedaydesk-1.json",
    needles: ['"number": 1', "epistemedeus"],
  },
  {
    id: "evidence-records-prohibited",
    rel: "tools/evidence-records/catalog.json",
    needles: [
      "analytics_count_is_independent_demand",
      "catalog_presence_is_demand",
    ],
  },
  {
    id: "portfolio-handoff-not-observed",
    rel: "tools/portfolio-discovery/handoff.mjs",
    needles: ['demand: "not_observed"'],
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

/**
 * Cold-read real SDS artifacts. Fail closed if a pin file or needle is gone,
 * or if imported modules no longer withhold demand.
 */
export async function loadPins() {
  const scans = PIN_CITES.map((cite) => {
    try {
      return scanCite(cite);
    } catch (error) {
      return {
        id: cite.id,
        rel: cite.rel,
        abs: join(REPO_ROOT, cite.rel),
        ok: false,
        missingNeedles: cite.needles,
        error: { code: error.code || "PIN_READ", message: error.message },
      };
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
  } catch (error) {
    live.push({
      id: "import-observatory-withheld",
      rel: "server/lib/observatory/contract.js",
      ok: false,
      missingNeedles: [...REQUIRED_WITHHELD],
      error: { code: error.code || "PIN_IMPORT", message: error.message },
    });
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
    live.push({
      id: "import-smithery-descriptor",
      rel: "server/lib/observatory/adapters/smithery-mcp.js",
      ok: false,
      missingNeedles: ["doesNotEstablish:demand"],
      error: { code: error.code || "PIN_IMPORT", message: error.message },
    });
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
    live.push({
      id: "import-x402stats-descriptor",
      rel: "server/lib/observatory/adapters/x402stats.js",
      ok: false,
      missingNeedles: ["doesNotEstablish:organic demand proof"],
      error: { code: error.code || "PIN_IMPORT", message: error.message },
    });
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
    live.push({
      id: "import-work-brief-issue-1",
      rel: "tools/recurring-job-recipes/lib/work-brief.mjs",
      ok: false,
      missingNeedles: ["claims.notDemand"],
      error: { code: error.code || "PIN_IMPORT", message: error.message },
    });
  }

  try {
    const specPath = join(REPO_ROOT, "tools/recurring-job-recipes/specs/issue-to-work-brief.recipe.json");
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const missing = [];
    if (spec?.ownerQa?.notDemand !== true) missing.push("ownerQa.notDemand");
    live.push({
      id: "read-issue-to-work-brief-spec",
      rel: "tools/recurring-job-recipes/specs/issue-to-work-brief.recipe.json",
      ok: missing.length === 0,
      missingNeedles: missing,
    });
  } catch (error) {
    live.push({
      id: "read-issue-to-work-brief-spec",
      rel: "tools/recurring-job-recipes/specs/issue-to-work-brief.recipe.json",
      ok: false,
      missingNeedles: ["ownerQa.notDemand"],
      error: { code: error.code || "PIN_READ", message: error.message },
    });
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
    live.push({
      id: "import-handoff-claims",
      rel: "tools/portfolio-discovery/handoff.mjs",
      ok: false,
      missingNeedles: ["HANDOFF_CLAIMS.demand"],
      error: { code: error.code || "PIN_IMPORT", message: error.message },
    });
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
    live.push({
      id: "read-evidence-records-catalog",
      rel: "tools/evidence-records/catalog.json",
      ok: false,
      missingNeedles: ["analytics_count_is_independent_demand", "catalog_presence_is_demand"],
      error: { code: error.code || "PIN_READ", message: error.message },
    });
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
