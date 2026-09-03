import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  SURFACES,
  VOCAB,
  WAB_PREFLIGHT_URLS,
  loadEvidence,
  loadJson,
  rebuildFromEvidence,
  catalogProjectionFromTable,
  summaryHoldsAgreeWithTable,
  holdRows,
  agent402Holds,
  agentcashHoldsFromProbes,
  TABLE_PATH,
  SUMMARY_PATH,
  PROJECTION_PATH,
  DOCS_DIR,
  ROOT,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const mcpPath = join(ROOT, "client/src/pages/Mcp.tsx");
const commandsPath = join(DOCS_DIR, "COMMANDS.md");

function mcpTools() {
  const src = readFileSync(mcpPath, "utf8");
  const start = src.indexOf("const tools = [");
  const end = src.indexOf("];", start);
  assert.ok(start >= 0 && end > start, "Mcp.tsx tools array");
  const block = src.slice(start, end);
  const names = [...block.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
  const prices = [...block.matchAll(/price:\s*"\$([0-9.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(names.length, prices.length, "name/price pairs");
  return names.map((name, i) => ({ name, price: prices[i] }));
}

test("every canonical paid route has a three-surface result", () => {
  const table = loadJson(TABLE_PATH);
  assert.equal(table.canonicalProductCount, 22);
  assert.equal(table.paidOperationCount, 25);
  assert.equal(table.rows.length, 25);
  const products = new Set(table.rows.filter((row) => row.class === "canonical").map((row) => row.product));
  assert.equal(products.size, 22);
  const alternates = table.rows.filter((row) => row.class === "circle_gateway_alternate");
  assert.equal(alternates.length, 1);
  assert.equal(alternates[0].id, "GET /gateway/commerce/payment-offer-preflight");
  for (const row of table.rows) {
    for (const surface of SURFACES) {
      assert.ok(VOCAB.includes(row[surface]), `${row.id} ${surface}=${row[surface]}`);
    }
    assert.ok(row.operationId, `${row.id} missing operationId`);
    assert.match(row.id, /^(GET|POST) \//);
  }
  const ids = table.rows.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("Mcp.tsx catalog projection matches the 22 OpenAPI product prices", () => {
  const table = loadJson(TABLE_PATH);
  const tools = mcpTools();
  assert.equal(tools.length, 22);
  const byProduct = new Map();
  for (const row of table.rows.filter((entry) => entry.class === "canonical")) {
    const prev = byProduct.get(row.product);
    if (prev && prev !== Number(row.openapiPriceUsd)) {
      assert.fail(`${row.product} has conflicting OpenAPI prices`);
    }
    byProduct.set(row.product, Number(row.openapiPriceUsd));
  }
  for (const tool of tools) {
    assert.ok(byProduct.has(tool.name), `Mcp.tsx ${tool.name} is not a canonical product`);
    assert.equal(tool.price, byProduct.get(tool.name), `${tool.name} price`);
  }
  for (const product of byProduct.keys()) {
    assert.ok(tools.some((tool) => tool.name === product), `canonical ${product} missing from Mcp.tsx`);
  }
});

test("replay instructions stay unpaid", () => {
  const commands = readFileSync(commandsPath, "utf8");
  assert.match(commands, /preflight-x402@0\.2\.0/);
  assert.match(commands, /@agentcash\/discovery@1\.7\.5/);
  assert.match(commands, /agent402\.tools\/api\/index\?seller=agents\.samedaydesk\.com/);
  assert.match(commands, /rebuild-from-evidence/);
  const blocks = [...commands.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 4, "expected bash replay blocks");
  for (const block of blocks) {
    assert.doesNotMatch(block, /-H ['"]PAYMENT-SIGNATURE|X-PAYMENT:|privateKey|AGENT_PRIVATE_KEY/);
  }
});

test("catalog-projection.json is generated from the table", () => {
  const table = loadJson(TABLE_PATH);
  const generated = catalogProjectionFromTable(table);
  const committed = loadJson(PROJECTION_PATH);
  assert.deepEqual(committed.products, generated.products);
  assert.equal(committed.products.length, 22);
});

test("summary.json agrees with per-route-table.json", () => {
  const table = loadJson(TABLE_PATH);
  const summary = loadJson(SUMMARY_PATH);
  const agreement = summaryHoldsAgreeWithTable(summary, table);
  assert.equal(agreement.ok, true, JSON.stringify(agreement, null, 2));
  assert.equal(summary.routeCount, table.paidOperationCount);
  assert.equal(summary.canonicalCount, table.canonicalProductCount);
  assert.equal(summary.tallies.agentcash.HOLD, 2);
  assert.equal(summary.tallies.agent402.HOLD, 1);
  assert.equal(summary.holds.length, 3);
});

test("HOLD rows come from Agent402 evidence and follow-up probes", () => {
  const evidence = loadEvidence();
  const table = loadJson(TABLE_PATH);
  const rebuilt = rebuildFromEvidence(evidence);
  const fromTable = holdRows(table).map((row) => [row.id, row.what_agents_buy, row.agent402, row.agentcash]);
  const fromEvidence = holdRows(rebuilt.table).map((row) => [row.id, row.what_agents_buy, row.agent402, row.agentcash]);
  assert.deepEqual(fromTable, fromEvidence);

  const readHold = agent402Holds(evidence.agent402);
  assert.equal(readHold.length, 1);
  assert.equal(readHold[0].id, "GET /read");
  assert.equal(readHold[0].priceObservations.bazaar, 0.05);
  assert.equal(readHold[0].priceObservations.origin, 0.005);

  const walletHolds = agentcashHoldsFromProbes(evidence.followupProbes);
  assert.deepEqual(
    walletHolds.map((row) => row.id).sort(),
    [
      "POST /security/stateful-wallet-policy-conformance",
      "POST /security/wallet-policy-conformance",
    ],
  );
  for (const hold of walletHolds) {
    assert.equal(hold.emptyStatus, 400);
    assert.equal(hold.schemaValidStatus, 402);
  }
  assert.equal((evidence.followupProbes.results || []).length, 9);
});

test("25-across-three-surfaces coverage is qualified from evidence", () => {
  const evidence = loadEvidence();
  const table = loadJson(TABLE_PATH);
  const commands = readFileSync(commandsPath, "utf8");
  assert.equal(table.coverage.what_agents_buy.independentPreflights, 3);
  assert.equal(table.coverage.what_agents_buy.inheritedHostClear, 25);
  assert.equal(table.coverage.agentcash.followupProbes, 9);
  assert.equal(table.coverage.agentcash.checkNotRunOnAll25, true);
  assert.equal(table.coverage.agent402.sellerSnapshotPaidTools, 25);
  assert.deepEqual(table.coverage.what_agents_buy.preflightUrls, [...WAB_PREFLIGHT_URLS]);
  assert.equal(evidence.followupProbes.results.length, 9);
  assert.match(commands, /every SameDayDesk route inherits this CLEAR/);
  assert.match(commands, /is not run on all 25/);
  assert.match(commands, /followup-probes\.json[\s\S]*9 results/);
  const independentlyProbed = table.rows.filter((row) => row.unpaid402.probeSource === "followup-probes");
  assert.ok(independentlyProbed.length < 25, independentlyProbed.length);
  assert.ok(table.rows.some((row) => row.unpaid402.probeSource === "not-in-followup-probes"));
});

test("rebuild-from-evidence reproduces the committed table", () => {
  const rebuilt = rebuildFromEvidence(loadEvidence());
  const table = loadJson(TABLE_PATH);
  assert.deepEqual(
    rebuilt.table.rows.map((row) => row.id),
    table.rows.map((row) => row.id),
  );
  assert.deepEqual(rebuilt.summary.holds, loadJson(SUMMARY_PATH).holds);
  const cli = spawnSync(
    process.execPath,
    [join(here, "rebuild-from-evidence.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  const report = JSON.parse(cli.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.paidOperationCount, 25);
  assert.equal(report.holds.length, 3);
});
