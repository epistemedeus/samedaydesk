import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runObtainArchive } from "./lib/obtain.mjs";
import { EXPECTED_CURRENT } from "./lib/pin.mjs";
import { OBTAIN_ARCHIVE_REL, REPO_ROOT } from "./lib/root.mjs";

const CURRENT_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz";
const STALE_110_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz";

test("obtain-archive binary is committed", () => {
  assert.equal(existsSync(join(REPO_ROOT, OBTAIN_ARCHIVE_REL)), true);
  assert.equal(existsSync(join(REPO_ROOT, CURRENT_REL)), true);
  assert.equal(existsSync(join(REPO_ROOT, STALE_110_REL)), true);
});

test("real obtain of 1.4.7 against current pin succeeds", () => {
  const r = runObtainArchive({
    fromRel: CURRENT_REL,
    expectedSha256: EXPECTED_CURRENT.sha256,
    expectedBytes: EXPECTED_CURRENT.bytes,
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.refused, false);
  assert.equal(r.sha256, EXPECTED_CURRENT.sha256);
  assert.equal(r.bytes, EXPECTED_CURRENT.bytes);
  assert.equal(r.extracted, false);
  assert.equal(r.executed, false);
  assert.equal(r.childExit, 0);
});

test("real obtain of 1.1.0 against current pin refuses wrong-size (child exit 0)", () => {
  const r = runObtainArchive({
    fromRel: STALE_110_REL,
    expectedSha256: EXPECTED_CURRENT.sha256,
    expectedBytes: EXPECTED_CURRENT.bytes,
  });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.refused, true);
  assert.equal(r.code, "wrong-size");
  assert.equal(r.childExit, 0);
  assert.equal(r.destExists, false);
  assert.equal(r.extracted, false);
});

test("real obtain of 1.1.0 bytes vs 1.4.7 sha refuses wrong-digest (child exit 0)", () => {
  const r = runObtainArchive({
    fromRel: STALE_110_REL,
    expectedSha256: EXPECTED_CURRENT.sha256,
    expectedBytes: 2577606,
  });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.refused, true);
  assert.equal(r.code, "wrong-digest");
  assert.equal(r.childExit, 0);
  assert.equal(r.destExists, false);
});

test("HTTP --from is LIVE_REFUSE", () => {
  const r = runObtainArchive({
    fromRel: "https://example.com/useful-jobs-1.4.7.tar.gz",
    expectedSha256: EXPECTED_CURRENT.sha256,
    expectedBytes: EXPECTED_CURRENT.bytes,
  });
  assert.equal(r.code, "LIVE_REFUSE");
  assert.equal(r.ok, false);
});
