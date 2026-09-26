import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolvePrerequisites } from "../src/resolve-prerequisites.mjs";
import { bindEvidence } from "../src/bind-evidence.mjs";
import { composePartial, freshnessSupports } from "../src/compose-partial.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const TAP_PASS = "ok 1 - works\n# tests 1\n# pass 1\n# fail 0\n";

test("empty prerequisites/gaps do not claim ready", () => {
  const r = resolvePrerequisites({ manifest: {} });
  assert.equal(r.readiness, "not_ready");
  assert.ok(r.gaps.length > 0);
});

test("agent-task-kit name alone is not ready via accepted-contract", () => {
  const r = resolvePrerequisites({ manifest: { name: "agent-task-kit" } });
  assert.notEqual(r.readiness, "ready");
  assert.ok(r.prerequisites.some((p) => p.id === "atk-execute-false" && p.evidenceClass === "accepted-contract"));
  assert.ok(r.gaps.some((g) => g.field === "observations"));
});

test("unknown runtime and truthy nonboolean probes do not manufacture readiness", () => {
  const r = resolvePrerequisites({
    manifest: {
      manifest_version: 3,
      entrypoint: "agent/run.js",
      runtime: { language: "cobol" },
    },
    probe: { entrypointExists: "yes", nodeVersionSatisfies: 1 },
  });
  assert.notEqual(r.readiness, "ready");
  assert.ok(r.prerequisites.some((p) => p.id === "grexal-language" && p.state === "unknown"));
  assert.ok(r.gaps.some((g) => g.field === "probe.entrypointExists"));
});

test("string bin, no-bin library, module/cjs, optional engines, relative entry, missing file", () => {
  const stringBin = resolvePrerequisites({
    manifest: { name: "cli", bin: "cli.js", type: "module", engines: { node: ">=18" } },
    probe: { binExists: ["cli"], nodeVersionSatisfies: true },
  });
  assert.equal(stringBin.readiness, "ready");
  assert.ok(stringBin.prerequisites.some((p) => p.id === "bin:string" && p.state === "satisfied"));

  const noBin = resolvePrerequisites({
    manifest: { name: "lib-only", type: "commonjs", main: "index.js" },
  });
  assert.notEqual(noBin.readiness, "ready");
  assert.ok(noBin.gaps.some((g) => /no bin/i.test(g.reason)));

  const missing = resolvePrerequisites({
    manifest: {
      manifest_version: 3,
      entrypoint: "./missing.js",
      runtime: { language: "typescript" },
    },
    probe: { entrypointExists: false },
  });
  assert.equal(missing.readiness, "not_ready");
  assert.ok(missing.prerequisites.some((p) => p.id === "grexal-entrypoint" && p.state === "missing"));

  const optionalEng = resolvePrerequisites({
    manifest: { name: "opt", main: "x.js", engines: { optionalPeer: "1" } },
  });
  assert.ok(optionalEng.gaps.some((g) => g.field === "engines.node"));
});

test("bindEvidence is content_bound only; executionVerified always false", () => {
  const source = "export const x = 1;\n";
  const digest = sha(source);

  const good = bindEvidence({
    declaration: { capabilityId: "R2-CAPABILITIES-03", revision: "r1", sourceSha256: digest },
    source: { path: "a.mjs", content: source, revision: "r1", sha256: digest },
    testOutput: { path: "t.tap", content: TAP_PASS, exitCode: 0 },
    executionVerified: true,
  });
  assert.equal(good.status, "content_bound");
  assert.equal(good.executionVerified, false);
  assert.equal(good.claimed.sourceSha256, digest);
  assert.equal(good.observed.sourceSha256, digest);
  assert.equal(good.verified.sourceDigestMatchesContent, true);
  assert.equal(good.claimed.parsedTestFacts?.pass, 1);
  assert.equal(good.claimed.parsedTestFacts?.source, "imported_content");

  const mismatch = bindEvidence({
    declaration: { capabilityId: "R2-CAPABILITIES-03", revision: "r1" },
    source: { path: "a.mjs", content: source, revision: "r1", sha256: "0".repeat(64) },
    testOutput: { path: "t.tap", content: TAP_PASS, exitCode: 0 },
  });
  assert.equal(mismatch.status, "untested_declaration");

  const revConflict = bindEvidence({
    declaration: { capabilityId: "R2-CAPABILITIES-03", revision: "r1" },
    source: { path: "a.mjs", content: source, revision: "r2", sha256: digest },
    testOutput: { path: "t.tap", content: TAP_PASS, exitCode: 0 },
  });
  assert.equal(revConflict.status, "untested_declaration");
  assert.equal(revConflict.verified.revisionAligned, false);

  const fakePass = bindEvidence({
    declaration: { capabilityId: "R2-CAPABILITIES-03", revision: "r1" },
    source: { path: "a.mjs", content: source },
    testOutput: { path: "t.txt", content: "all good pass", exitCode: 0 },
  });
  assert.equal(fakePass.status, "untested_declaration");
});

