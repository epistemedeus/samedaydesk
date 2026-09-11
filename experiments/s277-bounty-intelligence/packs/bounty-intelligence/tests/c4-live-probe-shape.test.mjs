import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const probesPath = join(here, "../receipts/children/c4-probes.json");
const doc = JSON.parse(readFileSync(probesPath, "utf8"));
const probes = Array.isArray(doc) ? doc : doc.probes;

function findProbe(substr) {
  return (probes || []).find((p) => typeof p?.url === "string" && p.url.includes(substr));
}

function assertHonestOutage(p, label) {
  assert.equal(typeof p.error, "string", `${label} records an error string`);
  assert.ok(p.error.length > 0, `${label} error is non-empty`);
  assert.notEqual(p.httpStatus, 200, `${label} does not fake HTTP 200`);
  assert.equal(p.bodySha256, null, `${label} does not fake a body hash`);
}

function assertRecorded(p, label) {
  assert.ok(p, `${label} probe recorded`);
  assert.equal(typeof p.url, "string", `${label} url`);
  assert.equal(typeof p.ok, "boolean", `${label} ok`);
  assert.ok("httpStatus" in p, `${label} httpStatus`);
  assert.equal(typeof p.elapsed_ms, "number", `${label} elapsed_ms`);
  assert.equal(typeof p.bytes, "number", `${label} bytes`);
  assert.ok("error" in p, `${label} error`);
  assert.ok("bodySha256" in p, `${label} bodySha256`);
  if (p.ok) {
    assert.equal(p.httpStatus, 200, `${label} success is HTTP 200`);
    assert.match(String(p.bodySha256), /^[0-9a-f]{64}$/, `${label} bodySha256 hex`);
    assert.equal(p.error, null, `${label} success error is null`);
  } else {
    assertHonestOutage(p, label);
  }
}

test("moltjobs/frantic/github/neomorphic probes recorded", () => {
  assertRecorded(findProbe("api.moltjobs.io"), "moltjobs");
  assertRecorded(findProbe("gofrantic.com"), "frantic");
  assertRecorded(findProbe("api.github.com"), "github");
  assertRecorded(findProbe("neomorphic.io"), "neomorphic");
});

test("moltbook ok===false", () => {
  const p = findProbe("api.moltbook.com");
  assert.ok(p, "moltbook probe recorded");
  assert.equal(p.ok, false);
  assertHonestOutage(p, "moltbook");
});

test("neomorphic 200 is lab schedule schema, not a job board", () => {
  const p = findProbe("neomorphic.io");
  assert.ok(p, "neomorphic probe recorded");
  if (p.ok && p.httpStatus === 200) {
    assert.equal(typeof p.schemaPreview, "string");
    assert.equal(p.schemaPreview, "neomorphic.bounty-schedule.v1");
    assert.match(p.schemaPreview, /bounty-schedule/);
    assert.doesNotMatch(p.schemaPreview, /job[-_]?board/i);
  } else {
    assertHonestOutage(p, "neomorphic");
  }
});
