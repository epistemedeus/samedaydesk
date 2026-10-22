import test from "node:test";
import assert from "node:assert/strict";
import { TERMS_VERSION_RE, hashTermsVersion, isTermsVersionHash } from "../vendor/i01-hash-terms/hash.mjs";
import { createHashTermsAdapter } from "../lib/hash-adapter.mjs";

test("pinned I01 hasher emits sha256: + 64 hex and rejects using integer as the hash", () => {
  const adapter = createHashTermsAdapter();
  const hashed = adapter.hashTermsVersion({
    schema: "samedaydesk.json-schema-webhook-drift.v1",
    schemaVersion: 1,
    kind: "json-schema",
  });
  assert.equal(isTermsVersionHash(hashed), true);
  assert.match(hashed, TERMS_VERSION_RE);
  assert.equal(adapter.isTermsVersionHash(1), false);
  assert.equal(adapter.isTermsVersionHash("1"), false);
  const again = hashTermsVersion({
    schema: "samedaydesk.json-schema-webhook-drift.v1",
    schemaVersion: 1,
    kind: "json-schema",
    termsVersion: 99,
  });
  assert.equal(again, hashed);
});

test("injected hasher adapter is used when provided", () => {
  const adapter = createHashTermsAdapter({
    hashTermsVersion: () => "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  assert.equal(
    adapter.hashTermsVersion({ schemaVersion: 1 }),
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
});