test("composePartial requires explicit complete; holes for absent/unknown/running/completed; trim schema/scope", () => {
  const failed = composePartial({
    job: { schema: "s1", scope: "alpha", requiredFields: ["x"] },
    parts: [{ id: "a", status: "failed", schema: "s1", scope: "alpha", payload: { x: 1 } }],
  });
  assert.notEqual(failed.status, "complete");
  assert.ok(failed.rejectedParts.some((r) => r.id === "a"));

  for (const bad of [undefined, "unknown", "running", "ok", "completed", "typo", "partial"]) {
    const r = composePartial({
      job: { schema: "s1", scope: "alpha", requiredFields: ["x"] },
      parts: [
        {
          id: "a",
          ...(bad === undefined ? {} : { status: bad }),
          schema: "s1",
          scope: "alpha",
          payload: { x: 1 },
        },
      ],
    });
    assert.notEqual(r.status, "complete", `status=${bad}`);
    assert.equal(r.acceptedParts.length, 0, `status=${bad}`);
  }

  const ok = composePartial({
    job: { schema: "s1", scope: "alpha", requiredFields: ["x"] },
    parts: [{ id: "a", status: "complete", schema: "s1", scope: "alpha", payload: { x: 1 } }],
  });
  assert.equal(ok.status, "complete");

  const nullField = composePartial({
    job: { schema: "s1", scope: "alpha", requiredFields: ["x"] },
    parts: [{ id: "a", status: "complete", schema: "s1", scope: "alpha", payload: { x: null } }],
  });
  assert.equal(nullField.status, "partial");
  assert.ok(nullField.gaps.some((g) => g.kind === "missing-field" && g.field === "x"));

  const proto = Object.create(null);
  Object.defineProperty(proto, "__proto__", {
    value: { polluted: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  proto.real = 1;
  const protoCase = composePartial({
    job: { schema: "s1", scope: "alpha", requiredFields: ["real", "polluted"] },
    parts: [{ id: "a", status: "complete", schema: "s1", scope: "alpha", payload: proto }],
  });
  assert.ok(protoCase.gaps.some((g) => g.kind === "missing-field" && g.field === "polluted"));
  assert.equal(Object.getPrototypeOf(protoCase.payload), null);

  const freshBad = composePartial({
    job: {
      schema: "s1",
      scope: "alpha",
      requiredFields: ["x"],
      freshnessRequired: { maxAgeSeconds: -1 },
    },
    parts: [
      {
        id: "a",
        status: "complete",
        schema: "s1",
        scope: "alpha",
        freshness: { ageSeconds: 1 },
        payload: { x: 1 },
      },
    ],
  });
  assert.notEqual(freshBad.status, "complete");

  const ws = composePartial({
    job: { schema: "  ", scope: "\t", requiredFields: ["x"] },
    parts: [{ id: "a", status: "complete", schema: "s1", scope: "alpha", payload: { x: 1 } }],
  });
  assert.ok(ws.gaps.some((g) => g.kind === "job-schema-missing"));
  assert.ok(ws.gaps.some((g) => g.kind === "job-scope-missing"));

  assert.equal(freshnessSupports({ ageSeconds: 1 }, { maxAgeSeconds: Number.NaN }).ok, false);
});
