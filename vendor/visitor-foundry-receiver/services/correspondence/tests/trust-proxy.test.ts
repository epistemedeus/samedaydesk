import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, parseTrustProxyHops } from "../src/config.js";

const ADMIN = "test-admin-token-please-change-now";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    CORRESPONDENCE_STORE: "memory",
    CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    ...overrides,
  };
}

test("trust proxy defaults to 0 and accepts hop counts 0–5", () => {
  assert.equal(parseTrustProxyHops(undefined), 0);
  assert.equal(parseTrustProxyHops(""), 0);
  assert.equal(parseTrustProxyHops("false"), 0);
  assert.equal(parseTrustProxyHops("0"), 0);
  assert.equal(parseTrustProxyHops("1"), 1);
  assert.equal(parseTrustProxyHops("5"), 5);
  assert.equal(loadConfig(env()).trustProxyHops, 0);
  assert.equal(loadConfig(env({ CORRESPONDENCE_TRUST_PROXY: "1" })).trustProxyHops, 1);
});

test("trust proxy rejects boolean true and out-of-range values", () => {
  assert.throws(() => parseTrustProxyHops("true"), /integer hop count/);
  assert.throws(() => parseTrustProxyHops("-1"));
  assert.throws(() => parseTrustProxyHops("6"));
  assert.throws(() => parseTrustProxyHops("1.5"));
  assert.throws(() => parseTrustProxyHops("abc"));
  assert.throws(() => loadConfig(env({ CORRESPONDENCE_TRUST_PROXY: "true" })));
});
