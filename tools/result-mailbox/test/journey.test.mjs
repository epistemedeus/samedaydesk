import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sha256File } from "../lib/digest.mjs";
import { CLOCK, EXPIRES, afterPath, beforePath, parseJson, runMailbox, tmp } from "./helpers.mjs";

describe("literal caller journey (local-runtime engine)", { timeout: 120_000 }, () => {
  it("seeds vendor-budget-impact from engine outputs and picks up matching bytes", () => {
    const mailbox = tmp("rmb-mail-");
    const engineOut = tmp("rmb-engine-");
    const pickupOut = tmp("rmb-pickup-");
    const requestId = "req-vendor-budget-1";

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
    const seeded = parseJson(seed.stdout);
    assert.equal(seeded.ok, true);
    assert.equal(seeded.sample, false);
    assert.equal(seeded.deliveredToBuyer, false);
    assert.equal(seeded.envelope.jobId, "vendor-budget-impact");
    assert.match(seeded.envelope.termsVersion, /^sha256:[0-9a-f]{64}$/);
    assert.equal(existsSync(join(engineOut, "budget-impact.json")), true);
    assert.equal(existsSync(join(engineOut, "budget-impact.md")), true);

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
    assert.equal(body.status, "retrieved");
    assert.equal(body.deliveredToBuyer, false);
    assert.equal(body.acknowledged, false);
    assert.equal(body.retrievedAt, CLOCK);
    assert.equal(body.expiry.state, "unexpired");
    assert.equal(body.expiry.expiresAt, EXPIRES);

    const jsonName = "budget-impact.json";
    const mdName = "budget-impact.md";
    const srcJson = join(engineOut, jsonName);
    const srcMd = join(engineOut, mdName);
    const outJson = join(pickupOut, jsonName);
    const outMd = join(pickupOut, mdName);
    assert.equal(existsSync(outJson), true);
    assert.equal(existsSync(outMd), true);
    assert.equal(sha256File(outJson), sha256File(srcJson));
    assert.equal(sha256File(outMd), sha256File(srcMd));
    assert.deepEqual(
      readFileSync(outJson),
      readFileSync(srcJson),
    );

    const pickupJson = JSON.parse(readFileSync(join(pickupOut, "pickup.json"), "utf8"));
    assert.equal(pickupJson.schema, "samedaydesk.result-mailbox.pickup.v1");
    assert.equal(pickupJson.retrievedAt, CLOCK);
    assert.equal(pickupJson.deliveredToBuyer, false);
    assert.equal(pickupJson.sample, false);
    const listedJson = pickupJson.artifacts.find((a) => a.name === jsonName);
    assert.equal(listedJson.sha256, sha256File(outJson));
    assert.equal(listedJson.ok, true);

    const ack = runMailbox([
      "ack",
      "--mailbox",
      mailbox,
      "--request-id",
      requestId,
      "--clock",
      CLOCK,
    ]);
    assert.equal(ack.status, 0, ack.stderr + ack.stdout);
    const acked = parseJson(ack.stdout);
    assert.equal(acked.ok, true);
    assert.equal(acked.status, "acknowledged");
    assert.equal(acked.deliveredToBuyer, true);
    assert.equal(acked.requestId, requestId);
    assert.equal(existsSync(join(mailbox, requestId, "ack.json")), true);
    assert.equal(existsSync(join(mailbox, requestId, "retrieved.json")), true);
  });
});
