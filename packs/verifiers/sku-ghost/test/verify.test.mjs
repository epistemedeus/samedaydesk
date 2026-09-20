import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { getOffer } from "../../../../server/pricing.js";
import { verifySkuGhost } from "../src/verify.mjs";
import { parseClientCatalog, parseLlmsPricedLines, parsePaymentLinkSlugs } from "../src/parse.mjs";
import { BIN, FIXTURES, REPO_ROOT, runSkuGhost, parseStdout } from "./helpers.mjs";

const EXPECTED_ADVERTISED = [
  "agent_workflow",
  "agent_mcp_server",
  "machine_payment_route",
  "agent_storefront",
];

test("committed run finds no ghost SKUs against real server/pricing.js", async () => {
  const result = await verifySkuGhost({ mode: "committed", repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, JSON.stringify(result.failure || result));
  assert.equal(result.verifier, "sku-ghost");
  assert.equal(result.mode, "committed");
  assert.equal(result.paid, false);
  assert.equal(result.purchaseAuthority, false);
  assert.equal(result.skuChange, false);
  assert.equal(result.liveSdsPricesUnchanged, true);
  assert.equal(result.checkoutTouched, false);
  assert.equal(result.publishAttempted, false);
  assert.deepEqual(result.ghosts, []);
  const slugs = result.advertised.map((s) => s.slug).sort();
  assert.deepEqual(slugs, [...EXPECTED_ADVERTISED].sort());
  assert.equal(
    result.advertised.find((s) => s.slug === "agent_workflow").amountCents,
    14900,
  );
  assert.equal(
    result.advertised.find((s) => s.slug === "agent_mcp_server").amountCents,
    34900,
  );
  assert.equal(
    result.advertised.find((s) => s.slug === "machine_payment_route").amountCents,
    49900,
  );
  assert.equal(
    result.advertised.find((s) => s.slug === "agent_storefront").amountCents,
    99900,
  );
  const repair = result.unadvertised.find((s) => s.slug === "seller_contract_repair");
  assert.ok(repair, "seller_contract_repair is unadvertised, not a ghost");
  assert.equal(repair.amountCents, 49000);
});

test("CLI --committed exits 0 and records live prices unchanged", () => {
  const proc = runSkuGhost(["--committed"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.liveSdsPricesUnchanged, true);
  assert.equal(json.ghosts.length, 0);
  assert.equal(json.recorded.path, "server/pricing.js");
});

test("committed pricing sha256 matches the real file", async () => {
  const result = await verifySkuGhost({ mode: "committed", repoRoot: REPO_ROOT });
  const raw = readFileSync(join(REPO_ROOT, "server/pricing.js"));
  const sha = createHash("sha256").update(raw).digest("hex");
  assert.equal(result.recorded.sha256, sha);
  assert.equal(result.recorded.bytes, raw.length);
});

test("real getOffer rejects the seeded ghost slug", () => {
  assert.equal(getOffer("sku_ghost_premium"), null);
  assert.ok(getOffer("agent_workflow"));
  assert.equal(getOffer("agent_workflow").amount, 14900);
});

test("client catalog parser reads homepage slugs as dollars→cents", () => {
  const src = readFileSync(join(REPO_ROOT, "client/src/lib/services.ts"), "utf8");
  const rows = parseClientCatalog(src);
  assert.deepEqual(
    rows.map((r) => r.slug),
    EXPECTED_ADVERTISED,
  );
  assert.equal(rows[0].amountCents, 14900);
  const links = parsePaymentLinkSlugs(src);
  assert.ok(links.includes("agent_workflow"));
  assert.ok(links.includes("custom_quote"));
});

test("llms Start here dollar lines map to the four homepage SKUs", () => {
  const src = readFileSync(join(REPO_ROOT, "client/public/llms.txt"), "utf8");
  const rows = parseLlmsPricedLines(src);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.slug).sort(),
    [...EXPECTED_ADVERTISED].sort(),
  );
});

test("matching fixture against real OFFERS is ok", async () => {
  const result = await verifySkuGhost({
    mode: "fixture",
    fixturePath: join(FIXTURES, "ok/matching-catalog.json"),
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, true, JSON.stringify(result.failure || result));
  assert.equal(result.ghosts.length, 0);
});

test("bin path is the pack CLI", () => {
  assert.match(BIN, /sku-ghost\.mjs$/);
});
