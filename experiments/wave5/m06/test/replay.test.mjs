import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadCorpus, loadPin, M06_ROOT } from "../lib/paths.mjs";
import { resolveEngine } from "../lib/engine.mjs";
import { runEngineCase, specifiedVsPin } from "../lib/replay.mjs";
import { runReplay } from "../bin/replay.mjs";

const BIN = join(M06_ROOT, "bin", "replay.mjs");
const HERE = dirname(fileURLToPath(import.meta.url));

test("pinned Co10 CLI exists after resolve and is the PIN sha", () => {
  const pin = loadPin();
  const engine = resolveEngine();
  assert.equal(existsSync(engine.bin), true);
  assert.equal(engine.pinSha, pin.engine.sha);
  if (engine.source !== "env") {
    assert.equal(engine.sha, pin.engine.sha);
  }
});

test("Co10 public CLI replay matches recorded pin observations", () => {
  const engine = resolveEngine();
  const corpus = loadCorpus();
  const gaps = [];
  for (const entry of corpus.cases) {
    const actual = runEngineCase(engine.bin, entry);
    assert.equal(actual.transportFailure, false, `${entry.id} transport ${actual.stderr || actual.stdout}`);
    assert.equal(actual.parseable, true, `${entry.id} unparseable stdout`);
    assert.equal(actual.customerBrief, false);
    assert.equal(actual.purchaseAuthority, false);
    assert.equal(actual.sold, false);
    assert.equal(actual.ok, entry.pin.ok, entry.id);
    assert.equal(actual.refused, entry.pin.refused, entry.id);
    assert.equal(actual.exitCode, entry.pin.exitCode, `${entry.id} exit`);
    assert.equal(actual.breaking, entry.pin.breaking, `${entry.id} breaking`);
    assert.equal(actual.usedClass, entry.pin.usedClass, entry.id);
    if (entry.pin.code) assert.equal(actual.code, entry.pin.code, entry.id);
    if (entry.pin.reason) assert.equal(actual.reason, entry.pin.reason, entry.id);
    if (entry.pin.refused) {
      assert.equal(actual.brief, null, `${entry.id} must not write a brief on refuse`);
    }
    const vs = specifiedVsPin(entry, actual);
    if (vs.startsWith("gap")) gaps.push(`${entry.id}:${vs}`);
  }
  assert.ok(gaps.includes("false-schema-true-to-false:gap-missed-incompatible"));
  assert.ok(gaps.includes("numeric-float-minimum-raised:gap-missed-incompatible"));
  assert.ok(gaps.includes("exclusive-minimum-added:gap-missed-incompatible"));
  assert.ok(gaps.includes("ref-sibling-minimum-added:gap-missed-incompatible"));
  assert.ok(gaps.includes("items-true-to-false:gap-missed-incompatible"));
  assert.ok(gaps.includes("required-field-removed:gap-false-breaking"));
  assert.ok(gaps.includes("additional-properties-false-to-true:gap-false-breaking"));
});

test("unlike schema pairs keep unlike termsVersion hashes", () => {
  const engine = resolveEngine();
  const corpus = loadCorpus();
  const a = corpus.cases.find((item) => item.id === "type-change-used");
  const b = corpus.cases.find((item) => item.id === "unused-path-only");
  const c = corpus.cases.find((item) => item.id === "false-schema-true-to-false");
  const d = corpus.cases.find((item) => item.id === "false-schema-false-to-true");
  const ra = runEngineCase(engine.bin, a);
  const rb = runEngineCase(engine.bin, b);
  const rc = runEngineCase(engine.bin, c);
  const rd = runEngineCase(engine.bin, d);
  assert.match(ra.termsVersion, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(ra.termsVersion, rb.termsVersion);
  assert.notEqual(rc.termsVersion, rd.termsVersion);
  const ra2 = runEngineCase(engine.bin, a);
  assert.equal(ra.termsVersion, ra2.termsVersion);
});

test("public replay CLI writes replay-report.json against the pinned engine", () => {
  const outDir = mkdtempSync(join(tmpdir(), "w5-m06-cli-"));
  const spawned = spawnSync(process.execPath, [BIN, "--out-dir", outDir], {
    encoding: "utf8",
    timeout: 60_000,
    cwd: join(HERE, "..", "..", "..", ".."),
  });
  assert.equal(spawned.status, 0, spawned.stderr || spawned.stdout);
  const summary = JSON.parse(String(spawned.stdout).trim().split(/\n/).at(-1));
  assert.equal(summary.ok, true);
  assert.equal(summary.purchaseAuthority, false);
  assert.equal(summary.sold, false);
  assert.equal(summary.engineSha, loadPin().engine.sha);
  const report = JSON.parse(readFileSync(join(outDir, "replay-report.json"), "utf8"));
  assert.equal(report.schema, "samedaydesk.wave5.m06.schema-compatibility-corpus.v1");
  assert.equal(report.counts.cases, loadCorpus().cases.length);
  assert.equal(report.counts.pinMatch, report.counts.cases);
  assert.equal(report.counts.transportFailures, 0);
  assert.equal(report.counts.witnessesOk, report.counts.cases);
  assert.ok(report.counts.gaps >= 6);
  assert.match(report.integrationBinding.remaining, /94c7bfd/);
});

test("missing W5_M02_ENGINE_ROOT is incomplete, never a skipped pass", () => {
  const spawned = spawnSync(process.execPath, [BIN, "--engine-root", "/tmp/w5-m06-no-such-engine"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.notEqual(spawned.status, 0);
  const payload = JSON.parse(String(spawned.stdout).trim().split(/\n/).at(-1));
  assert.equal(payload.ok, false);
  assert.equal(payload.incomplete, true);
  assert.match(String(payload.error), /incomplete|webhook-drift/i);
});

test("runReplay library path records engine source", () => {
  const outDir = mkdtempSync(join(tmpdir(), "w5-m06-lib-"));
  const result = runReplay({ outDir });
  assert.equal(result.ok, true);
  assert.ok(["worktree", "in-repo", "env"].includes(result.engine.source));
});
