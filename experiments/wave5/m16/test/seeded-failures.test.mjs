import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { FX, runCli, tmpOut } from "./helpers.mjs";
import { materializePinnedEngine } from "../lib/engine-bind.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";

test("HTML input is a valid refusal, not a transport crash", () => {
  const outDir = tmpOut();
  const result = runCli(
    ["run", "--before", FX("html/not-a-lock.html"), "--after", FX("resolved-only/after.json"), "--out-dir", outDir],
    { expectStatus: 2 },
  );
  assert.equal(result.json.ok, true);
  assert.equal(result.json.refused, true);
  assert.equal(result.json.transport.ok, true);
  assert.equal(result.json.analysis.outcome, "refused");
  assert.equal(result.json.analysis.validRefusal, true);
  assert.equal(result.json.analysis.code, "html-input");
});

test("SAMPLE engine fixture presented as a customer pair refuses", () => {
  const engine = materializePinnedEngine({ repoRoot: REPO_ROOT });
  const before = join(engine.root, "fixtures/sample-as-customer/before.json");
  const after = join(engine.root, "fixtures/sample-as-customer/after.json");
  const result = runCli(["run", "--before", before, "--after", after, "--out-dir", tmpOut()], { expectStatus: 2 });
  assert.equal(result.json.analysis.validRefusal, true);
  assert.equal(result.json.analysis.code, "sample-as-customer-delta");
  assert.equal(result.json.transport.ok, true);
});

test("--example is refused as a real-project trial", () => {
  const result = runCli(["run", "--example", "--out-dir", tmpOut()], { expectStatus: 2 });
  assert.equal(result.json.analysis.code, "example-is-not-real-project-trial");
  assert.equal(result.json.analysis.validRefusal, true);
});

test("missing before file is a valid refusal", () => {
  const result = runCli(
    ["run", "--before", FX("html/no-such-before.json"), "--after", FX("resolved-only/after.json"), "--out-dir", tmpOut()],
    { expectStatus: 2 },
  );
  assert.equal(result.json.analysis.code, "missing-input-file");
});

test("partial --before without --after refuses missing inputs", () => {
  const result = runCli(["run", "--before", FX("resolved-only/before.json"), "--out-dir", tmpOut()], {
    expectStatus: 2,
  });
  assert.equal(result.json.analysis.code, "missing-required-inputs");
});

test("crash engine is transport failure, not a valid analysis outcome", () => {
  const result = runCli(
    [
      "run",
      "--before",
      FX("resolved-only/before.json"),
      "--after",
      FX("resolved-only/after.json"),
      "--engine-root",
      FX("crash-engine"),
      "--out-dir",
      tmpOut(),
    ],
    { expectStatus: 1 },
  );
  assert.equal(result.json.ok, false);
  assert.equal(result.json.transport.ok, false);
  assert.equal(result.json.analysis.outcome, "not-run");
  assert.equal(result.json.analysis.validRefusal, false);
  assert.ok(["engine-non-json", "engine-nonzero"].includes(result.json.transport.outcome));
});

test("missing engine-root is transport incomplete, not a skipped pass", () => {
  const missing = join(tmpOut(), "no-engine");
  mkdirSync(missing, { recursive: true });
  const result = runCli(
    [
      "run",
      "--before",
      FX("resolved-only/before.json"),
      "--after",
      FX("resolved-only/after.json"),
      "--engine-root",
      missing,
      "--out-dir",
      tmpOut(),
    ],
    { expectStatus: 1 },
  );
  assert.equal(result.json.transport.ok, false);
  assert.equal(result.json.code, "engine-cli-missing");
  assert.equal(result.json.analysis.outcome, "not-run");
});

test("resolved-only git URL is actionable via overlay; engine omits it at this pin", () => {
  const outDir = tmpOut();
  const result = runCli([
    "run",
    "--before",
    FX("resolved-only/before.json"),
    "--after",
    FX("resolved-only/after.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.engine.counts.changed, 0);
  assert.equal(result.json.analysis.engineOmittedResolved, true);
  assert.equal(result.json.analysis.outcome, "actionable");
  assert.equal(result.json.omittedResolved.length, 1);
  assert.equal(result.json.omittedResolved[0].name, "fixture-pin");
  assert.equal(
    result.json.omittedResolved[0].before.resolved,
    "https://registry.npmjs.org/fixture-pin/-/fixture-pin-1.2.3.tgz",
  );
  assert.equal(
    result.json.omittedResolved[0].after.resolved,
    "git+https://github.com/example/fixture-pin.git#0123456789abcdef0123456789abcdef01234567",
  );
  assert.equal(result.json.omittedResolved[0].engineListed, false);
});
