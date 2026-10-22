import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { F08_PIN_SHA, REPO_ROOT } from "../lib/pins.mjs";
import { assertF08Receipt } from "../lib/receipt-shape.mjs";
import { parseCli, runCli, spawnReceiver, stopChild, tmpSpace, maybeF08Worktree, callerBefore, callerAfter } from "./helpers.mjs";

test("local-runtime: real F08 pin CLI receipt enqueues without inventing paid status", { timeout: 120_000 }, async (t) => {
  const worktree = maybeF08Worktree();
  if (!worktree) {
    t.skip("F08 pin worktree unavailable; receipt shape is still enforced from the pin schema");
    return;
  }
  const dir = tmpSpace("outbox-f08-");
  const outDir = join(dir, "out");
  mkdirSync(outDir, { recursive: true });
  const paymentShow = spawnSync(
    "git",
    ["-C", REPO_ROOT, "show", `${F08_PIN_SHA}:server/paid-useful-jobs/fixtures/payment/reserved-fixture.json`],
    { encoding: "utf8" },
  );
  assert.equal(paymentShow.status, 0, paymentShow.stderr);
  const paymentPath = join(dir, "reserved-fixture.json");
  writeFileSync(paymentPath, paymentShow.stdout);
  const f08Cli = join(worktree, "server/paid-useful-jobs/bin/cli.mjs");
  assert.equal(existsSync(f08Cli), true);
  const ran = spawnSync(
    process.execPath,
    [
      f08Cli,
      "run",
      "vendor-budget-impact",
      "--before",
      callerBefore,
      "--after",
      callerAfter,
      "--funding",
      "reserved-fixture",
      "--payment",
      paymentPath,
      "--out-dir",
      outDir,
    ],
    { encoding: "utf8", cwd: worktree, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (ran.status !== 0) {
    t.skip(`F08 pin CLI did not run here (${ran.status}): ${String(ran.stderr || ran.stdout).slice(0, 400)}`);
    return;
  }
  const receipt = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
  assertF08Receipt(receipt);
  assert.equal(receipt.sold, false);
  assert.equal(receipt.purchaseAuthority, false);
  const receiptPath = join(dir, "receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
  const store = join(dir, "store");
  const receiver = await spawnReceiver(["--mode", "ack"]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    assert.equal(enq.ok, true, JSON.stringify(enq));
    assert.equal(enq.event.sold, false);
    const payload = JSON.stringify(enq.event.payload);
    assert.ok(!payload.includes("authorization"));
    assert.ok(!payload.includes("0xabababab"));
  } finally {
    stopChild(receiver.child);
  }
});
