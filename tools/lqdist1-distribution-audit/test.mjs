import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const tablePath = join(root, "docs/lqdist1-distribution-audit/per-route-table.json");
const mcpPath = join(root, "client/src/pages/Mcp.tsx");
const commandsPath = join(root, "docs/lqdist1-distribution-audit/COMMANDS.md");
const vocab = new Set(["CLEAR", "HOLD", "ABORT", "absent", "unverified"]);
const surfaces = ["what_agents_buy", "agent402", "agentcash"];

function loadTable() {
  return JSON.parse(readFileSync(tablePath, "utf8"));
}

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
  const table = loadTable();
  assert.equal(table.canonicalProductCount, 22);
  assert.equal(table.paidOperationCount, 25);
  assert.equal(table.rows.length, 25);
  const products = new Set(table.rows.filter((r) => r.class === "canonical").map((r) => r.product));
  assert.equal(products.size, 22);
  const alternates = table.rows.filter((r) => r.class === "circle_gateway_alternate");
  assert.equal(alternates.length, 1);
  assert.equal(alternates[0].id, "GET /gateway/commerce/payment-offer-preflight");
  for (const row of table.rows) {
    for (const surface of surfaces) {
      assert.ok(vocab.has(row[surface]), `${row.id} ${surface}=${row[surface]}`);
    }
    assert.ok(row.operationId, `${row.id} missing operationId`);
    assert.match(row.id, /^(GET|POST) \//);
  }
  const ids = table.rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("Mcp.tsx catalog projection matches the 22 OpenAPI product prices", () => {
  const table = loadTable();
  const tools = mcpTools();
  assert.equal(tools.length, 22);
  const byProduct = new Map();
  for (const row of table.rows.filter((r) => r.class === "canonical")) {
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
    assert.ok(tools.some((t) => t.name === product), `canonical ${product} missing from Mcp.tsx`);
  }
});

test("replay instructions stay unpaid", () => {
  const commands = readFileSync(commandsPath, "utf8");
  assert.match(commands, /preflight-x402@0\.2\.0/);
  assert.match(commands, /@agentcash\/discovery@1\.7\.5/);
  assert.match(commands, /agent402\.tools\/api\/index\?seller=agents\.samedaydesk\.com/);
  const blocks = [...commands.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 4, "expected bash replay blocks");
  for (const block of blocks) {
    assert.doesNotMatch(block, /-H ['"]PAYMENT-SIGNATURE|X-PAYMENT:|privateKey|AGENT_PRIVATE_KEY/);
  }
});

test("committed catalog projection lists the same 22 products and operation IDs", () => {
  const table = loadTable();
  const projection = JSON.parse(
    readFileSync(join(here, "catalog-projection.json"), "utf8"),
  );
  assert.equal(projection.products.length, 22);
  const byName = new Map(projection.products.map((p) => [p.name, p]));
  for (const row of table.rows.filter((r) => r.class === "canonical")) {
    const product = byName.get(row.product);
    assert.ok(product, row.product);
    assert.equal(Number(product.priceUsd), Number(row.openapiPriceUsd));
    const path = row.id.replace(/^(GET|POST) /, "");
    assert.equal(product.path, path);
  }
});

test("HOLD rows are the reproduced buyer-surface failures only", () => {
  const table = loadTable();
  const holds = table.rows.filter((r) => surfaces.some((s) => r[s] === "HOLD"));
  assert.deepEqual(
    holds.map((r) => [r.id, r.what_agents_buy, r.agent402, r.agentcash]),
    [
      ["GET /read", "CLEAR", "HOLD", "CLEAR"],
      ["POST /security/wallet-policy-conformance", "CLEAR", "CLEAR", "HOLD"],
      ["POST /security/stateful-wallet-policy-conformance", "CLEAR", "CLEAR", "HOLD"],
    ],
  );
  assert.equal(table.rows.filter((r) => surfaces.some((s) => r[s] === "ABORT")).length, 0);
  assert.equal(table.rows.filter((r) => surfaces.some((s) => r[s] === "absent")).length, 0);
});
