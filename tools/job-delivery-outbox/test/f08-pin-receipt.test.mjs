import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SDS52_PIN_SHA, REPO_ROOT } from "../lib/pins.mjs";
import { assertF08Receipt, digestNamedBytes } from "../lib/receipt-shape.mjs";
import { parseCli, runCli, spawnReceiver, stopChild, tmpSpace, sds52Worktree, callerBefore, callerAfter } from "./helpers.mjs";

test("local-runtime: SDS52 wrapper CLI receipt enqueues without inventing paid status", { timeout: 120_000 }, async () => {
  const worktree = sds52Worktree();
  const dir = tmpSpace("outbox-sds52-");
  const outDir = join(dir, "out");
  mkdirSync(outDir, { recursive: true });
  const paymentPath = join(worktree, "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json");
  assert.equal(existsSync(paymentPath), true, "SDS52 reserved-fixture payment is required");
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
  assert.equal(ran.status, 0, `SDS52 CLI failed: ${String(ran.stderr || ran.stdout).slice(0, 800)}`);
  const receipt = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
  assertF08Receipt(receipt);
  assert.equal(receipt.sold, false);
  assert.equal(receipt.purchaseAuthority, false);
  assert.equal(receipt.outputsDigest, digestNamedBytes(receipt.outputs));
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
    assert.equal(enq.event.callbackDestination.path, "/callback");
    const payload = JSON.stringify(enq.event.payload);
    assert.ok(!payload.includes("authorization"));
    assert.ok(!payload.includes("0xabababab"));
    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
    );
    assert.equal(deliver.event.deliveryState, "delivered");
    assert.equal(deliver.event.buyerAccepted, false);
  } finally {
    stopChild(receiver.child);
  }
});

test("SDS52 pin is the tested wrapper; historical F08 sha is not invented as official", () => {
  assert.equal(SDS52_PIN_SHA, "aeef964fa188443078958d9d6d393afae1d542ee");
  const show = spawnSync("git", ["-C", REPO_ROOT, "cat-file", "-t", SDS52_PIN_SHA], { encoding: "utf8" });
  assert.equal(String(show.stdout).trim(), "commit");
});
