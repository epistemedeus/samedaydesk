import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GOLDEN_TERMS_PATH,
  GOLDEN_TERMS_VERSION,
} from "../lib/pins.mjs";
import {
  assertPublicTermsVersion,
  hashReplayTerms,
  hashTermsVersion,
} from "../lib/terms.mjs";
import { ReplayRefuse } from "../lib/args.mjs";

test("I01 golden fixture hashes to the pinned content-hash termsVersion", () => {
  const golden = JSON.parse(readFileSync(GOLDEN_TERMS_PATH, "utf8"));
  assert.equal(golden.termsVersion, GOLDEN_TERMS_VERSION);
  const hashed = hashTermsVersion(golden);
  assert.equal(hashed, GOLDEN_TERMS_VERSION);
  assert.equal(golden.schemaVersion, 1);
});

test("integer termsVersion is dropped and cannot be a public claim key", () => {
  const hashed = hashTermsVersion({ schemaVersion: 1, jobId: "api-upgrade-brief", termsVersion: 1 });
  assert.match(hashed, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(hashed, "1");
  assert.throws(() => assertPublicTermsVersion(1), ReplayRefuse);
});

test("replay terms hasher refuses a non-hash public termsVersion", () => {
  assert.throws(
    () =>
      hashReplayTerms(
        { schemaVersion: 1, jobId: "x" },
        () => 7,
      ),
    ReplayRefuse,
  );
});
