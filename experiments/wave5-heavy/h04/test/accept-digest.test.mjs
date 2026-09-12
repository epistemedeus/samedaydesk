import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filesEquivalent, sha256Bytes, stableJsonDigest } from "../accept-pack/src/digest.mjs";
import { H04_ROOT } from "../src/paths.mjs";

function pinDeltaLike({ generatedAt, changed = 3 } = {}) {
  return {
    schema: "samedaydesk.lockfile-pin-delta.v1",
    appId: "lockfile-pin-delta",
    ok: true,
    status: "actionable",
    purchaseAuthority: false,
    paidValueClaim: false,
    settlement: "nonsettling-prototype",
    counts: {
      beforePins: 102,
      afterPins: 102,
      added: 0,
      removed: 0,
      changed,
      unchanged: 99,
      missingIntegrity: 0,
    },
    added: [],
    removed: [],
    changed: [
      {
        id: "node_modules/concurrently",
        name: "concurrently",
        changeKinds: ["version", "integrity"],
      },
    ],
    caller: {
      before: "before.json",
      after: "after.json",
    },
    provenance: "caller-supplied",
    generatedAt,
    meta: { generatedAt: "nested-should-strip", keep: true },
  };
}

function writeTemp(name, contents) {
  const dir = mkdtempSync(join(tmpdir(), "h04-accept-digest-"));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

test("sha256Bytes is hex sha256 of the buffer", () => {
  assert.equal(sha256Bytes(Buffer.from("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("pin-delta-like objects differing only in generatedAt are equal", () => {
  const a = pinDeltaLike({ generatedAt: "2026-09-11T23:27:21.182Z" });
  const b = pinDeltaLike({ generatedAt: "2026-09-11T23:27:21.226Z" });
  assert.notEqual(a.generatedAt, b.generatedAt);
  assert.equal(stableJsonDigest(a), stableJsonDigest(b));
  const pathA = writeTemp("pin-delta.json", JSON.stringify(a, null, 2));
  const pathB = writeTemp("pin-delta.json", `${JSON.stringify(b)}\n`);
  const result = filesEquivalent(pathA, pathB);
  assert.equal(result.equal, true, result.reason);
  assert.equal(result.reason, "stable-json");
});

test("markdown differing by one space is not equal", () => {
  const pathA = writeTemp("pin-delta.md", "# Pin delta\nchanged: 3\n");
  const pathB = writeTemp("pin-delta.md", "# Pin delta\nchanged: 3 \n");
  const result = filesEquivalent(pathA, pathB);
  assert.equal(result.equal, false, result.reason);
  assert.match(result.reason, /^byte-mismatch:/);
});

test("JSON differing in counts.changed is not equal", () => {
  const a = pinDeltaLike({ generatedAt: "2026-09-11T23:27:21.182Z", changed: 3 });
  const b = pinDeltaLike({ generatedAt: "2026-09-11T23:27:21.182Z", changed: 4 });
  assert.notEqual(a.counts.changed, b.counts.changed);
  assert.notEqual(stableJsonDigest(a), stableJsonDigest(b));
  const pathA = writeTemp("pin-delta.json", JSON.stringify(a));
  const pathB = writeTemp("pin-delta.json", JSON.stringify(b));
  const result = filesEquivalent(pathA, pathB);
  assert.equal(result.equal, false, result.reason);
  assert.match(result.reason, /^stable-json-mismatch:/);
});

test("live pin-delta pair is equivalent when cli/out and lib/out exist", () => {
  const pathA = join(H04_ROOT, "runs/m01-equivalence/cli/out/pin-delta.json");
  const pathB = join(H04_ROOT, "runs/m01-equivalence/lib/out/pin-delta.json");
  if (!existsSync(pathA) || !existsSync(pathB)) return;
  const result = filesEquivalent(pathA, pathB);
  assert.equal(result.equal, true, result.reason);
});
