import assert from "node:assert/strict";
import test from "node:test";
import { childEnv } from "./lib/spawn.mjs";

test("child env strips payment keys and forces PAYMENT_SENT false", () => {
  const env = childEnv({
    STRIPE_SECRET_KEY: "sk_test",
    PAYMENT_SENT: "true",
    X402_TOKEN: "x",
    PATH: "/bin",
  });
  assert.equal(env.PAYMENT_SENT, "false");
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
  assert.equal(env.X402_TOKEN, undefined);
  assert.equal(env.PATH, "/bin");
});
