import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { loadCatalog } from "../lib/catalog.mjs";
import { invokeEngine } from "../lib/invoke.mjs";
import { engineRoot, invoke, pinFixture, tmpOut } from "./helpers.mjs";

test("lockfile journey writes pin-delta matching catalog schema", () => {
  const outDir = tmpOut("lock-pos");
  const result = invoke("lockfile-pin-delta", {
    before: pinFixture("lockfile-pin-delta", "journey/before.json"),
    after: pinFixture("lockfile-pin-delta", "journey/after.json"),
  }, { outDir });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.status, "actionable");
  assert.equal(result.stdoutJson.counts.changed, 1);
  assert.equal(result.schemaMatch.ok, true);
  const brief = JSON.parse(readFileSync(join(outDir, "pin-delta.json"), "utf8"));
  assert.equal(brief.schema, "samedaydesk.lockfile-pin-delta.v1");
  assert.equal(brief.changed[0].name, "fixture-alpha");
  assert.equal(brief.changed[0].before.version, "1.0.0");
  assert.equal(brief.changed[0].after.version, "1.0.1");
  assert.equal(existsSync(join(outDir, "pin-delta.md")), true);
});

test("identical lockfiles are informational no-change, not a transport failure", () => {
  const before = pinFixture("lockfile-pin-delta", "journey/before.json");
  const result = invoke("lockfile-pin-delta", { before, after: before });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.status, "informational");
  assert.equal(result.stdoutJson.counts.changed, 0);
  assert.equal(result.stdoutJson.ok, true);
});

test("HTML lockfile is a valid refusal, not wrapper success", () => {
  const result = invoke("lockfile-pin-delta", {
    before: pinFixture("lockfile-pin-delta", "html/not-a-lock.html"),
    after: pinFixture("lockfile-pin-delta", "journey/after.json"),
  });
  assert.equal(result.outcome.kind, "refused");
  assert.equal(result.ok, false);
  assert.equal(result.refuseJson.code, "html-input");
  assert.equal(result.refuseJson.refused, true);
  assert.equal(result.spawn.status, 2);
});

test("integrity-only pin change is actionable via pin fields", () => {
  const outDir = tmpOut("lock-int");
  const result = invoke("lockfile-pin-delta", {
    before: pinFixture("lockfile-pin-delta", "integrity-only/before.json"),
    after: pinFixture("lockfile-pin-delta", "integrity-only/after.json"),
  }, { outDir });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.status, "actionable");
  assert.equal(result.engineSource, "in-tree");
  const brief = JSON.parse(readFileSync(join(outDir, "pin-delta.json"), "utf8"));
  assert.equal(brief.equality, "pin-fields");
  assert.deepEqual(brief.changed[0].changeKinds, ["integrity"]);
  assert.notEqual(brief.changed[0].before.termsHash, brief.changed[0].after.termsHash);
});

test("resolved-only git pin change is actionable", () => {
  const result = invoke("lockfile-pin-delta", {
    before: pinFixture("lockfile-pin-delta", "git-resolved/before.json"),
    after: pinFixture("lockfile-pin-delta", "git-resolved/after.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.status, "actionable");
  assert.ok(result.stdoutJson.counts.changed >= 1);
});

test("constant hasher cannot hide an integrity-only pin change", async () => {
  const { root } = engineRoot("lockfile-pin-delta");
  const { compareLockfileTexts, createHashTermsAdapter } = await import(
    pathToFileURL(join(root, "lib/index.mjs")).href
  );
  const before = readFileSync(pinFixture("lockfile-pin-delta", "integrity-only/before.json"), "utf8");
  const after = readFileSync(pinFixture("lockfile-pin-delta", "integrity-only/after.json"), "utf8");
  const constant = createHashTermsAdapter(() => "constant-injected-hash");
  const constantReport = compareLockfileTexts(before, after, { hashPinTerms: constant.hashPinTerms });
  assert.equal(constantReport.counts.changed, 1);
  assert.deepEqual(constantReport.changed[0].changeKinds, ["integrity"]);
});

test("catalog matcher fails when a promised output name is absent", () => {
  const outDir = tmpOut("lock-mismatch");
  const catalog = structuredClone(loadCatalog());
  const engine = catalog.engines.find((row) => row.id === "lockfile-pin-delta");
  engine.outputs[0].name = "not-written.json";
  const result = invokeEngine({
    engineId: "lockfile-pin-delta",
    catalog,
    outDir,
    inputs: {
      before: pinFixture("lockfile-pin-delta", "journey/before.json"),
      after: pinFixture("lockfile-pin-delta", "journey/after.json"),
    },
  });
  assert.equal(result.outcome.kind, "incomplete-delivery");
  assert.equal(result.schemaMatch.ok, false);
  assert.equal(result.schemaMatch.mismatches.some((row) => row.name === "not-written.json"), true);
});
