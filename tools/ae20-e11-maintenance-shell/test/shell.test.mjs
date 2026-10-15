import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sealedDigest } from "../src/consume.mjs";
import { runMaintenanceShell } from "../src/occurrence.mjs";
import { PINS } from "../src/pins.mjs";
import { authority, shellInput, templateResult } from "./support.mjs";

const AMOUNT_KEYS = [
  "feeAtoms",
  "grossAtoms",
  "perCaptureNetAtoms",
  "perCaptureFeeAtoms",
  "combinedGrossAtoms",
  "combinedGrossFeeAtoms",
  "usdc",
  "reward",
  "price",
  "amount",
];

test("a current safe-derivative grant reads the retained repair once", () => {
  const out = runMaintenanceShell(shellInput());
  assert.equal(out.ok, true);
  assert.equal(out.code, "maintained");
  assert.equal(out.used, true);
  assert.equal(out.useful, true);
  assert.equal(out.usefulness, "useful_positive");
  assert.equal(out.disposition, "repair");
  assert.equal(out.acceptance, "accepted");
  assert.equal(out.retainedSkuReused, true);
  assert.deepEqual(out.change, ["contractVersion"]);
  assert.equal(out.occurrenceId, "compat-maint-cedar-1");
  assert.equal(out.taskId, "cedar-chair-reuse");
  assert.equal(out.distinctTaskId, "desk-batch-retain");
  assert.equal(out.laterTaskId, "tasklate-cedar");
  assert.equal(out.tenantId, "tenanta");
  assert.equal(out.rights, "safe_derivative_only");
  assert.equal(out.asked, "safe_derivative");
  assert.equal(out.rawServed, false);
  assert.equal(out.posts, 1);
  assert.equal(out.secondPost, false);
  assert.equal(out.executed, true);
  assert.equal(out.readback, false);
  assert.equal(out.supplierRerun, false);
  assert.equal(out.timerStarted, false);
  assert.equal(out.wroteQueue, false);
  assert.equal(out.wrotePrior, false);
  assert.equal(out.authorityStore, false);
  assert.equal(out.ledger, false);
  assert.equal(out.iouStore, false);
  assert.equal(out.published, false);
  assert.equal(out.paid, false);
  assert.equal(out.captured, false);
  assert.equal(out.settled, false);
  assert.equal(out.publicEnabled, false);
  assert.equal(out.finite, true);
  assert.equal(out.hJoin, "pending-join");
  assert.equal(out.laterConsumer, "J2 maintained-applicability step");
  assert.equal(out.consumedDigest, templateResult().digest);
  assert.equal(out.permissionChecks.every((row) => row.ok === true), true);
  assert.equal(Object.hasOwn(out, "text"), false);
  const body = JSON.stringify(out);
  for (const key of AMOUNT_KEYS) assert.equal(body.includes(key), false, key);
});

test("the same occurrence id is idempotent and a matching replay does not post again", () => {
  const first = runMaintenanceShell(shellInput());
  const second = runMaintenanceShell(shellInput());
  assert.deepEqual(first, second);
  const replay = runMaintenanceShell(shellInput({ priorShell: first }));
  assert.equal(replay.ok, true);
  assert.equal(replay.readback, true);
  assert.equal(replay.executed, false);
  assert.equal(replay.secondPost, false);
  assert.equal(replay.posts, 1);
  assert.equal(replay.digest, first.digest);
  assert.equal(replay.used, true);
});

test("a conflicting same-id replay does not post a second effect", () => {
  const first = runMaintenanceShell(shellInput());
  const prior = { ...first, digest: "0".repeat(64) };
  const replay = runMaintenanceShell(shellInput({ priorShell: prior }));
  assert.equal(replay.code, "ambiguous_conflict");
  assert.equal(replay.ok, false);
  assert.equal(replay.used, false);
  assert.equal(replay.executed, false);
  assert.equal(replay.secondPost, false);
  assert.equal(replay.posts, 1);
  assert.equal(replay.rawServed, false);
});

