import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sha256Bytes } from "../lib/digest.mjs";
import { materializeVerifiedArtifacts } from "../lib/pickup.mjs";
import {
  ACK_SCHEMA,
  D01_EXECUTION_CONTRACT,
  D01_RECEIPT_SCHEMA,
  ENVELOPE_SCHEMA,
  MAILBOX_TERMS_VERSION,
  PICKUP_SCHEMA,
} from "../lib/index.mjs";
import {
  CLOCK,
  EXPIRES,
  cli,
  parseJson,
  runMailbox,
  tmp,
} from "./helpers.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";

function writeVendorOut(dir, marker) {
  mkdirSync(dir, { recursive: true });
  const json = Buffer.from(`${JSON.stringify({ marker, kind: "json" })}\n`);
  const md = Buffer.from(`# ${marker}\n`);
  writeFileSync(join(dir, "budget-impact.json"), json);
  writeFileSync(join(dir, "budget-impact.md"), md);
  return { json, md };
}

function runMailboxAsync(args) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: REPO_ROOT,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (status) => resolveP({ status, stdout, stderr }));
  });
}

describe("request-bound pickup isolation (CLI/process)", { timeout: 120_000 }, () => {
  it("two requests cannot retrieve each other's output; pickup is not ack", () => {
    const mailbox = tmp("rmb-iso-mail-");
    const outA = tmp("rmb-iso-a-");
    const outB = tmp("rmb-iso-b-");
    const pickA = tmp("rmb-iso-pick-a-");
    const pickB = tmp("rmb-iso-pick-b-");
    const bytesA = writeVendorOut(outA, "SECRET-A-ONLY");
    const bytesB = writeVendorOut(outB, "SECRET-B-ONLY");

    const seedA = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-a",
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      outA,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seedA.status, 0, seedA.stderr + seedA.stdout);
    const seedB = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-b",
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      outB,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seedB.status, 0, seedB.stderr + seedB.stdout);

    const pickupA = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-a",
      "--out",
      pickA,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickupA.status, 0, pickupA.stderr + pickupA.stdout);
    const bodyA = parseJson(pickupA.stdout);
    assert.equal(bodyA.ok, true);
    assert.equal(bodyA.status, "retrieved");
    assert.equal(bodyA.deliveredToBuyer, false);
    assert.equal(bodyA.requestId, "req-a");
    assert.equal(readFileSync(join(pickA, "budget-impact.json")).includes("SECRET-A-ONLY"), true);
    assert.equal(readFileSync(join(pickA, "budget-impact.json")).includes("SECRET-B-ONLY"), false);
    assert.deepEqual(readFileSync(join(pickA, "budget-impact.json")), bytesA.json);
    assert.notDeepEqual(readFileSync(join(pickA, "budget-impact.json")), bytesB.json);

    const pickupB = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-b",
      "--out",
      pickB,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickupB.status, 0, pickupB.stderr + pickupB.stdout);
    const bodyB = parseJson(pickupB.stdout);
    assert.equal(bodyB.deliveredToBuyer, false);
    assert.equal(readFileSync(join(pickB, "budget-impact.json")).includes("SECRET-B-ONLY"), true);
    assert.equal(readFileSync(join(pickB, "budget-impact.json")).includes("SECRET-A-ONLY"), false);

    const ackA = runMailbox(["ack", "--mailbox", mailbox, "--request-id", "req-a", "--clock", CLOCK]);
    assert.equal(ackA.status, 0, ackA.stderr + ackA.stdout);
    const ackedA = parseJson(ackA.stdout);
    assert.equal(ackedA.schema, ACK_SCHEMA);
    assert.equal(ackedA.deliveredToBuyer, true);
    assert.equal(ackedA.requestId, "req-a");
    assert.equal(existsSync(join(mailbox, "req-b", "ack.json")), false);

    const ackBProbe = JSON.parse(readFileSync(join(mailbox, "req-a", "envelope.json"), "utf8"));
    const envB = JSON.parse(readFileSync(join(mailbox, "req-b", "envelope.json"), "utf8"));
    assert.equal(ackBProbe.deliveredToBuyer, true);
    assert.equal(envB.deliveredToBuyer, false);

    const pickupAfterAck = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-a",
      "--out",
      tmp("rmb-iso-pick-a2-"),
      "--clock",
      CLOCK,
    ]);
    const after = parseJson(pickupAfterAck.stdout);
    assert.equal(after.ok, true);
    assert.equal(after.deliveredToBuyer, false);
    assert.equal(after.acknowledged, true);
  });

  it("simultaneous CLI pickups stay request-bound", async () => {
    const mailbox = tmp("rmb-par-mail-");
    const outA = tmp("rmb-par-a-");
    const outB = tmp("rmb-par-b-");
    writeVendorOut(outA, "PARA-A");
    writeVendorOut(outB, "PARA-B");
    assert.equal(
      runMailbox([
        "seed",
        "--mailbox",
        mailbox,
        "--request-id",
        "req-par-a",
        "--job-id",
        "vendor-budget-impact",
        "--from-out-dir",
        outA,
        "--clock",
        CLOCK,
        "--expires-at",
        EXPIRES,
      ]).status,
      0,
    );
    assert.equal(
      runMailbox([
        "seed",
        "--mailbox",
        mailbox,
        "--request-id",
        "req-par-b",
        "--job-id",
        "vendor-budget-impact",
        "--from-out-dir",
        outB,
        "--clock",
        CLOCK,
        "--expires-at",
        EXPIRES,
      ]).status,
      0,
    );
    const pickA = tmp("rmb-par-pick-a-");
    const pickB = tmp("rmb-par-pick-b-");
    const [a, b] = await Promise.all([
      runMailboxAsync([
        "pickup",
        "--mailbox",
        mailbox,
        "--request-id",
        "req-par-a",
        "--out",
        pickA,
        "--clock",
        CLOCK,
      ]),
      runMailboxAsync([
        "pickup",
        "--mailbox",
        mailbox,
        "--request-id",
        "req-par-b",
        "--out",
        pickB,
        "--clock",
        CLOCK,
      ]),
    ]);
    assert.equal(a.status, 0, a.stderr + a.stdout);
    assert.equal(b.status, 0, b.stderr + b.stdout);
    assert.equal(readFileSync(join(pickA, "budget-impact.md"), "utf8").includes("PARA-A"), true);
    assert.equal(readFileSync(join(pickB, "budget-impact.md"), "utf8").includes("PARA-B"), true);
    assert.equal(readFileSync(join(pickA, "budget-impact.json"), "utf8").includes("PARA-B"), false);
    assert.equal(readFileSync(join(pickB, "budget-impact.json"), "utf8").includes("PARA-A"), false);
  });

  it("traversal requestIds are refused at the CLI and do not read sibling files", () => {
    const mailbox = tmp("rmb-trav-mail-");
    mkdirSync(mailbox, { recursive: true });
    const leaked = join(mailbox, "..", `leaked-${Date.now()}`);
    mkdirSync(join(leaked, "artifacts"), { recursive: true });
    writeFileSync(join(leaked, "artifacts", "budget-impact.json"), Buffer.from("LEAKED-BYTES\n"));
    writeFileSync(
      join(leaked, "envelope.json"),
      `${JSON.stringify({ schema: ENVELOPE_SCHEMA, requestId: ".." }, null, 2)}\n`,
    );
    const pickupOut = tmp("rmb-trav-pick-");
    for (const id of ["..", ".", "../secret", "foo/bar"]) {
      const pickup = runMailbox([
        "pickup",
        "--mailbox",
        mailbox,
        "--request-id",
        id,
        "--out",
        pickupOut,
        "--clock",
        CLOCK,
      ]);
      assert.equal(pickup.status, 2, pickup.stdout);
      const body = parseJson(pickup.stdout);
      assert.equal(body.ok, false);
      assert.equal(["invalid-request-id", "unknown-request"].includes(body.code), true);
      assert.equal(body.deliveredToBuyer, false);
      assert.equal(existsSync(join(pickupOut, "budget-impact.json")), false);
    }
  });

  it("unknown jobId does not fall back to vendor-budget output names", () => {
    const mailbox = tmp("rmb-unk-mail-");
    const outDir = tmp("rmb-unk-out-");
    writeVendorOut(outDir, "SHOULD-NOT-SEED");
    const seed = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-unknown-job",
      "--job-id",
      "not-a-catalog-job",
      "--from-out-dir",
      outDir,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seed.status, 2, seed.stderr + seed.stdout);
    const body = parseJson(seed.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "unknown-job");
    assert.equal(existsSync(join(mailbox, "req-unknown-job", "envelope.json")), false);
  });

  it("materialize writes captured buffers, not a later mutated source path", () => {
    const dest = tmp("rmb-race-dest-");
    const srcDir = tmp("rmb-race-src-");
    const listed = { name: "budget-impact.json", bytes: 4, sha256: sha256Bytes(Buffer.from("good")) };
    const src = join(srcDir, listed.name);
    writeFileSync(src, Buffer.from("good"));
    const buf = readFileSync(src);
    writeFileSync(src, Buffer.from("mutated-after-hash"));
    const copied = materializeVerifiedArtifacts([{ listed, buf }], dest);
    assert.equal(copied[0].ok, true);
    assert.equal(readFileSync(join(dest, listed.name)).toString(), "good");
    assert.notEqual(readFileSync(src).toString(), "good");
  });
});

