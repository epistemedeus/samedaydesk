import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { D01_RECEIPT_PIN, D01_RECEIPT_SCHEMA } from "../lib/pins.mjs";
import {
  CLOCK,
  EXPIRES,
  afterPath,
  beforePath,
  ensureD01PinCheckout,
  parseJson,
  runD01Wrapper,
  runMailbox,
  tmp,
} from "./helpers.mjs";

describe("D01 PR52 receipt binding (current pin, not a future wrapper)", { timeout: 180_000 }, () => {
  it("seeds from a live PR52 receipt and keeps mailbox terms distinct", () => {
    const pinRoot = ensureD01PinCheckout();
    const wrapperOut = tmp("rmb-d01-wrap-");
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
    const result = parseJson(wrapper.stdout);
    assert.equal(result.ok, true);
    const receiptPath = join(wrapperOut, "receipt.json");
    assert.equal(existsSync(receiptPath), true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(receipt.schema, D01_RECEIPT_SCHEMA);
    assert.equal(receipt.jobId, "vendor-budget-impact");
    assert.equal(existsSync(join(wrapperOut, "budget-impact.json")), true);

    const mailbox = tmp("rmb-d01-mail-");
    const pickupOut = tmp("rmb-d01-pick-");
    const seed = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-d01-1",
      "--job-id",
      "vendor-budget-impact",
      "--from-d01-receipt",
      receiptPath,
      "--from-out-dir",
      wrapperOut,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const seeded = parseJson(seed.stdout);
    assert.equal(seeded.ok, true);
    assert.equal(seeded.deliveredToBuyer, false);
    assert.match(seeded.envelope.termsVersion, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(seeded.envelope.schema, D01_RECEIPT_SCHEMA);
    assert.equal(seeded.envelope.jobId, "vendor-budget-impact");

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
    assert.equal(body.deliveredToBuyer, false);
    assert.deepEqual(
      readFileSync(join(pickupOut, "budget-impact.json")),
      readFileSync(join(wrapperOut, "budget-impact.json")),
    );

    const refusedReceipt = tmp("rmb-d01-bad-");
    const badPath = join(refusedReceipt, "receipt.json");
    writeFileSync(
      badPath,
      `${JSON.stringify(
        {
          schema: D01_RECEIPT_SCHEMA,
          jobId: "vendor-budget-impact",
          outputs: [{ name: "budget-impact.json", bytes: 1, sha256: "aa".repeat(32) }],
          engineResult: { ok: false, refused: true, status: "engine-refused" },
        },
        null,
        2,
      )}\n`,
    );
    const bad = runMailbox([
      "seed",
      "--mailbox",
      mailbox,
      "--request-id",
      "req-d01-refused",
      "--job-id",
      "vendor-budget-impact",
      "--from-d01-receipt",
      badPath,
      "--from-out-dir",
      wrapperOut,
      "--clock",
      CLOCK,
      "--expires-at",
      EXPIRES,
    ]);
    assert.equal(bad.status, 2, bad.stderr + bad.stdout);
    const refused = parseJson(bad.stdout);
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "d01-result-not-retrievable");
    assert.equal(existsSync(join(mailbox, "req-d01-refused", "envelope.json")), false);
    assert.equal(D01_RECEIPT_PIN, "aeef964fa188443078958d9d6d393afae1d542ee");
  });
});
