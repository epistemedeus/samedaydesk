import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { materializePinnedEngine } from "../lib/engine-bind.mjs";
import { assertInjectableHasher, hasherErasesByteDifference } from "../lib/hasher-guard.mjs";
import { TrialRefuse } from "../lib/errors.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";
import { disclosureHash } from "../lib/terms.mjs";

async function loadEngine() {
  const bind = materializePinnedEngine({ repoRoot: REPO_ROOT });
  return import(pathToFileURL(join(bind.root, "lib/index.mjs")).href);
}

function gitShow(sha) {
  const r = spawnSync("git", ["-C", REPO_ROOT, "show", `${sha}:package-lock.json`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test("pinned engine: constant hasher wipes the real SDS vuln-update delta", async () => {
  const { compareLockfileTexts, createHashTermsAdapter } = await loadEngine();
  const before = gitShow("126776d364302a610f3e1a91c19191b99ef3b99a");
  const after = gitShow("62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf");
  const def = compareLockfileTexts(before, after);
  assert.equal(def.counts.changed, 3);
  assert.equal(def.status, "actionable");
  const adapter = createHashTermsAdapter(() => "injected-constant");
  const wiped = compareLockfileTexts(before, after, { hashPinTerms: adapter.hashPinTerms });
  assert.equal(wiped.counts.changed, 0);
  assert.equal(wiped.status, "informational");
  assert.equal(wiped.counts.unchanged, 102);
});

test("this consumer refuses to inject a constant hasher", () => {
  assert.equal(
    hasherErasesByteDifference(() => "same"),
    true,
  );
  assert.throws(
    () => assertInjectableHasher(() => "same"),
    (err) => err instanceof TrialRefuse && err.code === "constant-hasher-erases-byte-equality",
  );
  const honest = (triple) => `${triple.name}|${triple.version}|${triple.integrity}`;
  assert.equal(hasherErasesByteDifference(honest), false);
  assert.equal(assertInjectableHasher(honest), honest);
});

test("pin terms hash is not forced equal to a disclosure-document hash", async () => {
  const { defaultHashPinTerms } = await loadEngine();
  const pin = defaultHashPinTerms({
    name: "qs",
    version: "6.16.0",
    integrity: "sha512-from-lock",
  });
  const disclosure = disclosureHash({ package: "qs", version: "6.16.0" });
  assert.notEqual(pin, disclosure);
  assert.match(pin, /^[0-9a-f]{64}$/);
  assert.match(disclosure, /^[0-9a-f]{64}$/);
});
