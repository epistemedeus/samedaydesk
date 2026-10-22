import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildEnvelope } from "../lib/envelope.mjs";
import { sha256Bytes } from "../lib/digest.mjs";
import { MAILBOX_TERMS_VERSION } from "../lib/terms.mjs";
import {
  CLOCK,
  EXPIRED_CLOCK,
  EXPIRES,
  afterPath,
  beforePath,
  parseJson,
  runMailbox,
  tmp,
  writeRawEnvelope,
} from "./helpers.mjs";

describe("seeded failures", { timeout: 120_000 }, () => {
  it("SAMPLE envelope is refused as delivered", () => {
    const mailbox = tmp("rmb-sample-mail-");
    const engineOut = tmp("rmb-sample-engine-");
    const pickupOut = tmp("rmb-sample-pickup-");
    const requestId = "req-sample-1";

    const seed = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--job-id",
      "vendor-budget-impact",
      "--example",
      "--out-dir",
      engineOut,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const seeded = parseJson(seed.stdout);
    assert.equal(seeded.sample, true);
    assert.equal(seeded.deliveredToBuyer, false);

    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--out",
      pickupOut,
      "--clock",
      CLOCK,
      "--delivered",
    ]);
    assert.equal(pickup.status, 2, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "sample-not-delivered");
    assert.equal(body.deliveredToBuyer, false);
    assert.equal(body.status, "sample-not-delivered");
  });

  it("unknown requestId exits 2", () => {
    const mailbox = tmp("rmb-unknown-mail-");
    mkdirSync(mailbox, { recursive: true });
    const pickupOut = tmp("rmb-unknown-pickup-");
    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "does-not-exist",
      "--out",
      pickupOut,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickup.status, 2, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "unknown-request");
    assert.equal(body.deliveredToBuyer, false);
  });

  it("mutated output bytes fail digest check", () => {
    const mailbox = tmp("rmb-digest-mail-");
    const engineOut = tmp("rmb-digest-engine-");
    const pickupOut = tmp("rmb-digest-pickup-");
    const requestId = "req-digest-1";

    const seed = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--job-id",
      "vendor-budget-impact",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--out-dir",
      engineOut,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);

    const mutated = join(mailbox, requestId, "artifacts", "budget-impact.json");
    writeFileSync(mutated, Buffer.from("mutated-not-the-engine-bytes\n"));

    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--out",
      pickupOut,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickup.status, 2, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "digest-mismatch");
    assert.equal(body.deliveredToBuyer, false);
    assert.equal(body.status, "digest-mismatch");
  });

  it("expired labelled envelope returns expired not delivered", () => {
    const mailbox = tmp("rmb-exp-mail-");
    const engineOut = tmp("rmb-exp-engine-");
    const pickupOut = tmp("rmb-exp-pickup-");
    const requestId = "req-expired-1";

    const seed = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--job-id",
      "vendor-budget-impact",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--out-dir",
      engineOut,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);

    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--out",
      pickupOut,
      "--clock",
      EXPIRED_CLOCK,
    ]);
    assert.equal(pickup.status, 2, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.status, "expired");
    assert.equal(body.code, "expired");
    assert.equal(body.deliveredToBuyer, false);
    assert.equal(body.expiry.state, "expired");
    const pickupJson = JSON.parse(readFileSync(join(pickupOut, "pickup.json"), "utf8"));
    assert.equal(pickupJson.status, "expired");
    assert.equal(pickupJson.deliveredToBuyer, false);
  });

  it("integer termsVersion is rejected (I01 contract)", () => {
    const mailbox = tmp("rmb-terms-mail-");
    const pickupOut = tmp("rmb-terms-pickup-");
    const bytes = Buffer.from("not-used\n");
    writeRawEnvelope(
      mailbox,
      "req-int-terms",
      {
        schema: "samedaydesk.result-mailbox.envelope.v1",
        schemaVersion: 1,
        termsVersion: 1,
        requestId: "req-int-terms",
        jobId: "vendor-budget-impact",
        completedAt: CLOCK,
        expiresAt: EXPIRES,
        sample: false,
        deliveredToBuyer: false,
        artifacts: [{ name: "budget-impact.json", bytes: bytes.length, sha256: sha256Bytes(bytes) }],
      },
      [{ name: "budget-impact.json", bytes }],
    );
    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-int-terms",
      "--out",
      pickupOut,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickup.status, 2, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid-terms-version");
    assert.equal(body.deliveredToBuyer, false);
  });

  it("buildEnvelope refuses SAMPLE delivered-to-buyer labels", () => {
    const bytes = Buffer.from("x\n");
    const art = { name: "budget-impact.json", bytes: bytes.length, sha256: sha256Bytes(bytes) };
    assert.throws(
      () =>
        buildEnvelope({
          requestId: "req-bad",
          jobId: "vendor-budget-impact",
          completedAt: CLOCK,
          expiresAt: EXPIRES,
          sample: true,
          deliveredToBuyer: true,
          artifacts: [art],
        }),
      /SAMPLE envelopes cannot be labelled delivered-to-buyer/,
    );
    assert.equal(typeof MAILBOX_TERMS_VERSION, "string");
    assert.match(MAILBOX_TERMS_VERSION, /^sha256:[0-9a-f]{64}$/);
    const ok = buildEnvelope({
      requestId: "req-ok",
      jobId: "vendor-budget-impact",
      completedAt: CLOCK,
      expiresAt: EXPIRES,
      sample: true,
      deliveredToBuyer: false,
      artifacts: [art],
    });
    assert.equal(ok.deliveredToBuyer, false);
  });

  it("SAMPLE pickup without --delivered is retrieved-sample, not delivered-to-buyer", () => {
    const mailbox = tmp("rmb-sample-ok-mail-");
    const engineOut = tmp("rmb-sample-ok-engine-");
    const pickupOut = tmp("rmb-sample-ok-pickup-");
    const requestId = "req-sample-retrieve";

    const seed = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--job-id",
      "vendor-budget-impact",
      "--example",
      "--out-dir",
      engineOut,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);

    const pickup = runMailbox([
      "pickup",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--out",
      pickupOut,
      "--clock",
      CLOCK,
    ]);
    assert.equal(pickup.status, 0, pickup.stderr + pickup.stdout);
    const body = parseJson(pickup.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.status, "retrieved-sample");
    assert.equal(body.deliveredToBuyer, false);
    assert.equal(body.sample, true);
  });
});
