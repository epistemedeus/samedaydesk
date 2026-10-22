import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CURRENT_PIN, STALE_PINS, loadStalePin } from "./lib/pin.mjs";
import { REPO_ROOT } from "./lib/root.mjs";
import { childEnv } from "./lib/spawn-env.mjs";

function sha256File(rel) {
  const buf = readFileSync(join(REPO_ROOT, rel));
  return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
}

test("live kit pin is 1.4.7 with cited sha+bytes", () => {
  assert.equal(CURRENT_PIN.version, "1.4.7");
  assert.equal(CURRENT_PIN.sha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(CURRENT_PIN.bytes, 5255824);
  assert.match(CURRENT_PIN.kitPath, /usefulJobsKit\.json$/);
});

test("historical 1.4.0 and 1.1.0 pins load from shipped sha256.json", () => {
  assert.equal(STALE_PINS["1.4.0"].sha256, "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f");
  assert.equal(STALE_PINS["1.4.0"].bytes, 2575215);
  assert.equal(STALE_PINS["1.1.0"].sha256, "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534");
  assert.equal(STALE_PINS["1.0.0"].sha256, "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51");
  assert.equal(loadStalePin("1.4.0").version, "1.4.0");
});

test("real 1.4.7 archive bytes match the live pin", () => {
  const got = sha256File("client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz");
  assert.equal(got.sha256, CURRENT_PIN.sha256);
  assert.equal(got.bytes, CURRENT_PIN.bytes);
});

test("real 1.4.0 archive is not the live pin", () => {
  const got = sha256File("client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz");
  assert.equal(got.sha256, STALE_PINS["1.4.0"].sha256);
  assert.equal(got.bytes, STALE_PINS["1.4.0"].bytes);
  assert.notEqual(got.sha256, CURRENT_PIN.sha256);
});

test("childEnv strips payment keys and forces PAYMENT_SENT=false", () => {
  const env = childEnv({
    PATH: "/usr/bin",
    STRIPE_SECRET_KEY: "sk_test_x",
    PAYMENT_POINTER: "x",
    X402_PAY_TO: "y",
    PAYMENT_SENT: "true",
    HOME: "/tmp",
  });
  assert.equal(env.PAYMENT_SENT, "false");
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
  assert.equal(env.PAYMENT_POINTER, undefined);
  assert.equal(env.X402_PAY_TO, undefined);
  assert.equal(env.HOME, "/tmp");
});
