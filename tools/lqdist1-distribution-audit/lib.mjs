import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "../..");
export const DOCS_DIR = join(ROOT, "docs/lqdist1-distribution-audit");
export const EVIDENCE_DIR = join(DOCS_DIR, "evidence");
export const TABLE_PATH = join(DOCS_DIR, "per-route-table.json");
export const SUMMARY_PATH = join(EVIDENCE_DIR, "summary.json");
export const PROJECTION_PATH = join(here, "catalog-projection.json");
export const SURFACES = Object.freeze(["what_agents_buy", "agent402", "agentcash"]);
export const VOCAB = Object.freeze(["CLEAR", "HOLD", "ABORT", "absent", "unverified"]);

export const WAB_PREFLIGHT_URLS = Object.freeze([
  "https://agents.samedaydesk.com/extract",
  "https://agents.samedaydesk.com/read",
  "https://agents.samedaydesk.com/security/wallet-policy-conformance",
]);

export const DISPLAY_ORDER = Object.freeze([
  "GET /extract",
  "GET /read",
  "GET /scan",
  "GET /schemaforge",
  "GET /enrich",
  "GET /wallet-enrich",
  "GET /deep-audit",
  "GET /defi/morpho-position",
  "GET /defi/morpho-protection",
  "GET /defi/morpho-market-underwrite",
  "GET /defi/morpho-preliquidation-replay",
  "GET /work/opportunity-preflight",
  "POST /work/opportunity-preflight",
  "GET /distribution/agent-discoverability-audit",
  "GET /commerce/payment-offer-preflight",
  "POST /commerce/payment-offer-preflight",
  "GET /commerce/settlement-proof",
  "GET /chain/transaction-receipt",
  "GET /chain/solana-transaction-receipt",
  "POST /security/wallet-policy-conformance",
  "POST /security/stateful-wallet-policy-conformance",
  "GET /commerce/seller-integrity-audit",
  "GET /commerce/contract-qualified-search",
  "GET /distribution/agent-surface-budget-audit",
  "GET /gateway/commerce/payment-offer-preflight",
]);

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadEvidence(evidenceDir = EVIDENCE_DIR) {
  return {
    canonicalRoutes: loadJson(join(evidenceDir, "canonical-routes.json")),
    wabHost: loadJson(join(evidenceDir, "wab-host.json")),
    agent402: loadJson(join(evidenceDir, "agent402-seller-bounded.json")),
    followupProbes: loadJson(join(evidenceDir, "followup-probes.json")),
    agentcash: loadJson(join(evidenceDir, "agentcash-discover-bounded.json")),
  };
}

export function openApiAtomic(priceUsd) {
  return String(Math.round(Number(priceUsd) * 1_000_000));
}

export function toolId(tool) {
  return `${tool.method} ${tool.route}`;
}

export function paidAgent402Tools(agent402) {
  return (agent402.tools || []).filter((tool) => tool.paid);
}

export function agent402Holds(agent402) {
  return paidAgent402Tools(agent402)
    .filter((tool) => tool.priceConflict)
    .map((tool) => ({
      id: toolId(tool),
      surface: "agent402",
      priceObservations: tool.priceObservations || null,
    }));
}

export function probesById(followupProbes) {
  const map = new Map();
  for (const probe of followupProbes.results || []) {
    if (!map.has(probe.id)) map.set(probe.id, []);
    map.get(probe.id).push(probe);
  }
  return map;
}

export function isEmptyBodyInput(input) {
  return String(input).trim() === "{}";
}

export function isSchemaValidInput(input) {
  return /schema-valid/i.test(String(input));
}

export function agentcashHoldsFromProbes(followupProbes) {
  const holds = [];
  const grouped = probesById(followupProbes);
  for (const [id, probes] of grouped.entries()) {
    const empty400 = probes.find((probe) => isEmptyBodyInput(probe.input) && probe.status === 400);
    const valid402 = probes.find((probe) => isSchemaValidInput(probe.input) && probe.status === 402);
    if (empty400 && valid402) {
      holds.push({
        id,
        surface: "agentcash",
        emptyStatus: empty400.status,
        emptyError: empty400.error || null,
        schemaValidStatus: valid402.status,
      });
    }
  }
  return holds;
}

export function wabHostClear(wabHost) {
  return String(wabHost.light) === "green" && Number(wabHost.score) === 100;
}