describe("published export", () => {
  it("exports request-bound schemas and does not force D01 receipt terms equal", async () => {
    const mod = await import("../lib/index.mjs");
    assert.equal(mod.ENVELOPE_SCHEMA, ENVELOPE_SCHEMA);
    assert.equal(mod.PICKUP_SCHEMA, PICKUP_SCHEMA);
    assert.equal(mod.ACK_SCHEMA, ACK_SCHEMA);
    assert.equal(mod.D01_RESULT_CONTRACT.contract, D01_EXECUTION_CONTRACT);
    assert.equal(mod.D01_RESULT_CONTRACT.receiptSchema, D01_RECEIPT_SCHEMA);
    assert.notEqual(mod.MAILBOX_TERMS_VERSION, D01_EXECUTION_CONTRACT);
    assert.match(MAILBOX_TERMS_VERSION, /^sha256:[0-9a-f]{64}$/);
    assert.equal(typeof mod.pickup, "function");
    assert.equal(typeof mod.acknowledge, "function");
    assert.equal(typeof mod.seedFromD01Execution, "function");
    assert.notEqual(mod.ENVELOPE_SCHEMA, D01_EXECUTION_CONTRACT);
    assert.notEqual(mod.ENVELOPE_SCHEMA, D01_RECEIPT_SCHEMA);
  });
});
