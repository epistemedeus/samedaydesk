import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateMaintHandoff } from "../lib/handoff.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const cli = join(repoRoot, "tools/l08-agent-repair/cli.mjs");
const cold = join(repoRoot, "tools/l08-agent-repair/cold-client.mjs");
const handoffPath = join(repoRoot, "tools/l08-agent-repair/MAINT-HANDOFF.json");
const PRIOR_SEAL = "ac7e0c75c224a062d9ed4e58332e9c2f34b90895";

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function runCold(args) {
  return spawnSync(process.execPath, [cold, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("l08 agent repair", { timeout: 300_000 }, async (t) => {
  await t.test("prove runs both owned endpoints and rejects seeded failures", () => {
    const result = run(["prove"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /prior-seal ac7e0c75c224a062d9ed4e58332e9c2f34b90895 present/);
    assert.match(result.stdout, /gate 503-before-allowlist catalog-untouched/);
    assert.match(result.stdout, /owned-endpoint POST \/v1\/diagnose exit 0 finding mcp\.unknownTool status fail/);
    assert.match(result.stdout, /owned-endpoint POST \/v1\/regress exit 0 finding mcp\.unknownTool fail -> pass/);
    assert.match(result.stdout, /seeded reject-unchanged exit 1/);
    assert.match(result.stdout, /seeded reject-scored exit 1/);
    assert.match(result.stdout, /protocol-edge MCP-Protocol-Version: 1999-01-01 observed 200 required 400 unresolved/);
    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    assert.deepEqual(validateMaintHandoff(handoff), { ok: true });
    assert.equal(handoff.regression.changed.length, 1);
    assert.equal(handoff.priorSeal, PRIOR_SEAL);
    assert.equal(Object.hasOwn(handoff, "score"), false);
  });

  await t.test("an unrepaired target is rejected by POST /v1/regress", () => {
    const result = run(["reject-unchanged"]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /POST \/v1\/regress exit 1/);
    assert.match(result.stdout, /finding_unchanged|unchanged/);
  });

  await t.test("a scored handoff is rejected", () => {
    const result = run(["reject-scored"]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /score_product/);
    const coldResult = runCold(["reject-scored"]);
    assert.equal(coldResult.status, 1, `${coldResult.stdout}\n${coldResult.stderr}`);
    assert.match(coldResult.stdout, /score_product/);
  });

  await t.test("the cold client refuses a non-loopback origin", () => {
    const result = runCold(["run", "--origin", "http://example.com", "--out", "/tmp/l08-refused-handoff.json"]);
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /loopback/);
  });

  await t.test("seller-repair cold path stops before the allowlist and leaves the catalog", () => {
    const result = runCold(["seller-repair"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /finding_id not-a-catalog-id -> 503 gate 503-before-allowlist catalog-untouched/);
    assert.match(result.stdout, /compared finding_id \S+ -> 503 same-gate/);
    assert.doesNotMatch(result.stdout, /https?:\/\//);
  });

  await t.test("cold client drives diagnose, repair, and regress", () => {
    const result = run(["cold"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /cold-client POST \/v1\/diagnose exit 0 finding mcp\.unknownTool status fail/);
    assert.match(result.stdout, /cold-client POST \/v1\/repair exit 0 mode fixed/);
    assert.match(result.stdout, /cold-client POST \/v1\/regress exit 0 finding mcp\.unknownTool fail -> pass/);
    assert.match(result.stdout, /cold-client run exit 0/);
    assert.match(result.stdout, /cold-client prior-seal ac7e0c75c224a062d9ed4e58332e9c2f34b90895/);
    assert.match(result.stdout, /seeded reject-unchanged exit 1/);
    assert.match(result.stdout, /cold-client POST \/v1\/regress exit 1 finding mcp\.unknownTool unchanged fail/);
    assert.match(result.stdout, /seeded reject-scored exit 1/);
    assert.match(result.stdout, /seller-repair exit 0/);
    assert.match(result.stdout, /protocol-edge MCP-Protocol-Version: 1999-01-01 observed 200 required 400 unresolved/);
    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    assert.deepEqual(validateMaintHandoff(handoff), { ok: true });
    assert.equal(handoff.priorSeal, PRIOR_SEAL);
    assert.equal(handoff.continuation.job, "L08-MAINT-093083");
    assert.equal(handoff.continuation.operationId, "6dd8b73d-e58c-47c7-b2cb-e630167d21f1");
    assert.equal(handoff.continuation.priorSession, "0936c075-cc31-4d98-8300-f8231baafc59");
    assert.equal(handoff.coldClient.liveWriterTwin, false);
    assert.equal(handoff.sellerRepair.gate, "503-before-allowlist");
    assert.equal(handoff.sellerRepair.catalogMutated, false);
    assert.equal(handoff.sellerRepair.catalogUntouched, true);
    assert.equal(handoff.sellerRepair.pinInClone, false);
    assert.equal(handoff.sellerRepair.pin, "00267aeb03c3ce01b9b318f5ee0172aee34d7e34");
    assert.equal(handoff.sellerRepair.catalogCount, 10);
    assert.equal(handoff.sellerRepair.catalogSha256, "1a886fd363e54273dcf9608a5e52ca44cac7166a41f220de9f3e741ecf17f1bc");
    assert.equal(handoff.sellerRepair.findingIsSellerBrief, false);
    assert.equal(handoff.protocolEdge.status, "unresolved");
    assert.equal(Object.hasOwn(handoff, "score"), false);
  });

  await t.test("a mutated catalog claim and a nested score are rejected", () => {
    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    const mutated = structuredClone(handoff);
    mutated.sellerRepair.catalogMutated = true;
    mutated.sellerRepair.catalogUntouched = false;
    assert.equal(validateMaintHandoff(mutated).ok, false);
    const scored = structuredClone(handoff);
    scored.sellerRepair.score = 1;
    assert.equal(validateMaintHandoff(scored).error, "score_product");
  });

  await t.test("SDS255, seller-repair, and SDS260 paths stay untouched", () => {
    const diff = spawnSync("git", [
      "diff",
      "--name-only",
      "9cc816e13bfea448d68a26380efe2a91c88773dd",
      "--",
      "server/lib/agent-readiness",
      "server/routes/mcp.js",
      "server/routes/agent-readiness.js",
      "server/lib/seller-repair-checkout.js",
      "server/lib/pulse.js",
      "client/src/data/sellerRepairBriefs.ts",
      "experiments/s260-useful-jobs-public-integration",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(diff.status, 0, diff.stderr);
    assert.equal(diff.stdout.trim(), "");
  });
});
