import assert from "node:assert/strict";
import test from "node:test";
import { listenHostFromEnv, parseListenHost, parseShutdownTimeoutMs } from "../src/config.js";

test("listen host defaults to loopback; 0.0.0.0 must be explicit", () => {
  assert.equal(parseListenHost(undefined), "127.0.0.1");
  assert.equal(parseListenHost(""), "127.0.0.1");
  assert.equal(parseListenHost("127.0.0.1"), "127.0.0.1");
  assert.equal(parseListenHost("0.0.0.0"), "0.0.0.0");
  assert.equal(parseListenHost("::1"), "::1");
  assert.throws(() => parseListenHost("localhost"), /EARNED_WORK_LISTEN_HOST/);
  assert.throws(() => parseListenHost("*"), /EARNED_WORK_LISTEN_HOST/);
  assert.equal(listenHostFromEnv({}), "127.0.0.1");
  assert.equal(listenHostFromEnv({ EARNED_WORK_LISTEN_HOST: "0.0.0.0" }), "0.0.0.0");
  assert.equal(listenHostFromEnv({ HOST: "0.0.0.0" }), "0.0.0.0");
  assert.equal(listenHostFromEnv({ HOST: "0.0.0.0", EARNED_WORK_LISTEN_HOST: "127.0.0.1" }), "127.0.0.1");
  assert.equal(listenHostFromEnv({ HOST: "localhost" }), "127.0.0.1");
});

test("shutdown timeout is bounded", () => {
  assert.equal(parseShutdownTimeoutMs(undefined), 8000);
  assert.equal(parseShutdownTimeoutMs("100"), 100);
  assert.equal(parseShutdownTimeoutMs("60000"), 60_000);
  assert.throws(() => parseShutdownTimeoutMs("99"), /EARNED_WORK_SHUTDOWN_TIMEOUT_MS/);
  assert.throws(() => parseShutdownTimeoutMs("60001"), /EARNED_WORK_SHUTDOWN_TIMEOUT_MS/);
});
