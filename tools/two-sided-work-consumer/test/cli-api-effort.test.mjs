import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { handleApi } from "../src/http.mjs";
import { measureWholeEffort } from "../src/whole-effort.mjs";
import { CLOCK, fittingPost } from "./helpers.mjs";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("cli help and payment commands are refused", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /project-fee/);
  assert.match(help.stdout, /Does not pay/);
  const pay = runCli(["pay", "--journey", "ignored.json"]);
  assert.equal(pay.status, 1);
  assert.match(pay.stderr, /payment_command_refused/);
});

test("api posts and refuses a payment command", () => {
  const dir = mkdtempSync(join(tmpdir(), "two-sided-api-"));
  const journeyPath = join(dir, "journey.json");
  const posted = handleApi({
    command: "post",
    journeyPath,
    clock: CLOCK,
    input: fittingPost(),
  });
  assert.equal(posted.ok, true, JSON.stringify(posted));
  assert.equal(posted.status, 200);
  const pay = handleApi({ command: "pay", journeyPath, clock: CLOCK, input: {} });
  assert.equal(pay.reason, "payment_command_refused");
  assert.equal(pay.status, 403);
  assert.equal(pay.paymentCommand, false);
  const missing = handleApi({
    command: "claim",
    journeyPath: join(dir, "absent.json"),
    clock: CLOCK,
    input: { taskId: "heading-extract", holderId: "agent-a" },
  });
  assert.equal(missing.status, 404);
});

test("whole-effort matches direct TE, fee, and result-reuse steps", () => {
  for (const scenario of ["authorized", "unknown", "unauthorized"]) {
    const measured = measureWholeEffort({ clock: CLOCK, scenario });
    assert.equal(measured.ok, true, JSON.stringify(measured));
    assert.equal(measured.comparison.pricingInvented, false);
    assert.equal(measured.comparison.operatorCompute, "costs_unknown");
    assert.equal(measured.comparison.monetaryCost, "costs_unknown");
    assert.equal(measured.comparison.match.evidenceOutcome, true);
    assert.equal(measured.comparison.match.fee, true);
    assert.equal(measured.comparison.match.publicRewardOmitted, true);
    assert.equal(measured.comparison.direct.teDiagnose.exit, 0);
    assert.equal(measured.comparison.direct.teCompare.exit, 0);
    assert.equal(measured.comparison.direct.resultReuse.exit, 0);
    assert.equal(JSON.stringify(measured.proof).includes("2000000"), false);
    if (scenario === "authorized") {
      assert.equal(measured.comparison.composed.feeBps, 500);
      assert.equal(measured.comparison.composed.platformFeeAtomic, "100000");
      assert.equal(measured.comparison.composed.equalNet, true);
      assert.equal(measured.comparison.direct.hostedWalletMarketFee.feeBps, 500);
    } else {
      assert.equal(measured.comparison.direct.hostedWalletMarketFee.quoteNotCalled, true);
      assert.equal(measured.comparison.composed.platformFeeAtomic, undefined);
    }
    if (scenario === "unknown") {
      assert.equal(measured.comparison.composed.effortComparison, "costs_unknown");
      assert.equal(measured.comparison.composed.feeReadout, "gross_unknown");
    }
  }
});

test("committed receipts keep the public proof reward-free", () => {
  const proof = JSON.parse(readFileSync(join(packageRoot, "examples/public-proof.json"), "utf8"));
  const effort = JSON.parse(readFileSync(join(packageRoot, "examples/whole-effort-receipt.json"), "utf8"));
  assert.equal(proof.schema, "samedaydesk.two-sided-work.public-proof.v1");
  assert.equal(proof.rewardDisclosed, false);
  assert.equal(proof.publicShowcase, true);
  assert.equal(proof.marketLiquidity, false);
  assert.equal(JSON.stringify(proof).includes("2000000"), false);
  assert.equal(JSON.stringify(proof).includes("platformFeeAtomic"), false);
  assert.equal(effort.publicShowcase, false);
  assert.equal(effort.pricingInvented, false);
  assert.equal(effort.monetaryCost, "costs_unknown");
  assert.equal(effort.match.evidenceOutcome, true);
  assert.equal(effort.match.fee, true);
  assert.equal(effort.composed.feeBps, 500);
  assert.equal(effort.composed.equalNet, true);
  assert.equal(effort.direct.teDiagnose.exit, 0);
  assert.equal(effort.direct.resultReuse.exit, 0);
  assert.equal(effort.hostedWalletMarketServer, "not_called");
});

test("package source does not import a ledger, signer, or payment server", () => {
  const src = join(packageRoot, "src");
  const files = readdirSync(src).filter((name) => name.endsWith(".mjs"));
  const banned = [
    "hosted-wallet-market/src/server.mjs",
    "signature.mjs",
    "CREATE TABLE",
    "paymentCommand: true",
    "ledger: true",
  ];
  for (const name of files) {
    const text = readFileSync(join(src, name), "utf8");
    for (const token of banned) assert.equal(text.includes(token), false, `${name} contains ${token}`);
  }
});