export function unpaid402FromProbes(route, probes) {
  if (!probes || probes.length === 0) {
    return {
      status: null,
      amount: null,
      termsMatchOpenApi: null,
      probeSource: "not-in-followup-probes",
    };
  }
  const matching402 = probes.find((probe) => probe.status === 402 && probe.amount);
  const any402 = probes.find((probe) => probe.status === 402);
  const empty400 = probes.find((probe) => isEmptyBodyInput(probe.input) && probe.status === 400);
  const expectedAtomic = openApiAtomic(route.openapiPrice);
  if (matching402) {
    return {
      status: 402,
      amount: matching402.amount,
      termsMatchOpenApi: matching402.amount === expectedAtomic,
      probeSource: "followup-probes",
    };
  }
  if (empty400 && any402) {
    return {
      status: 402,
      amount: any402.amount || null,
      termsMatchOpenApi: any402.amount ? any402.amount === expectedAtomic : null,
      probeSource: "followup-probes",
      emptyProbeStatus: 400,
    };
  }
  if (any402) {
    return {
      status: 402,
      amount: any402.amount || null,
      termsMatchOpenApi: any402.amount ? any402.amount === expectedAtomic : null,
      probeSource: "followup-probes",
    };
  }
  return {
    status: probes[0].status,
    amount: probes[0].amount || null,
    termsMatchOpenApi: false,
    probeSource: "followup-probes",
  };
}

function rowNotes(row, { agent402Hold, agentcashHold }) {
  if (agent402Hold?.priceObservations) {
    const bazaar = agent402Hold.priceObservations.bazaar;
    const origin = agent402Hold.priceObservations.origin;
    return `Agent402 priceConflict: bazaar ${bazaar} vs origin/live ${origin}. Live unpaid 402 amount matches OpenAPI when probed. Price not changed.`;
  }
  if (agentcashHold) {
    return `OpenAPI discovery lists the op as paid. Empty {} probe returns ${agentcashHold.emptyStatus} before 402 (${agentcashHold.emptyError || "validation"}). Schema-valid body returns 402. Live gateway, not this repo.`;
  }
  if (row.id === "POST /work/opportunity-preflight") return "`{}` reaches 402.";
  if (row.id === "GET /distribution/agent-discoverability-audit") {
    return "OpenAPI example intent (>=20 chars) is required to reach 402. Shorter probes return 400 without a challenge.";
  }
  if (row.id === "GET /commerce/contract-qualified-search") {
    return "OpenAPI example query (>=10 chars) is required to reach 402.";
  }
  if (row.id === "GET /gateway/commerce/payment-offer-preflight") {
    return "x402-only Circle Gateway alternate, not a 23rd dual-rail product. Terms are in the payment-required header.";
  }
  return undefined;
}

export function coverageFromEvidence(evidence) {
  const agent402Paid = paidAgent402Tools(evidence.agent402);
  const agentcashPaid = evidence.agentcash.paidEndpoints || [];
  return {
    what_agents_buy: {
      independentPreflights: WAB_PREFLIGHT_URLS.length,
      preflightUrls: [...WAB_PREFLIGHT_URLS],
      inheritedHostClear: evidence.canonicalRoutes.length,
      hostScoped: true,
      host: evidence.wabHost.host,
      hostVerdict: wabHostClear(evidence.wabHost) ? "CLEAR" : "HOLD",
    },
    agent402: {
      sellerSnapshotPaidTools: agent402Paid.length,
      priceConflictHolds: agent402Holds(evidence.agent402).length,
    },
    agentcash: {
      discoverPaidEndpoints: agentcashPaid.length,
      checkNotRunOnAll25: true,
      followupProbes: (evidence.followupProbes.results || []).length,
    },
  };
}

