import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadCatalog } from "../src/catalog.mjs";
import { compareRun } from "../src/compare.mjs";
import {
  EXPECTED_SHAS,
  FALLBACK_PINS,
  SHA_RE,
  loadEngines,
} from "../src/engines.mjs";
import { ENGINE_SMOKE_DIR } from "../src/paths.mjs";
import { runCaptured } from "../src/runner.mjs";
import { existsSync } from "node:fs";

test("pins are 40-hex and match expected SDS52/W4 SHAs", () => {
  assert.equal(FALLBACK_PINS.length, 5);
  for (const pin of FALLBACK_PINS) {
    assert.match(pin.sha, SHA_RE);
    assert.equal(pin.sha, EXPECTED_SHAS[pin.id]);
    assert.equal(pin.sha.length, 40);
  }
  assert.equal(
    EXPECTED_SHAS["sds52-paid-useful-jobs"],
    "aeef964fa188443078958d9d6d393afae1d542ee",
  );
  assert.equal(
    EXPECTED_SHAS["w4-json-schema-webhook-drift"],
    "94c7bfdfeaa99f5e70f341504df3051cc7717f91",
  );
  assert.equal(
    EXPECTED_SHAS["w4-lockfile-pin-delta"],
    "e81efc8ab71b1bde88eca743d297149e61bbb6f2",
  );
  assert.equal(
    EXPECTED_SHAS["w4-route-table-diff"],
    "7387eb677abd442dfab9081cb0ad95451fd2a762",
  );
  assert.equal(
    EXPECTED_SHAS["w4-page-change-offline-job"],
    "91b57334818ecd7940cb854e9864f3b1749d1d1d",
  );
  const { engines } = loadEngines();
  for (const [id, sha] of Object.entries(EXPECTED_SHAS)) {
    const engine = engines.find((e) => e.id === id);
    assert.ok(engine, `missing engine ${id}`);
    assert.match(engine.sha, SHA_RE);
    assert.equal(engine.sha, sha);
  }
});

test("catalog loader does not throw on empty examples", () => {
  const empty = mkdtempSync(join(tmpdir(), "h04-empty-examples-"));
  const missing = loadCatalog({ examplesDir: join(empty, "no-such-dir") });
  assert.equal(missing.examples.length, 0);
  assert.ok(missing.missingFamilies.includes("schema-webhook"));
  mkdirSync(join(empty, "schema-webhook"));
  mkdirSync(join(empty, "lockfile"));
  mkdirSync(join(empty, "api-routes"));
  mkdirSync(join(empty, "page-facts"));
  const loaded = loadCatalog({ examplesDir: empty });
  assert.equal(loaded.examples.length, 0);
  assert.deepEqual(loaded.errors, []);
});

test("runner records exitCode for trivial node -e, or smoke meta exists", async () => {
  const captured = await runCaptured({
    argv: [process.execPath, "-e", "console.log('ok')"],
    cwd: tmpdir(),
    timeoutMs: 10_000,
  });
  assert.equal(captured.exitCode, 0);
  assert.equal(captured.ok, true);
  assert.match(captured.stdout, /ok/);
  assert.equal(typeof captured.durationMs, "number");
  const smokeMeta = join(ENGINE_SMOKE_DIR, "meta.json");
  if (existsSync(smokeMeta)) {
    assert.ok(true);
  }
});

test("compare unknown stays unknown when expected missing", () => {
  const compared = compareRun({
    expected: null,
    stdout: JSON.stringify({ status: "actionable", ok: true }),
    outDir: undefined,
    exitCode: 0,
  });
  assert.equal(compared.result, "unknown");
  assert.equal(compared.expectedPresent, false);
  assert.equal(compared.reason, "expected-report-missing");

  const dir = mkdtempSync(join(tmpdir(), "h04-compare-"));
  writeFileSync(join(dir, "drift-brief.json"), JSON.stringify({ status: "actionable" }));
  const stillUnknown = compareRun({
    expectedPath: join(dir, "expected-report.json"),
    outDir: dir,
    stdout: "",
    exitCode: 0,
  });
  assert.equal(stillUnknown.result, "unknown");
});
