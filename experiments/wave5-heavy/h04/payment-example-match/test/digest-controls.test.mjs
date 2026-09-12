import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OBSERVED,
  PAID_EVIDENCE_REQUEST_DOMAIN,
  emptyGetBody,
  paidEvidenceRequestDigest,
  targetFromPublishedUrl,
} from "../src/digest.mjs";

test("positive synthetic: same method/target/empty body repeats", () => {
  const a = paidEvidenceRequestDigest("GET", "/extract?url=control-known", emptyGetBody());
  const b = paidEvidenceRequestDigest("GET", "/extract?url=control-known", emptyGetBody());
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("one-byte target flip changes digest", () => {
  const base = "/extract?url=https%3A%2F%2Fexample.com";
  const flipped = `${base.slice(0, -1)}n`;
  assert.notEqual(base, flipped);
  assert.notEqual(
    paidEvidenceRequestDigest("GET", base, emptyGetBody()),
    paidEvidenceRequestDigest("GET", flipped, emptyGetBody()),
  );
});

test("one-byte body flip changes digest", () => {
  const target = "/extract?url=https%3A%2F%2Fexample.com";
  assert.notEqual(
    paidEvidenceRequestDigest("GET", target, emptyGetBody()),
    paidEvidenceRequestDigest("GET", target, Buffer.from([0])),
  );
});

test("percent-encoded public demo matches the triple observed digest", () => {
  const target = "/extract?url=https%3A%2F%2Fexample.com";
  assert.equal(paidEvidenceRequestDigest("GET", target, emptyGetBody()), OBSERVED.triple);
});

test("unencoded published curl variant does not match either observed digest", () => {
  const target = "/extract?url=https://example.com";
  const d = paidEvidenceRequestDigest("GET", target, emptyGetBody());
  assert.notEqual(d, OBSERVED.triple);
  assert.notEqual(d, OBSERVED.fourth);
});

test("path-only /extract does not match either observed digest", () => {
  const d = paidEvidenceRequestDigest("GET", "/extract", emptyGetBody());
  assert.notEqual(d, OBSERVED.triple);
  assert.notEqual(d, OBSERVED.fourth);
});

test("absolute URL as target does not match (originalUrl is path+query)", () => {
  const d = paidEvidenceRequestDigest(
    "GET",
    "https://agents.samedaydesk.com/extract?url=https%3A%2F%2Fexample.com",
    emptyGetBody(),
  );
  assert.notEqual(d, OBSERVED.triple);
});

test("WHATWG search preserves published encoding", () => {
  assert.equal(
    targetFromPublishedUrl("https://agents.samedaydesk.com/extract?url=https%3A%2F%2Fexample.com"),
    "/extract?url=https%3A%2F%2Fexample.com",
  );
  assert.equal(
    targetFromPublishedUrl("https://agents.samedaydesk.com/extract?url=https://example.com"),
    "/extract?url=https://example.com",
  );
});

test("domain string includes trailing NUL as in source", () => {
  assert.equal(PAID_EVIDENCE_REQUEST_DOMAIN.endsWith("\0"), true);
  assert.equal(PAID_EVIDENCE_REQUEST_DOMAIN.includes("request.v1"), true);
});
