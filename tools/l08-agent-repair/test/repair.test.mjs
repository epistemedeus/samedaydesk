import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateMaintHandoff } from "../lib/handoff.mjs";
import "./contract-repair.test.mjs";

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
    assert.match(result.stdout, /journey callers hypernatt-liq-radar-20260830 paid_get, blockrun-exa-search-20260830 paid_post maintenance-scope catalog-untouched/);
    assert.match(result.stdout, /owned-endpoint POST \/v1\/diagnose exit 0 finding mcp\.unknownTool status fail/);
    assert.match(result.stdout, /owned-endpoint POST \/v1\/regress exit 0 finding mcp\.unknownTool fail -> pass/);
    assert.match(result.stdout, /seeded reject-unchanged exit 1/);
    assert.match(result.stdout, /seeded reject-scored exit 1/);
    assert.match(result.stdout, /protocol-edge MCP-Protocol-Version: 1999-01-01 observed 400 required 400 repaired/);
    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    assert.deepEqual(validateMaintHandoff(handoff), { ok: true });
    assert.equal(handoff.regression.changed.length, 1);
    assert.equal(handoff.priorSeal, PRIOR_SEAL);
    assert.equal(handoff.journey.job, "L08-JOURNEY-RECV-093093");
    assert.equal(handoff.journey.priorHead, "fdd65c5f11d336183e038ef8582c0aa07fa81495");
    assert.equal(handoff.journey.callers.length, 2);
    assert.equal(handoff.journey.callers[0].resultKind, "maintenance-scope");
    assert.equal(handoff.journey.callers[1].findingId, "blockrun-exa-search-20260830");
    assert.equal(handoff.journey.coldClientWritesHandoff, true);
    assert.equal(handoff.journey.listenerWritesHandoff, false);
    assert.equal(handoff.journey.catalogMutated, false);
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

  await t.test("two ordinary seller-repair callers receive maintenance scope", () => {
    const before = readFileSync(handoffPath, "utf8");
    const getCaller = runCold(["journey", "--finding", "hypernatt-liq-radar-20260830"]);
    assert.equal(getCaller.status, 0, `${getCaller.stdout}\n${getCaller.stderr}`);
    assert.match(getCaller.stdout, /journey caller hypernatt-liq-radar-20260830 paid_get useful maintenance-scope no-url no-wallet/);
    assert.match(getCaller.stdout, /Declare the successful application\/json response schema for the exact route\./);
    const postCaller = runCold(["journey", "--finding", "blockrun-exa-search-20260830"]);
    assert.equal(postCaller.status, 0, `${postCaller.stdout}\n${postCaller.stderr}`);
    assert.match(postCaller.stdout, /journey caller blockrun-exa-search-20260830 paid_post useful maintenance-scope no-url no-wallet/);
    assert.match(postCaller.stdout, /Declare the successful application\/json envelope and require results when every successful search returns it\./);
    assert.doesNotMatch(`${getCaller.stdout}\n${postCaller.stdout}`, /https?:\/\//);
    assert.doesNotMatch(`${getCaller.stdout}\n${postCaller.stdout}`, /plink_/);
    assert.equal(readFileSync(handoffPath, "utf8"), before);
  });

  await t.test("journey negatives reject a second wallet, a header echo, and a disposable-only result", () => {
    const before = readFileSync(handoffPath, "utf8");
    const result = runCold(["journey-negative"]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /journey negative unknown_finding exit 1/);
    assert.match(result.stdout, /journey negative second_wallet_refused exit 1/);
    assert.match(result.stdout, /journey negative echo_header_refused exit 1/);
    assert.match(result.stdout, /journey negative disposable_only_refused exit 1/);
    assert.match(result.stdout, /journey negative disposable_finding_refused exit 1/);
    const wallet = runCold(["journey", "--finding", "hypernatt-liq-radar-20260830", "--wallet", "create"]);
    assert.equal(wallet.status, 1, `${wallet.stdout}\n${wallet.stderr}`);
    assert.match(wallet.stdout, /second_wallet_refused/);
    const echo = runCold(["journey", "--finding", "hypernatt-liq-radar-20260830", "--echo-header"]);
    assert.equal(echo.status, 1, `${echo.stdout}\n${echo.stderr}`);
    assert.match(echo.stdout, /echo_header_refused/);
    const disposable = runCold(["journey", "--disposable-only"]);
    assert.equal(disposable.status, 1, `${disposable.stdout}\n${disposable.stderr}`);
    assert.match(disposable.stdout, /disposable_only_refused/);
    const unknown = runCold(["journey", "--finding", "not-a-catalog-id"]);
    assert.equal(unknown.status, 1, `${unknown.stdout}\n${unknown.stderr}`);
    assert.match(unknown.stdout, /unknown_finding/);
    assert.equal(readFileSync(handoffPath, "utf8"), before);
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
    assert.match(result.stdout, /journey exit 0/);
    assert.match(result.stdout, /journey caller hypernatt-liq-radar-20260830 paid_get useful maintenance-scope no-url no-wallet/);
    assert.match(result.stdout, /journey caller blockrun-exa-search-20260830 paid_post useful maintenance-scope no-url no-wallet/);
    assert.match(result.stdout, /seeded journey-negative exit 1/);
    assert.match(result.stdout, /journey negative second_wallet_refused exit 1/);
    assert.match(result.stdout, /contract-repair local-paid-get-object paid_get missing_response_schema object suggestion not-owner-applied/);
    assert.match(result.stdout, /contract-repair local-paid-post-array paid_post incorrect_response_schema array suggestion not-owner-applied/);
    assert.match(result.stdout, /cold-client contract-repair two callers suggestion not-owner-applied/);
    assert.match(result.stdout, /contract-repair-limits exit 0/);
    assert.match(result.stdout, /contract-repair limit null-pair.json suggestion type null/);
    assert.match(result.stdout, /seeded contract-repair-negative exit 1/);
    assert.match(result.stdout, /task-readiness exit 0/);
    assert.match(result.stdout, /adapter repair-add-required exit 1/);
    assert.match(result.stdout, /adapter contract-absent exit 1/);
    assert.match(result.stdout, /semantic shape string value fail packet refused semantic_mismatch/);
    assert.match(result.stdout, /unsupported_era pass repaired true/);
    assert.match(result.stdout, /seeded task-readiness-negative exit 1/);
    assert.match(result.stdout, /contract-repair negative repair_unchanged exit 1/);
    assert.match(result.stdout, /contract-repair negative repair_incorrect exit 1/);
    assert.match(result.stdout, /contract-repair negative secret_redacted exit 0/);
    assert.match(result.stdout, /contract-repair negative tampered_regression exit 1/);
    assert.match(result.stdout, /protocol-edge MCP-Protocol-Version: 1999-01-01 observed 400 required 400 repaired/);
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
    assert.equal(handoff.protocolEdge.status, "repaired");
    assert.equal(handoff.protocolEdge.repairedBy, "server/routes/mcp.js");
    assert.equal(handoff.protocolEdge.apex.observedStatus, 400);
    assert.equal(handoff.protocolEdge.missingHeader, "accepted");
    assert.equal(handoff.protocolEdge.disposable.observedStatus, 200);
    assert.equal(handoff.journey.priorJob, "L08-MAINT-093083");
    assert.equal(handoff.journey.operationId, "6dd8b73d-e58c-47c7-b2cb-e630167d21f1");
    assert.equal(handoff.journey.catalogSha256, handoff.sellerRepair.catalogSha256);
    assert.equal(handoff.journey.catalogFileSha256, handoff.sellerRepair.catalogFileSha256);
    assert.equal(handoff.journey.callers[0].checkout.url, null);
    assert.equal(handoff.journey.callers[0].checkout.httpStatus, 503);
    assert.equal(handoff.journey.callers[1].checkout.httpStatus, 503);
    assert.equal(handoff.journey.callers[0].maintenance.requiredContract[0], "Declare the successful application/json response schema for the exact route.");
    assert.equal(handoff.journey.callers[1].maintenance.scope[0], "One truthful OpenAPI 200 schema and matching Bazaar projection for the existing Exa search route.");
    assert.equal(JSON.stringify(handoff.journey).includes("https://"), false);
    assert.equal(JSON.stringify(handoff.journey).includes("plink_"), false);
    assert.equal(handoff.contractRepair.offline, true);
    assert.equal(handoff.contractRepair.checkoutRequired, false);
    assert.equal(handoff.contractRepair.charge, false);
    assert.equal(handoff.contractRepair.ownerApplied, false);
    assert.equal(handoff.contractRepair.verifiedRepair, false);
    assert.equal(handoff.contractRepair.externalSellerMutated, false);
    assert.equal(handoff.contractRepair.catalogExamplesAreInputsOnly, true);
    assert.equal(handoff.contractRepair.coldClientWritesHandoff, true);
    assert.equal(handoff.contractRepair.listenerWritesHandoff, false);
    assert.equal(handoff.contractRepair.secondWallet, false);
    assert.equal(handoff.contractRepair.callers[0].callerId, "local-paid-get-object");
    assert.equal(handoff.contractRepair.callers[0].findingClass, "missing_response_schema");
    assert.equal(handoff.contractRepair.callers[0].shape, "object");
    assert.deepEqual(handoff.contractRepair.callers[0].requiredPaths, ["$.price", "$.symbol"]);
    assert.deepEqual(handoff.contractRepair.callers[0].optionalPaths, ["$.apiKey", "$.contact", "$.venue"]);
    assert.equal(handoff.contractRepair.callers[1].callerId, "local-paid-post-array");
    assert.equal(handoff.contractRepair.callers[1].findingClass, "incorrect_response_schema");
    assert.equal(handoff.contractRepair.callers[1].shape, "array");
    assert.deepEqual(handoff.contractRepair.callers[1].requiredPaths, ["$[].id", "$[].ok"]);
    assert.deepEqual(handoff.contractRepair.callers[1].optionalPaths, ["$[].note"]);
    assert.equal(handoff.contractRepair.callers[0].ownerApplied, false);
    assert.equal(handoff.contractRepair.callers[1].verifiedRepair, false);
    assert.equal(JSON.stringify(handoff).includes("sk_live_L08CONTRACTSECRET"), false);
    assert.equal(JSON.stringify(handoff).includes("UNIQUEVALUEZZ"), false);
    assert.equal(JSON.stringify(handoff).includes("buyer@example.test"), false);
    assert.equal(JSON.stringify(handoff).includes("https://"), false);
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
    const wallet = structuredClone(handoff);
    wallet.journey.secondWallet = true;
    assert.equal(validateMaintHandoff(wallet).ok, false);
    const echo = structuredClone(handoff);
    echo.journey.callers[0].resultKind = "echo-header";
    assert.equal(validateMaintHandoff(echo).error, "journey_result");
  });

  await t.test("SDS255, seller-repair, and SDS260 paths stay untouched", () => {
    const diff = spawnSync("git", [
      "diff",
      "--name-only",
      "9cc816e13bfea448d68a26380efe2a91c88773dd",
      "--",
      "server/lib/agent-readiness",
      "server/routes/agent-readiness.js",
      "server/lib/seller-repair-checkout.js",
      "server/lib/pulse.js",
      "client/src/data/sellerRepairBriefs.ts",
      "experiments/s260-useful-jobs-public-integration",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(diff.status, 0, diff.stderr);
    assert.equal(diff.stdout.trim(), "");
    const mcp = spawnSync("git", [
      "diff",
      "-U0",
      "9cc816e13bfea448d68a26380efe2a91c88773dd",
      "--",
      "server/routes/mcp.js",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(mcp.status, 0, mcp.stderr);
    const removed = mcp.stdout.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"));
    assert.deepEqual(removed, []);
    assert.match(mcp.stdout, /protocolHeaderValue/);
    assert.match(mcp.stdout, /Unsupported protocol version/);
    assert.doesNotMatch(mcp.stdout, /const TOOLS/);
  });
});
