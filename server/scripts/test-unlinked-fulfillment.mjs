import test from "node:test";
import assert from "node:assert/strict";
import { fulfillFromIntent } from "../lib/fulfill.js";

test("an unlinked hosted payment reaches its own delivery store without requiring account storage", async () => {
  const denied = new Proxy({}, { get() { throw new Error("Account storage must stay untouched"); } });
  assert.deepEqual(await fulfillFromIntent({ id: "pi_unlinked", metadata: {} }, { sb: denied, attemptStore: denied }),
    { ok: false, reason: "no_uid" });
  // In the isolated Care preview there is deliberately no Supabase account service.
  assert.deepEqual(await fulfillFromIntent({ id: "pi_unlinked", metadata: {} }), { ok: false, reason: "no_uid" });
});
