import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { MAILBOX_PIN_SHA, OUTPUT_JSON } from "../lib/pins.mjs";
import { assertNotSale, mailboxPickupOutcome, OUTCOME } from "../lib/outcomes.mjs";
import { parseJsonStdout, runNode } from "../lib/spawn.mjs";
import { catalogJobIds } from "../lib/resolve.mjs";
import {
  completeF08Job,
  f08,
  mailbox,
  pickupMailbox,
  readEnvelope,
  runOutbox,
  seedMailbox,
  sha256File,
  tmp,
} from "./helpers.mjs";

describe("W5-D20 isolation, destination, and current-pin predictions", { timeout: 180_000 }, () => {
  it("two requestIds cannot retrieve each other's artifacts", () => {
    const job = completeF08Job(tmp("w5d20-f08-iso-"));
    const mailboxDir = tmp("w5d20-mail-iso-");
    const seedA = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      "req-a",
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      job.outDir,
    ]);
    assert.equal(seedA.status, 0, seedA.stderr + seedA.stdout);
    const seedB = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      "req-b",
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      job.outDir,
    ]);
    assert.equal(seedB.status, 0, seedB.stderr + seedB.stdout);
    const mutated = join(mailboxDir, "req-b", "artifacts", OUTPUT_JSON);
    writeFileSync(mutated, Buffer.from("not-request-a-bytes\n"));

    const outA = tmp("w5d20-out-a-");
    const pickA = parseJsonStdout(
      pickupMailbox(["--mailbox", mailboxDir, "--request-id", "req-a", "--out", outA]),
    );
    assert.equal(pickA.requestId, "req-a");
    assert.equal(sha256File(join(outA, OUTPUT_JSON)), sha256File(join(job.outDir, OUTPUT_JSON)));

    const pickB = pickupMailbox(["--mailbox", mailboxDir, "--request-id", "req-b", "--out", tmp("w5d20-out-b-")]);
    assert.equal(pickB.status, 2);
    const bodyB = parseJsonStdout(pickB);
    assert.equal(bodyB.code, "digest-mismatch");
    assert.equal(bodyB.requestId, "req-b");
    assert.notEqual(pickA.requestId, "req-b");
  });

  it("slash and backslash requestIds are invalid-request-id", () => {
    const mailboxDir = tmp("w5d20-mail-trav-");
    mkdirSync(mailboxDir, { recursive: true });
    for (const requestId of ["../escape", "foo/bar", "a\\b"]) {
      const pickup = pickupMailbox([
        "--mailbox",
        mailboxDir,
        "--request-id",
        requestId,
        "--out",
        tmp("w5d20-trav-out-"),
      ]);
      assert.equal(pickup.status, 2, requestId);
      const body = parseJsonStdout(pickup);
      assert.equal(body.ok, false, requestId);
      assert.equal(body.code, "invalid-request-id", requestId);
      assertNotSale(assert, body);
    }
  });

  it("bare .. is still a Co02 pin path escape into the mailbox parent", () => {
    const job = completeF08Job(tmp("w5d20-f08-dotdot-"));
    const mailboxDir = tmp("w5d20-mail-dotdot-");
    const seed = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      "req-legit",
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      job.outDir,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const parent = dirname(mailboxDir);
    const envelope = readEnvelope(mailboxDir, "req-legit");
    envelope.requestId = "..";
    mkdirSync(join(parent, "artifacts"), { recursive: true });
    cpSync(join(mailboxDir, "req-legit", "artifacts"), join(parent, "artifacts"), { recursive: true });
    writeFileSync(join(parent, "envelope.json"), `${JSON.stringify(envelope, null, 2)}\n`);

    const pickup = pickupMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      "..",
      "--out",
      tmp("w5d20-dotdot-out-"),
    ]);
    const body = parseJsonStdout(pickup);
    if (mailbox().sha === MAILBOX_PIN_SHA) {
      assert.equal(pickup.status, 0, pickup.stderr + pickup.stdout);
      assert.equal(body.ok, true);
      assert.equal(body.requestId, "..");
      assert.equal(mailboxPickupOutcome(body).class, OUTCOME.RETRIEVED);
    } else {
      assert.equal(pickup.status, 2);
      assert.equal(body.ok, false);
      assert.notEqual(body.status, "retrieved");
    }
  });

  it("pickup to a dest that already holds stale bytes copies the verified mailbox artifact", () => {
    const job = completeF08Job(tmp("w5d20-f08-stale-"));
    const mailboxDir = tmp("w5d20-mail-stale-");
    const requestId = "req-stale-dest";
    const seed = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      requestId,
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      job.outDir,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const dest = tmp("w5d20-stale-out-");
    writeFileSync(join(dest, OUTPUT_JSON), Buffer.from("stale-caller-bytes\n"));
    const pickup = parseJsonStdout(
      pickupMailbox(["--mailbox", mailboxDir, "--request-id", requestId, "--out", dest]),
    );
    assert.equal(mailboxPickupOutcome(pickup).class, OUTCOME.RETRIEVED);
    assert.equal(sha256File(join(dest, OUTPUT_JSON)), sha256File(join(job.outDir, OUTPUT_JSON)));
    assert.notEqual(readFileSync(join(dest, OUTPUT_JSON), "utf8"), "stale-caller-bytes\n");
  });

  it("unknown catalog jobId on the Co02 pin still seeds via vendor-budget output names", () => {
    const job = completeF08Job(tmp("w5d20-f08-unk-"));
    const mailboxDir = tmp("w5d20-mail-unk-");
    const seed = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      "req-unknown-job",
      "--job-id",
      "not-in-catalog",
      "--from-out-dir",
      job.outDir,
    ]);
    const body = parseJsonStdout(seed);
    const ids = catalogJobIds(mailbox().root);
    assert.equal(ids.includes("not-in-catalog"), false);
    if (mailbox().sha === MAILBOX_PIN_SHA) {
      assert.equal(seed.status, 0, seed.stderr + seed.stdout);
      assert.equal(body.ok, true);
      assert.equal(body.envelope.jobId, "not-in-catalog");
      assert.equal(readEnvelope(mailboxDir, "req-unknown-job").jobId, "not-in-catalog");
    } else {
      assert.equal(seed.status, 2);
      assert.equal(body.ok, false);
    }
  });

  it("wrong callback destination and mutated digest fail; origin is not forced equal to mailbox terms", () => {
    const job = completeF08Job(tmp("w5d20-f08-dest-"));
    const store = tmp("w5d20-store-dest-");
    const remote = runOutbox([
      "enqueue",
      "--store",
      store,
      "--receipt",
      job.receiptPath,
      "--callback-url",
      "http://example.com/hooks",
    ]);
    assert.equal(remote.status, 2);
    assert.equal(parseJsonStdout(remote).code, "callback-url-not-loopback");

    const secret = runOutbox([
      "enqueue",
      "--store",
      store,
      "--receipt",
      job.receiptPath,
      "--callback-url",
      "http://127.0.0.1:9/callback?token=secret",
    ]);
    assert.equal(secret.status, 2);
    assert.equal(parseJsonStdout(secret).code, "callback-url-secrets");

    const first = parseJsonStdout(
      runOutbox([
        "enqueue",
        "--store",
        store,
        "--receipt",
        job.receiptPath,
        "--callback-url",
        "http://127.0.0.1:9/callback",
        "--event-id",
        "evt_dest",
      ]),
    );
    assert.equal(first.ok, true);
    const otherPath = runOutbox([
      "enqueue",
      "--store",
      store,
      "--receipt",
      job.receiptPath,
      "--callback-url",
      "http://127.0.0.1:9/other",
      "--event-id",
      "evt_dest",
    ]);
    assert.equal(otherPath.status, 2);
    assert.equal(parseJsonStdout(otherPath).code, "event-id-body-conflict");

    const mutated = { ...job.receipt, outputsDigest: "a".repeat(64) };
    const mutatedPath = join(tmp("w5d20-mut-"), "receipt.json");
    writeFileSync(mutatedPath, `${JSON.stringify(mutated, null, 2)}\n`);
    const digest = runOutbox([
      "enqueue",
      "--store",
      store,
      "--receipt",
      mutatedPath,
      "--callback-url",
      "http://127.0.0.1:9/callback",
      "--event-id",
      "evt_dest",
    ]);
    assert.equal(digest.status, 2);
    assert.equal(parseJsonStdout(digest).code, "event-id-body-conflict");
    assert.match(String(first.event.termsHash), /^[0-9a-f]{64}$/);
    assert.notEqual(first.event.termsHash, first.event.termsVersion);
    const mailboxDir = tmp("w5d20-mail-terms-");
    const seed = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      "req-terms-compare",
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      job.outDir,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const envelope = readEnvelope(mailboxDir, "req-terms-compare");
    assert.match(String(envelope.termsVersion), /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(envelope.termsVersion, first.event.termsHash);
    assert.notEqual(envelope.schema, "samedaydesk.job-delivery-outbox.terms.v1");
  });

  it("F08 missing input is analysis refusal, not a delivered mailbox or outbox ack", () => {
    const wrapper = f08();
    const result = runNode(wrapper.cli, ["run", "vendor-budget-impact", "--funding", "unfunded"], {
      cwd: wrapper.root,
    });
    assert.equal(result.status, 2, result.stderr + result.stdout);
    const body = parseJsonStdout(result);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.sold, false);
    assert.notEqual(body.code, "delivered");
    assert.notEqual(mailboxPickupOutcome(body).class, OUTCOME.RETRIEVED);
  });
});
