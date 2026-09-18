import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ENGINE_CITES, OFFER_SLUG, SEEDED } from "./lib/catalog.mjs";
import { citePublishedEngine } from "./lib/cite.mjs";
import { resolveRoot } from "./lib/repo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");
const harness = join(here, "run-harness.mjs");

function run(args, timeout = 30_000) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("published engine cites are present in this checkout", () => {
  const cite = citePublishedEngine(resolveRoot(root));
  assert.equal(cite.ok, true, JSON.stringify(cite.files.filter((f) => !f.ok)));
  assert.equal(cite.files.length, ENGINE_CITES.length);
  for (const file of cite.files) {
    assert.equal(file.missingPatterns.length, 0, file.path);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
});

test("cold run exit 0 against published engine + fixture Stripe", () => {
  const result = run(["cold", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "cold");
  assert.equal(result.json.feature, "double-charge-guard");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.paymentSent, false);
  assert.equal(result.json.result.liveStripe, false);
  assert.equal(result.json.result.checkoutOpened, false);
  assert.equal(result.json.result.stripe, "fixture");
  assert.equal(result.json.result.caseCount, 7);
  assert.equal(result.json.result.failedCount, 0);
  const byId = Object.fromEntries(result.json.result.cases.map((c) => [c.id, c]));
  assert.equal(byId["retry-same-attempt"].stripeCreates, 1);
  assert.equal(byId["retry-same-attempt"].intentIds[0], byId["retry-same-attempt"].intentIds[1]);
  assert.equal(byId["concurrent-creates"].uniqueIntents, 1);
  assert.equal(byId["duplicate-fulfill"].retryIsNew, false);
  assert.equal(byId["changed-facts-blocked"].changedStatus, 409);
  assert.equal(byId["uncertain-retrieve"].secondStatus, 503);
  assert.equal(byId["quarantine-stale"].quarantinedStatus, 409);
  assert.notEqual(
    byId["repeat-after-success-is-new-attempt"].firstIntentId,
    byId["repeat-after-success-is-new-attempt"].secondIntentId,
  );
  assert.match(byId["retry-same-attempt"].idempotencyKey, /^sdd-pi-v2:/);
});

test("bare invocation is cold run", () => {
  const result = run(["--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.command, "cold");
  assert.equal(result.json.ok, true);
});

test("seeded second-charge exit 1 with DOUBLE_CHARGE_CLAIM_REFUSE", () => {
  const result = run(["--seeded-failure", "second-charge", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "DOUBLE_CHARGE_CLAIM_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.observedCreateCount, 1);
  assert.equal(result.json.result.claim.createCount, 2);
  assert.equal(SEEDED["second-charge"].errorCode, "DOUBLE_CHARGE_CLAIM_REFUSE");
});

test("seeded retrieve-fail-recreate exit 1; original PI preserved", () => {
  const result = run(["--seeded-failure", "retrieve-fail-recreate", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "RETRIEVE_RECREATE_REFUSE");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.observedCreates, 1);
  assert.equal(result.json.result.observedStatus, 503);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded changed-facts-bypass exit 1 with 409", () => {
  const result = run(["--seeded-failure", "changed-facts-bypass", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "FACTS_BYPASS_REFUSE");
  assert.equal(result.json.result.observedStatus, 409);
  assert.equal(result.json.result.observedCreates, 1);
});

test("seeded live-stripe exit 1; never network", () => {
  const result = run(["--seeded-failure", "live-stripe", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "LIVE_STRIPE_REFUSE");
  assert.equal(result.json.result.liveStripe, false);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded checkout-path exit 1; never opened checkout", () => {
  const result = run(["--seeded-failure", "checkout-path", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "CHECKOUT_PATH_REFUSE");
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("fixture pointer yields second-charge refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/double-charge-guard/fixtures/seeded/second-charge.json",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "DOUBLE_CHARGE_CLAIM_REFUSE");
});

test("forbidden --checkout flag is refused without paying", () => {
  const result = run(["--checkout", "--json"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.json.error.code, "PAYMENT_FORBIDDEN");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.refused, true);
});

test("forbidden --pay flag is refused", () => {
  const result = run(["cold", "--pay", "--json"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.json.error.code, "PAYMENT_FORBIDDEN");
});

test("cold run-harness exit 0 (engine ok + seeds refuse)", () => {
  const result = spawnSync(process.execPath, [harness], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.result.coldOk, true);
  assert.equal(json.result.seedsOk, true);
  assert.equal(json.boundary.paymentSent, false);
  assert.equal(json.result.paymentSent, false);
});

test("seeded-failures.json matches catalog codes", () => {
  const doc = JSON.parse(readFileSync(join(here, "fixtures/seeded-failures.json"), "utf8"));
  assert.equal(doc.feature, "double-charge-guard");
  for (const seed of doc.seeds) {
    assert.equal(SEEDED[seed.id].errorCode, seed.errorCode);
    assert.equal(seed.expectExit, 1);
    assert.equal(seed.boundary.paymentSent, false);
  }
  assert.equal(OFFER_SLUG, "agent_mcp_server");
});

test("unknown seed is usage", () => {
  const result = run(["--seeded-failure", "not-a-seed", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.error.code, "USAGE");
});
