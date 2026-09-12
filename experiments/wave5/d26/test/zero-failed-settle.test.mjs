import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rm } from "node:fs/promises";
import { LIVE_LOCKFILE_PRICE_ATOMIC, LIVE_LOCKFILE_PATH } from "../lib/pins.mjs";
import { loadH04Pairs } from "../lib/corpus.mjs";
import {
  classifyHttp,
  nextPaymentId,
  startFakeFacilitator,
  startMerchant,
  stopChild,
  testPayment,
  decodePaymentRequired,
  jsonPost,
} from "../lib/merchant-harness.mjs";
import { htmlRefuseBody, pathRefuseBody } from "../lib/controlled.mjs";

async function post(base, body, headers = {}) {
  return fetch(`${base}${LIVE_LOCKFILE_PATH}`, jsonPost(body, headers));
}

describe("mounted lockfile handler: atomic quote and zero failed settles", { timeout: 180_000 }, () => {
  it("H04 corpus pairs verify against pinned sha256", () => {
    const pairs = loadH04Pairs();
    assert.equal(pairs.length, 10);
    assert.equal(pairs.some((p) => p.id === "h04-pub-lock-01"), true);
    assert.equal(pairs.some((p) => p.id === "h04-lock-pub-b07-large"), true);
  });

  it("successful settle is 1; HTML/path/timeout-or-crash settle is 0", async (t) => {
    const pairs = loadH04Pairs();
    const tiny = pairs.find((p) => p.id === "h04-lock-02");
    assert.ok(tiny);

    const facilitator = await startFakeFacilitator();
    let merchant;
    t.after(async () => {
      if (merchant) await stopChild(merchant.child);
      await facilitator.close();
      if (merchant?.dataDir) await rm(merchant.dataDir, { recursive: true, force: true });
    });
    merchant = await startMerchant({ facilitatorUrl: facilitator.url });

    const unpaid = await post(merchant.base, tiny.body);
    assert.equal(unpaid.status, 402);
    const challenge = decodePaymentRequired(unpaid);
    const accepted = challenge.accepts.find((e) => e.scheme === "exact");
    assert.equal(String(accepted.amount), LIVE_LOCKFILE_PRICE_ATOMIC);
    assert.equal(facilitator.calls.settle, 0);

    const paid = await post(merchant.base, tiny.body, {
      "payment-signature": testPayment(challenge, { id: nextPaymentId("ok") }),
    });
    const paidBody = await paid.json();
    assert.equal(paid.status, 200, JSON.stringify(paidBody));
    assert.equal(paidBody.charged, true);
    assert.equal(facilitator.calls.settle, 1);
    assert.equal(classifyHttp(paid.status, paidBody.charged), "successful");

    const html = await post(merchant.base, htmlRefuseBody(), {
      "payment-signature": testPayment(challenge, { id: nextPaymentId("html") }),
    });
    const htmlBody = await html.json();
    assert.ok(html.status >= 400);
    assert.notEqual(html.status, 200);
    assert.equal(htmlBody.charged, false);
    assert.equal(facilitator.calls.settle, 1, "HTML refuse must not settle");

    const pathRes = await post(merchant.base, pathRefuseBody());
    const pathBody = await pathRes.json();
    assert.equal(pathRes.status, 400);
    assert.equal(pathBody.charged, false);
    assert.equal(facilitator.calls.settle, 1, "path refuse must not settle");
  });

  it("injected crash is HTTP 503, charged false, settle 0", async (t) => {
    const pairs = loadH04Pairs();
    const tiny = pairs.find((p) => p.id === "h04-lock-02");
    const facilitator = await startFakeFacilitator();
    let merchant;
    t.after(async () => {
      if (merchant) await stopChild(merchant.child);
      await facilitator.close();
      if (merchant?.dataDir) await rm(merchant.dataDir, { recursive: true, force: true });
    });
    merchant = await startMerchant({
      facilitatorUrl: facilitator.url,
      extraEnv: { LOCKFILE_PIN_DELTA_WORKER_CRASH: "1" },
    });
    const unpaid = await post(merchant.base, tiny.body);
    assert.equal(unpaid.status, 402);
    const challenge = decodePaymentRequired(unpaid);
    assert.equal(facilitator.calls.settle, 0);
    const paid = await post(merchant.base, tiny.body, {
      "payment-signature": testPayment(challenge, { id: nextPaymentId("crash") }),
    });
    const body = await paid.json();
    assert.equal(paid.status, 503, JSON.stringify(body));
    assert.equal(body.charged, false);
    assert.equal(facilitator.calls.settle, 0);
    assert.equal(classifyHttp(paid.status, body.charged), "failed");
  });
});
