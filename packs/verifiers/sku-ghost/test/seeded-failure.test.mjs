import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getOffer } from "../../../../server/pricing.js";
import { verifySkuGhost } from "../src/verify.mjs";
import { parseFixtureDocument } from "../src/parse.mjs";
import { FIXTURES, REPO_ROOT, runSkuGhost, parseStdout } from "./helpers.mjs";

function naiveAccept(raw, httpStatus = 200) {
  if (httpStatus >= 200 && httpStatus < 300) {
    const data = raw.trim() === "" ? {} : JSON.parse(raw);
    return { ok: true, data };
  }
  return { ok: false };
}

test("seeded ghost SKU is rejected against real pricing.js", async () => {
  const path = join(FIXTURES, "seeded/ghost-sku.json");
  const result = await verifySkuGhost({ mode: "fixture", fixturePath: path, repoRoot: REPO_ROOT });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.failure.class, "ghost_sku");
  assert.equal(result.failure.seeded, "ghost_sku");
  assert.equal(result.ghosts[0].slug, "sku_ghost_premium");
  assert.equal(getOffer("sku_ghost_premium"), null);
});

test("CLI --fixture ghost-sku.json exits 2 and names ghost_sku", () => {
  const proc = runSkuGhost([
    "--fixture",
    "packs/verifiers/sku-ghost/fixtures/seeded/ghost-sku.json",
  ]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2, proc.stderr || proc.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.failure.class, "ghost_sku");
  assert.notEqual(json.ok, true);
});

test("naive 2xx-is-success would accept the seeded ghost; this verifier does not", async () => {
  const raw = readFileSync(join(FIXTURES, "seeded/ghost-sku.json"), "utf8");
  const naive = naiveAccept(raw, 200);
  assert.equal(naive.ok, true);
  assert.equal(naive.data.ok, true);
  assert.equal(naive.data.advertised[0].slug, "sku_ghost_premium");
  const result = await verifySkuGhost({
    mode: "fixture",
    fixtureRaw: raw,
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "ghost_sku");
});

test("silent empty success is rejected", async () => {
  const cases = [
    "seeded/silent-empty-success.json",
    "seeded/silent-empty-ok.json",
    "seeded/empty-body.txt",
  ];
  for (const name of cases) {
    const result = await verifySkuGhost({
      mode: "fixture",
      fixturePath: join(FIXTURES, name),
      repoRoot: REPO_ROOT,
    });
    assert.equal(result.ok, false, name);
    assert.equal(result.failure.class, "silent_empty_success", name);
  }
});

test("CLI never exits 0 for the seeded empty success", () => {
  const proc = runSkuGhost([
    "--compact",
    "--fixture",
    "packs/verifiers/sku-ghost/fixtures/seeded/silent-empty-success.json",
  ]);
  assert.notEqual(proc.status, 0);
  assert.equal(proc.status, 2);
  assert.match(proc.stdout, /"ok":\s*false/);
  assert.match(proc.stdout, /silent_empty_success/);
});

test("price mismatch against real agent_workflow 14900 is rejected", async () => {
  const result = await verifySkuGhost({
    mode: "fixture",
    fixturePath: join(FIXTURES, "seeded/price-mismatch.json"),
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "sku_price_mismatch");
  assert.equal(result.ghosts[0].authoritativeCents, 14900);
  assert.equal(result.ghosts[0].amountCents, 5);
  assert.equal(getOffer("agent_workflow").amount, 14900);
});

test("edit-live-prices attempt is refused and does not rewrite OFFERS", async () => {
  const before = getOffer("agent_workflow").amount;
  const result = await verifySkuGhost({
    mode: "fixture",
    fixturePath: join(FIXTURES, "seeded/edit-live-prices.json"),
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "sku_change_refused");
  assert.equal(getOffer("agent_workflow").amount, before);
  assert.equal(before, 14900);
});

test("CLI --publish is refused", () => {
  const proc = runSkuGhost(["--committed", "--publish"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.failure.class, "publish_attempted");
});

test("CLI --checkout is refused", () => {
  const proc = runSkuGhost(["--committed", "--checkout"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.failure.class, "checkout_touched");
});

test("parseFixtureDocument keeps the seeded ghost slug", () => {
  const raw = readFileSync(join(FIXTURES, "seeded/ghost-sku.json"), "utf8");
  const parsed = parseFixtureDocument(raw);
  assert.equal(parsed.advertised[0].slug, "sku_ghost_premium");
  assert.equal(parsed.advertised[0].amountCents, 5);
});
