import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  D01_EXECUTION_CONTRACT,
  D01_RECEIPT_PIN,
  D01_RECEIPT_SCHEMA,
} from "../lib/pins.mjs";
import { sha256File } from "../lib/digest.mjs";
import {
  CLOCK,
  EXPIRES,
  afterPath,
  beforePath,
  ensureD01PinCheckout,
  loadD01Library,
  parseJson,
  runD01Wrapper,
  runMailbox,
  tmp,
} from "./helpers.mjs";

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function seedExecution(mailbox, requestId, jobId, executionPath, outDir) {
  return runMailbox([
    "seed",
    "--mailbox",
    mailbox,
    "--request-id",
    requestId,
    "--job-id",
    jobId,
    "--from-d01-execution",
    executionPath,
    "--from-out-dir",
    outDir,
    "--clock",
    CLOCK,
    "--expires-at",
    EXPIRES,
  ]);
}

describe("D01 execution.v1 binding (in-repo, not aeef964 assumptions)", { timeout: 180_000 }, () => {
  it("CLI supplied-input execution can be put, picked up, and acked with same-byte identity", () => {
    const pinRoot = ensureD01PinCheckout();
    const wrapperOut = tmp("rmb-d01-cli-out-");
    const wrapper = runD01Wrapper(pinRoot, [
      "run",
      "vendor-budget-impact",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--out-dir",
      wrapperOut,
    ]);
    assert.equal(wrapper.status, 0, wrapper.stderr + wrapper.stdout);
    const execution = parseJson(wrapper.stdout);
    assert.equal(execution.contract, D01_EXECUTION_CONTRACT);
    assert.equal(execution.ok, true);
    assert.equal(execution.transport, "ok");
    assert.equal(execution.delivery.complete, true);
    assert.equal(Array.isArray(execution.outputs), true);
    assert.equal(execution.outputs.length >= 1, true);
    for (const row of execution.outputs) {
      assert.equal(typeof row.name, "string");
      assert.equal(Number.isSafeInteger(row.bytes), true);
      assert.match(row.sha256, /^[0-9a-f]{64}$/);
    }
    const receiptPath = join(wrapperOut, "receipt.json");
    assert.equal(existsSync(receiptPath), true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(receipt.schema, D01_RECEIPT_SCHEMA);
    assert.equal(receipt.contract, D01_EXECUTION_CONTRACT);
    assert.equal(receipt.delivery.complete, true);
    assert.notEqual(receipt.schema, execution.contract);

    const executionPath = writeJson(join(tmp("rmb-d01-exec-"), "execution.json"), execution);
    const mailbox = tmp("rmb-d01-mail-");
    const pickupOut = tmp("rmb-d01-pick-");
    const seed = seedExecution(mailbox, "req-d01-1", "vendor-budget-impact", executionPath, execution.runOutDir || wrapperOut);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const seeded = parseJson(seed.stdout);
    assert.equal(seeded.ok, true);
    assert.equal(seeded.deliveredToBuyer, false);
    assert.equal(seeded.d01.contract, D01_EXECUTION_CONTRACT);
    assert.equal(seeded.d01.pin, D01_RECEIPT_PIN);
    assert.equal(seeded.envelope.schema !== D01_RECEIPT_SCHEMA, true);
    assert.notEqual(seeded.envelope.termsVersion, D01_EXECUTION_CONTRACT);

    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-d01-1",
      "--out",
      pickupOut,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickup.status, 0, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.status, "retrieved");
    assert.equal(body.deliveredToBuyer, false);
    assert.equal(body.acknowledged, false);

    for (const row of execution.outputs) {
      const dest = join(pickupOut, row.name);
      assert.equal(existsSync(dest), true, row.name);
      assert.equal(sha256File(dest), row.sha256);
      assert.equal(readFileSync(dest).length, row.bytes);
      assert.deepEqual(readFileSync(dest), readFileSync(join(wrapperOut, row.name)));
      const listed = seeded.envelope.artifacts.find((a) => a.name === row.name);
      assert.equal(listed.sha256, row.sha256);
    }

    const ack = runMailbox(["ack", "--mailbox", mailbox, "--request-id", "req-d01-1", "--clock", CLOCK]);
    assert.equal(ack.status, 0, ack.stderr + ack.stdout);
    const acked = parseJson(ack.stdout);
    assert.equal(acked.deliveredToBuyer, true);
    assert.equal(acked.requestId, "req-d01-1");
    assert.equal(acked.status, "acknowledged");

    const unknown = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-does-not-exist",
      "--out",
      tmp("rmb-d01-unknown-"),
      "--clock",
      CLOCK,
    ]);
    assert.equal(unknown.status, 2);
    const unknownBody = parseJson(unknown.stdout);
    assert.equal(unknownBody.code, "unknown-request");
    assert.equal(unknownBody.deliveredToBuyer, false);
  });

  it("two D01 executions cannot retrieve each other's artifacts", () => {
    const pinRoot = ensureD01PinCheckout();
    const evidenceInput = join(
      pinRoot,
      "server/paid-useful-jobs/fixtures/caller/evidence-ci-annotation/input.json",
    );
    const outA = tmp("rmb-d01-two-a-");
    const outB = tmp("rmb-d01-two-b-");
    const runA = runD01Wrapper(pinRoot, [
      "run",
      "vendor-budget-impact",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--out-dir",
      outA,
    ]);
    const runB = runD01Wrapper(pinRoot, [
      "run",
      "evidence-ci-annotation",
      "--input",
      evidenceInput,
      "--out-dir",
      outB,
    ]);
    assert.equal(runA.status, 0, runA.stderr + runA.stdout);
    assert.equal(runB.status, 0, runB.stderr + runB.stdout);
    const execA = parseJson(runA.stdout);
    const execB = parseJson(runB.stdout);
    assert.equal(execA.contract, D01_EXECUTION_CONTRACT);
    assert.equal(execB.contract, D01_EXECUTION_CONTRACT);
    assert.equal(execA.jobId, "vendor-budget-impact");
    assert.equal(execB.jobId, "evidence-ci-annotation");

    const mailbox = tmp("rmb-d01-two-mail-");
    const seedA = seedExecution(
      mailbox,
      "req-job-a",
      "vendor-budget-impact",
      writeJson(join(tmp("rmb-d01-a-json-"), "execution.json"), execA),
      execA.runOutDir || outA,
    );
    const seedB = seedExecution(
      mailbox,
      "req-job-b",
      "evidence-ci-annotation",
      writeJson(join(tmp("rmb-d01-b-json-"), "execution.json"), execB),
      execB.runOutDir || outB,
    );
    assert.equal(seedA.status, 0, seedA.stderr + seedA.stdout);
    assert.equal(seedB.status, 0, seedB.stderr + seedB.stdout);

    const pickA = tmp("rmb-d01-two-pick-a-");
    const pickB = tmp("rmb-d01-two-pick-b-");
    const pickupA = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-job-a",
      "--out",
      pickA,
      "--clock",
      CLOCK,
    ]);
    const pickupB = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-job-b",
      "--out",
      pickB,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickupA.status, 0, pickupA.stderr + pickupA.stdout);
    assert.equal(pickupB.status, 0, pickupB.stderr + pickupB.stdout);
    assert.equal(existsSync(join(pickA, "budget-impact.json")), true);
    assert.equal(existsSync(join(pickA, "annotations.json")), false);
    assert.equal(existsSync(join(pickB, "annotations.json")), true);
    assert.equal(existsSync(join(pickB, "budget-impact.json")), false);
    assert.equal(sha256File(join(pickA, "budget-impact.json")), execA.outputs.find((o) => o.name === "budget-impact.json").sha256);
    assert.equal(sha256File(join(pickB, "annotations.json")), execB.outputs.find((o) => o.name === "annotations.json").sha256);

    const ackA = runMailbox(["ack", "--mailbox", mailbox, "--request-id", "req-job-a", "--clock", CLOCK]);
    assert.equal(parseJson(ackA.stdout).deliveredToBuyer, true);
    const envB = JSON.parse(readFileSync(join(mailbox, "req-job-b", "envelope.json"), "utf8"));
    assert.equal(envB.deliveredToBuyer, false);
  });

  it("library useful-refused analysis with complete artifacts is pickable, not a crash", async () => {
    const pinRoot = ensureD01PinCheckout();
    const { createExecutor } = await loadD01Library(pinRoot);
    const wrapperOut = tmp("rmb-d01-refused-out-");
    const execute = createExecutor({
      runEngine(_jobId, opts) {
        mkdirSync(opts.outDir, { recursive: true });
        writeFileSync(join(opts.outDir, "budget-impact.json"), `${JSON.stringify({ analysis: "refused" })}\n`);
        writeFileSync(join(opts.outDir, "budget-impact.md"), "useful refusal report\n");
        return {
          status: 0,
          stdout: JSON.stringify({ ok: false, status: "informational", refused: true }),
          stderr: "",
          json: { ok: false, status: "informational", refused: true },
        };
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: { before: beforePath, after: afterPath },
      outDir: wrapperOut,
    });
    assert.equal(result.contract, D01_EXECUTION_CONTRACT);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.transport, "ok");
    assert.equal(result.delivery.complete, true);
    assert.equal(result.analysis.outcome, "refused");
    assert.equal(result.receipt.schema, D01_RECEIPT_SCHEMA);

    const mailbox = tmp("rmb-d01-refused-mail-");
    const seed = seedExecution(
      mailbox,
      "req-useful-refused",
      "vendor-budget-impact",
      writeJson(join(tmp("rmb-d01-refused-json-"), "execution.json"), result),
      result.runOutDir || wrapperOut,
    );
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const seeded = parseJson(seed.stdout);
    assert.equal(seeded.ok, true);
    assert.equal(seeded.deliveredToBuyer, false);
    assert.equal(seeded.d01.analysis.outcome, "refused");

    const pickupOut = tmp("rmb-d01-refused-pick-");
    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-useful-refused",
      "--out",
      pickupOut,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickup.status, 0, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.deliveredToBuyer, false);
    assert.equal(body.status, "retrieved");
    assert.equal(readFileSync(join(pickupOut, "budget-impact.md"), "utf8"), "useful refusal report\n");
    assert.equal(sha256File(join(pickupOut, "budget-impact.json")), result.outputs.find((o) => o.name === "budget-impact.json").sha256);
  });

  it("library crash and missing-output cannot be stored as pickupable delivery", async () => {
    const pinRoot = ensureD01PinCheckout();
    const { createExecutor, runPaidOffer } = await loadD01Library(pinRoot);
    const mailbox = tmp("rmb-d01-fail-mail-");

    const crashed = await createExecutor({
      runEngine() {
        throw new Error("spawn failed");
      },
    })({
      jobId: "vendor-budget-impact",
      inputs: { before: beforePath, after: afterPath },
    });
    assert.equal(crashed.ok, false);
    assert.equal(crashed.transport, "engine-crash");
    const crashSeed = seedExecution(
      mailbox,
      "req-crash",
      "vendor-budget-impact",
      writeJson(join(tmp("rmb-d01-crash-json-"), "execution.json"), crashed),
      tmp("rmb-d01-crash-out-"),
    );
    assert.equal(crashSeed.status, 2, crashSeed.stderr + crashSeed.stdout);
    assert.equal(parseJson(crashSeed.stdout).code, "d01-transport-not-retrievable");
    assert.equal(existsSync(join(mailbox, "req-crash", "envelope.json")), false);

    const stale = tmp("rmb-d01-missing-stale-");
    writeFileSync(join(stale, "budget-impact.json"), '{"stale":true}');
    writeFileSync(join(stale, "budget-impact.md"), "stale\n");
    const missing = await createExecutor({
      runEngine() {
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, status: "completed" }),
          stderr: "",
          json: { ok: true, status: "completed" },
        };
      },
    })({
      jobId: "vendor-budget-impact",
      inputs: { before: beforePath, after: afterPath },
      outDir: stale,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "missing-output");
    const missingSeed = seedExecution(
      mailbox,
      "req-missing",
      "vendor-budget-impact",
      writeJson(join(tmp("rmb-d01-missing-json-"), "execution.json"), missing),
      stale,
    );
    assert.equal(missingSeed.status, 2, missingSeed.stderr + missingSeed.stdout);
    assert.equal(parseJson(missingSeed.stdout).code, "d01-missing-output");
    assert.equal(existsSync(join(mailbox, "req-missing", "envelope.json")), false);

    const unknownJob = await runPaidOffer({ jobId: "not-a-catalog-job" });
    assert.equal(unknownJob.ok, false);
    assert.equal(unknownJob.code, "unknown-job");
    const unknownSeed = seedExecution(
      mailbox,
      "req-unknown-job",
      "vendor-budget-impact",
      writeJson(join(tmp("rmb-d01-unk-json-"), "execution.json"), unknownJob),
      tmp("rmb-d01-unk-out-"),
    );
    assert.equal(unknownSeed.status, 2);
    const unknownBody = parseJson(unknownSeed.stdout);
    assert.equal(unknownBody.ok, false);
    assert.notEqual(unknownBody.code, "unknown-request");
    assert.equal(["d01-transport-not-retrievable", "invalid-d01-execution"].includes(unknownBody.code), true);
    assert.equal(existsSync(join(mailbox, "req-unknown-job", "envelope.json")), false);

    const crashedPickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-crash",
      "--out",
      tmp("rmb-d01-crash-pick-"),
      "--clock",
      CLOCK,
    ]);
    assert.equal(crashedPickup.status, 2);
    assert.equal(parseJson(crashedPickup.stdout).code, "unknown-request");

    const staleAeef = seedExecution(
      mailbox,
      "req-aeef-shape",
      "vendor-budget-impact",
      writeJson(join(tmp("rmb-d01-aeef-"), "receipt.json"), {
        schema: D01_RECEIPT_SCHEMA,
        jobId: "vendor-budget-impact",
        outputs: [{ name: "budget-impact.json", bytes: 1, sha256: "aa".repeat(32) }],
        engineResult: { ok: false, refused: true },
      }),
      tmp("rmb-d01-aeef-out-"),
    );
    assert.equal(staleAeef.status, 2);
    assert.equal(parseJson(staleAeef.stdout).code, "invalid-d01-execution");
  });
});