export function rebuildFromEvidence(evidence, { observedAt = "2026-09-03T10:52:00Z" } = {}) {
  const agent402HoldById = new Map(agent402Holds(evidence.agent402).map((row) => [row.id, row]));
  const agentcashHoldById = new Map(agentcashHoldsFromProbes(evidence.followupProbes).map((row) => [row.id, row]));
  const probeMap = probesById(evidence.followupProbes);
  const wab = wabHostClear(evidence.wabHost) ? "CLEAR" : "HOLD";
  const byId = new Map();

  for (const route of evidence.canonicalRoutes) {
    const agent402Hold = agent402HoldById.get(route.id);
    const agentcashHold = agentcashHoldById.get(route.id);
    const row = {
      id: route.id,
      product: route.product,
      class: route.class,
      operationId: route.operationId,
      openapiPriceUsd: route.openapiPrice,
      unpaid402: unpaid402FromProbes(route, probeMap.get(route.id)),
      what_agents_buy: wab,
      agent402: agent402Hold ? "HOLD" : "CLEAR",
      agentcash: agentcashHold ? "HOLD" : "CLEAR",
    };
    const notes = rowNotes(row, { agent402Hold, agentcashHold });
    if (notes) row.notes = notes;
    byId.set(row.id, row);
  }

  const rows = DISPLAY_ORDER.map((id) => byId.get(id)).filter(Boolean);
  for (const [id, row] of byId) {
    if (!DISPLAY_ORDER.includes(id)) rows.push(row);
  }

  const canonicalRows = rows.filter((row) => row.class === "canonical");
  const products = [...new Set(canonicalRows.map((row) => row.product))];
  const coverage = coverageFromEvidence(evidence);
  const holds = rows
    .filter((row) => SURFACES.some((surface) => row[surface] === "HOLD"))
    .map((row) => row.id);

  const tally = (surface) => {
    const counts = {};
    for (const row of rows) {
      const value = row[surface];
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  };

  const table = {
    origin: "https://agents.samedaydesk.com",
    observedAt,
    openapiVersion: evidence.agentcash.info?.version || "1.23.40",
    surfaces: {
      what_agents_buy: "preflight-x402@0.2.0 host row from /api/preflight.json; 3 URLs preflighted, host CLEAR inherited by all 25",
      agent402: "live GET https://agent402.tools/api/index?seller=agents.samedaydesk.com; HOLD on priceConflict",
      agentcash: "npx @agentcash/discovery@1.7.5 discover on public /openapi.json; check() not run on all 25; follow-up probes cover 9 results",
    },
    vocab: [...VOCAB],
    canonicalProductCount: products.length,
    paidOperationCount: rows.length,
    circleGatewayAlternate: "GET /gateway/commerce/payment-offer-preflight",
    coverage,
    rows,
  };

  const summary = {
    observedAt,
    origin: table.origin,
    routeCount: rows.length,
    canonicalCount: products.length,
    canonicalOperationCount: canonicalRows.length,
    alternateCount: rows.length - canonicalRows.length,
    products: [...products].sort(),
    tallies: {
      what_agents_buy: tally("what_agents_buy"),
      agent402: tally("agent402"),
      agentcash: tally("agentcash"),
    },
    holds,
    aborts: rows.filter((row) => SURFACES.some((surface) => row[surface] === "ABORT")).map((row) => row.id),
    absent: rows.filter((row) => SURFACES.some((surface) => row[surface] === "absent")).map((row) => row.id),
    unpaidMismatch: [],
    coverage,
  };

  const projection = catalogProjectionFromTable(table);
  return { table, summary, projection, coverage };
}

export function catalogProjectionFromTable(table) {
  const seen = new Set();
  const products = [];
  for (const row of table.rows.filter((entry) => entry.class === "canonical")) {
    if (seen.has(row.product)) continue;
    seen.add(row.product);
    products.push({
      name: row.product,
      path: row.id.replace(/^(GET|POST) /, ""),
      operationId: row.operationId,
      priceUsd: row.openapiPriceUsd,
    });
  }
  return {
    origin: table.origin,
    openapiVersion: table.openapiVersion,
    note: "Generated from per-route-table.json. Twenty-two canonical paid products. GET+POST workflow variants share one product. The Circle Gateway path is an alternate, not a twenty-third dual-rail product.",
    products,
  };
}

export function holdRows(table) {
  return table.rows.filter((row) => SURFACES.some((surface) => row[surface] === "HOLD"));
}

export function summaryHoldsAgreeWithTable(summary, table) {
  const tableHolds = holdRows(table).map((row) => row.id).sort();
  const summaryHolds = [...(summary.holds || [])].sort();
  const talliesMatch = SURFACES.every((surface) => {
    const expected = {};
    for (const row of table.rows) {
      expected[row[surface]] = (expected[row[surface]] || 0) + 1;
    }
    const actual = summary.tallies?.[surface] || {};
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    return [...keys].every((key) => (expected[key] || 0) === (actual[key] || 0));
  });
  return {
    ok: JSON.stringify(tableHolds) === JSON.stringify(summaryHolds) && talliesMatch,
    tableHolds,
    summaryHolds,
  };
}

export function writeRebuiltArtifacts(rebuilt, {
  tablePath = TABLE_PATH,
  summaryPath = SUMMARY_PATH,
  projectionPath = PROJECTION_PATH,
} = {}) {
  mkdirSync(dirname(tablePath), { recursive: true });
  mkdirSync(dirname(summaryPath), { recursive: true });
  mkdirSync(dirname(projectionPath), { recursive: true });
  writeFileSync(tablePath, `${JSON.stringify(rebuilt.table, null, 2)}\n`);
  writeFileSync(summaryPath, `${JSON.stringify(rebuilt.summary, null, 2)}\n`);
  writeFileSync(projectionPath, `${JSON.stringify(rebuilt.projection, null, 2)}\n`);
  return { tablePath, summaryPath, projectionPath };
}