test("a session token is not a grant and is not echoed", () => {
  const token = "sekret-token-value";
  const withToken = runMaintenanceShell(shellInput({ sessionToken: token }));
  assert.equal(withToken.ok, true);
  assert.equal(JSON.stringify(withToken).includes(token), false);
  const missing = runMaintenanceShell(shellInput({ readCurrent: null, sessionToken: token }));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "missing_permission");
  assert.equal(missing.used, false);
  assert.equal(JSON.stringify(missing).includes(token), false);
});

test("extra coverage does not widen a safe grant into raw bytes", () => {
  const readCurrent = authority({
    knowledge: { coverage: ["accepted_artifact", "raw_bytes"] },
  });
  const safe = runMaintenanceShell(shellInput({ readCurrent }));
  assert.equal(safe.ok, true);
  assert.equal(safe.rights, "safe_derivative_only");
  assert.equal(safe.rawServed, false);
  assert.equal(Object.hasOwn(safe, "text"), false);
  const raw = runMaintenanceShell(shellInput({ readCurrent, asked: "raw" }));
  assert.equal(raw.ok, false);
  assert.equal(raw.code, "wrong_rights");
  assert.equal(raw.used, false);
  assert.equal(raw.rawServed, false);
});

test("the consumed fixture is the prior finite template result", () => {
  const result = templateResult();
  assert.equal(result.schema, PINS.consumed.e11.resultSchema);
  assert.equal(result.supplier228200.commit, PINS.consumed.supplier228200.commit);
  assert.equal(result.supplier228200.rerun, false);
  assert.equal(result.finiteQueue228300.commit, PINS.consumed.finiteQueue228300.commit);
  assert.equal(result.finiteQueue228300.copied, false);
  assert.equal(result.timerStarted, false);
  assert.equal(result.wroteQueue, false);
  assert.equal(sealedDigest(result), result.digest);
});

test("the cli returns the same json as the function", () => {
  const call = JSON.parse(readFileSync(new URL("../fixtures/call.json", import.meta.url), "utf8"));
  const ran = spawnSync(process.execPath, [
    new URL("../cli.mjs", import.meta.url).pathname,
    "run",
    "--result", new URL("../fixtures/template-result.json", import.meta.url).pathname,
    "--authority", new URL("../fixtures/authority-current.json", import.meta.url).pathname,
    "--principal", new URL("../fixtures/principal.json", import.meta.url).pathname,
    "--work", new URL("../fixtures/work.json", import.meta.url).pathname,
    "--now", call.now,
    "--later-task", call.laterTaskId,
    "--asked", call.asked,
  ], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(JSON.parse(ran.stdout), runMaintenanceShell(shellInput()));
});

test("the cli refuses a raw ask and refuses to write a receipt", () => {
  const call = JSON.parse(readFileSync(new URL("../fixtures/call.json", import.meta.url), "utf8"));
  const args = [
    new URL("../cli.mjs", import.meta.url).pathname,
    "run",
    "--result", new URL("../fixtures/template-result.json", import.meta.url).pathname,
    "--authority", new URL("../fixtures/authority-current.json", import.meta.url).pathname,
    "--principal", new URL("../fixtures/principal.json", import.meta.url).pathname,
    "--work", new URL("../fixtures/work.json", import.meta.url).pathname,
    "--now", call.now,
    "--later-task", call.laterTaskId,
  ];
  const raw = spawnSync(process.execPath, [...args, "--asked", "raw"], { encoding: "utf8" });
  assert.equal(raw.status, 1, raw.stderr);
  const body = JSON.parse(raw.stdout);
  assert.equal(body.code, "wrong_rights");
  assert.equal(body.rawServed, false);
  assert.equal(body.used, false);
  const dir = mkdtempSync(join(tmpdir(), "ae20-e11-"));
  try {
    const write = spawnSync(process.execPath, [...args, "--asked", "safe_derivative", "--out", join(dir, "receipt.json")], { encoding: "utf8" });
    assert.equal(write.status, 2);
    assert.equal(JSON.parse(write.stderr).ok, false);
    assert.throws(() => readFileSync(join(dir, "receipt.json"), "utf8"), { code: "ENOENT" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("owned lint passes", () => {
  const ran = spawnSync(process.execPath, [new URL("../lint.mjs", import.meta.url).pathname], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
});
