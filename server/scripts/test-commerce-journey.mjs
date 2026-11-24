import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { recordCommerceJourney } from "../lib/commerce-journey.js";

test("commerce observations require an anonymous session and never copy arbitrary buyer fields", async () => {
  const received = [], sessionId = randomUUID();
  const write = async (row) => { received.push(row); return true; };
  assert.equal(await recordCommerceJourney("payment_confirmed", { sessionId, key: "fixture" }, write), false);
  assert.equal(await recordCommerceJourney("payment_verified", { sessionId: "buyer@example.test", key: "fixture" }, write), false);
  assert.equal(await recordCommerceJourney("payment_verified", { sessionId, key: "pi_test", orderId: "order_test",
    live: false, email: "private@example.test", test: false }, write), true);
  assert.deepEqual(received, [{ event_key: "samedaydesk/payment_verified/pi_test", brand: "samedaydesk",
    event: "payment_verified", session_id: sessionId, test: true, order_id: "order_test", is_agent: false, referrer: null, utm: {}, traffic: null }]);
  assert.equal(await recordCommerceJourney("visit", { sessionId, key: sessionId }, async () => { throw new Error("offline"); }), false);
});
