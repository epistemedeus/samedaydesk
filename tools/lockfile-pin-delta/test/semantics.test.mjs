import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  compareLockfileTexts,
  gitCommitFromResolved,
  JSON_LIMITS,
  parseLockfileText,
  ROOT,
} from "../lib/index.mjs";

const bin = path.join(ROOT, "bin/lockfile-delta.mjs");
const generated = (...parts) => path.join(ROOT, "fixtures/generated", ...parts);

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-semantics-"));
}

function runCli(before, after, { expectedStatus = 0, coldOut = false } = {}) {
  const parent = tempDir();
  const outDir = coldOut ? path.join(parent, "cold-output") : parent;
  if (coldOut) assert.equal(fs.existsSync(outDir), false);
  const result = spawnSync(
    process.execPath,
    [bin, "--before", before, "--after", after, "--out-dir", outDir],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  const brief = JSON.parse(result.stdout.trim());
  const report = expectedStatus === 0
    ? JSON.parse(fs.readFileSync(path.join(outDir, "pin-delta.json"), "utf8"))
    : null;
  return { brief, report, outDir };
}

function writePair(beforeText, afterText) {
  const dir = tempDir();
  const before = path.join(dir, "before.json");
  const after = path.join(dir, "after.json");
  fs.writeFileSync(before, beforeText);
  fs.writeFileSync(after, afterText);
  return { before, after };
}

test("actual npm 10 workspace relocation reports the link target resolution", () => {
  const { report, outDir } = runCli(
    generated("npm-workspace-before/package-lock.json"),
    generated("npm-workspace-after/package-lock.json"),
    { coldOut: true },
  );
  assert.equal(fs.existsSync(outDir), true, "CLI creates a cold output directory");
  const link = report.changed.find((item) => item.id === "node_modules/local-pkg");
  assert.ok(link);
  assert.deepEqual(link.changeKinds, ["resolved"]);
  assert.equal(link.before.link, true);
  assert.equal(link.before.resolved, "packages/local-pkg");
  assert.equal(link.after.resolved, "packages/relocated");
  assert.equal(link.before.missingIntegrity, false);
  assert.deepEqual(report.removed.map((pin) => pin.id), ["packages/local-pkg"]);
  assert.deepEqual(report.added.map((pin) => pin.id), ["packages/relocated"]);
});

test("actual npm 10 dependency-to-optional transition is actionable", () => {
  const { report } = runCli(
    generated("npm-optional-before/package-lock.json"),
    generated("npm-optional-after/package-lock.json"),
  );
  assert.equal(report.status, "actionable");
  assert.equal(report.counts.changed, 1);
  assert.deepEqual(report.changed[0].changeKinds, ["optional"]);
  assert.equal(report.changed[0].before.integrity, report.changed[0].after.integrity);
  assert.equal(report.changed[0].before.resolved, report.changed[0].after.resolved);
});

test("actual npm 10 npm-protocol alias keeps path identity and exact artifact terms", () => {
  const { report } = runCli(
    generated("npm-alias-before/package-lock.json"),
    generated("npm-alias-after/package-lock.json"),
  );
  assert.equal(report.counts.changed, 1);
  const change = report.changed[0];
  assert.equal(change.id, "node_modules/numberish");
  assert.equal(change.name, "is-number");
  assert.equal(change.before.version, "7.0.0");
  assert.equal(change.after.version, "6.0.0");
  assert.notEqual(change.before.resolved, change.after.resolved);
  assert.notEqual(change.before.integrity, change.after.integrity);
  assert.deepEqual(change.changeKinds, ["version", "integrity", "resolved"]);
});

test("platform and dev-optional boundaries change independently of artifact fields", () => {
  const base = {
    name: "platform-boundary",
    lockfileVersion: 3,
    packages: {
      "": { name: "platform-boundary", version: "1.0.0" },
      "node_modules/native-pkg": {
        version: "1.0.0",
        resolved: "https://registry.example/native-pkg-1.0.0.tgz",
        integrity: "sha512-same",
        optional: true,
        os: ["linux", "darwin"],
        cpu: ["x64"],
        libc: ["glibc"],
      },
    },
  };
  const after = structuredClone(base);
  after.packages["node_modules/native-pkg"].devOptional = true;
  after.packages["node_modules/native-pkg"].os = ["win32", "linux"];
  after.packages["node_modules/native-pkg"].cpu = ["arm64"];
  after.packages["node_modules/native-pkg"].libc = ["musl"];
  const pair = writePair(JSON.stringify(base), JSON.stringify(after));
  const { report } = runCli(pair.before, pair.after);
  assert.deepEqual(report.changed[0].changeKinds, ["devOptional", "os", "cpu", "libc"]);
  assert.equal(report.changed[0].before.integrity, report.changed[0].after.integrity);

  const reordered = structuredClone(base);
  reordered.packages["node_modules/native-pkg"].os = ["darwin", "linux", "darwin"];
  const noChange = compareLockfileTexts(JSON.stringify(base), JSON.stringify(reordered));
  assert.equal(noChange.counts.changed, 0, "platform list order and duplicates are non-semantic");
});

test("duplicate JSON members refuse instead of collapsing to a false no-change", () => {
  const ambiguous = `{
    "name":"duplicate-probe",
    "lockfileVersion":3,
    "packages":{
      "":{},
      "node_modules/x":{"version":"1.0.0","\\u0076ersion":"2.0.0","integrity":"sha512-x"}
    }
  }`;
  const valid = `{"name":"duplicate-probe","lockfileVersion":3,"packages":{"":{},"node_modules/x":{"version":"2.0.0","integrity":"sha512-x"}}}`;
  const pair = writePair(ambiguous, valid);
  const { brief } = runCli(pair.before, pair.after, { expectedStatus: 2 });
  assert.equal(brief.code, "duplicate-json-key");
  assert.equal(brief.detail.key, "version");
  assert.match(brief.detail.path, /node_modules\/x/);
});

test("invalid structured pin terms refuse instead of collapsing to missing values", () => {
  const invalid = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": {},
      "node_modules/x": { version: "1.0.0", resolved: { url: "https://example.test/x.tgz" } },
    },
  });
  const valid = JSON.stringify({
    lockfileVersion: 3,
    packages: { "": {}, "node_modules/x": { version: "1.0.0" } },
  });
  const pair = writePair(invalid, valid);
  const { brief } = runCli(pair.before, pair.after, { expectedStatus: 2 });
  assert.equal(brief.code, "invalid-lockfile-field");
  assert.equal(brief.detail.field, "resolved");
});

test("actual pnpm 12, Yarn 1, and Yarn 4 locks are explicit unsupported formats", () => {
  const cases = [
    [generated("pnpm12/pnpm-lock.yaml"), "pnpm-lock.yaml"],
    [generated("yarn1/yarn.lock"), "yarn.lock-v1"],
    [generated("yarn4/yarn.lock"), "yarn.lock-berry"],
  ];
  for (const [file, format] of cases) {
    const { brief } = runCli(file, file, { expectedStatus: 2 });
    assert.equal(brief.code, "unsupported-lockfile-format");
    assert.equal(brief.detail.format, format);
    assert.equal(brief.digest, undefined);
  }
});

test("supported empty npm lock is informational no-change, not unsupported", () => {
  const text = JSON.stringify({
    name: "no-dependencies",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: { "": { name: "no-dependencies", version: "1.0.0" } },
  });
  const pair = writePair(text, text);
  const { report } = runCli(pair.before, pair.after);
  assert.equal(report.status, "informational");
  assert.deepEqual(report.counts, {
    beforePins: 0,
    afterPins: 0,
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    missingIntegrity: 0,
  });
});

test("oversized input refuses before parse or output creation", () => {
  const dir = tempDir();
  const oversized = path.join(dir, "oversized.json");
  const after = path.join(dir, "after.json");
  fs.writeFileSync(oversized, "");
  fs.truncateSync(oversized, JSON_LIMITS.maxInputBytes + 1);
  fs.writeFileSync(after, '{"lockfileVersion":3,"packages":{}}');
  const outDir = path.join(dir, "must-not-exist");
  const result = spawnSync(
    process.execPath,
    [bin, "--before", oversized, "--after", after, "--out-dir", outDir],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, 2, result.stderr);
  const brief = JSON.parse(result.stdout.trim());
  assert.equal(brief.code, "resource-limit");
  assert.equal(brief.detail.resource, "input-bytes");
  assert.equal(fs.existsSync(outDir), false);
});

test("excessive JSON nesting refuses at the structural bound", () => {
  const nested = `${'{"x":'.repeat(JSON_LIMITS.maxDepth + 1)}0${"}".repeat(JSON_LIMITS.maxDepth + 1)}`;
  const text = `{"lockfileVersion":3,"packages":{},"metadata":${nested}}`;
  assert.throws(
    () => parseLockfileText(text, { label: "deep-lock" }),
    (error) => error.code === "resource-limit" && error.detail.resource === "json-depth",
  );
});

test("git SHA-256 resolution exposes the complete 64-hex commit", () => {
  const commit = "a".repeat(64);
  assert.equal(gitCommitFromResolved(`git+https://example.test/pkg.git#${commit}`), commit);
});

function normalizedBoundary(entry, id) {
  const name = entry.name ?? id.slice(id.lastIndexOf("node_modules/") + "node_modules/".length);
  const sorted = (value) => value == null ? null : [...new Set(value)].sort();
  return JSON.stringify([
    name,
    entry.version ?? null,
    entry.integrity ?? null,
    entry.resolved ?? null,
    entry.link === true,
    entry.optional === true,
    entry.devOptional === true,
    sorted(entry.os),
    sorted(entry.cpu),
    sorted(entry.libc),
  ]);
}

function oracleDelta(before, after) {
  const map = (doc) => new Map(
    Object.entries(doc.packages)
      .filter(([id, entry]) => id !== "" && entry && typeof entry === "object" && !Array.isArray(entry))
      .map(([id, entry]) => [id, normalizedBoundary(entry, id)]),
  );
  const left = map(before);
  const right = map(after);
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  return {
    added: ids.filter((id) => !left.has(id)),
    removed: ids.filter((id) => !right.has(id)),
    changed: ids.filter((id) => left.has(id) && right.has(id) && left.get(id) !== right.get(id)),
    unchanged: ids.filter((id) => left.has(id) && right.has(id) && left.get(id) === right.get(id)),
  };
}

test("bounded structural oracle agrees across 120 pin and boundary mutations", () => {
  const base = {
    name: "oracle",
    lockfileVersion: 3,
    packages: {
      "": { name: "oracle", version: "1.0.0" },
      "node_modules/plain": {
        version: "1.0.0",
        resolved: "https://registry.example/plain-1.0.0.tgz",
        integrity: "sha512-plain",
      },
      "node_modules/numberish": {
        name: "is-number",
        version: "7.0.0",
        resolved: "https://registry.example/is-number-7.0.0.tgz",
        integrity: "sha512-number",
      },
      "node_modules/local-pkg": { resolved: "packages/local-pkg", link: true },
      "packages/local-pkg": { name: "local-pkg", version: "1.0.0" },
    },
  };
  const fields = ["version", "integrity", "resolved", "optional", "devOptional", "os", "cpu", "libc"];
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const before = structuredClone(base);
    const after = structuredClone(base);
    const mode = iteration % 11;
    if (mode < fields.length) {
      const field = fields[mode];
      const entry = after.packages[iteration % 2 ? "node_modules/plain" : "node_modules/numberish"];
      if (field === "optional" || field === "devOptional") entry[field] = true;
      else if (field === "os") entry.os = iteration % 3 ? ["linux"] : ["darwin", "linux"];
      else if (field === "cpu") entry.cpu = iteration % 3 ? ["x64"] : ["arm64"];
      else if (field === "libc") entry.libc = iteration % 3 ? ["glibc"] : ["musl"];
      else entry[field] = `${entry[field]}-mutation-${iteration}`;
    } else if (mode === 8) {
      after.packages["node_modules/local-pkg"].resolved = `packages/relocated-${iteration}`;
    } else if (mode === 9) {
      after.packages[`node_modules/added-${iteration}`] = {
        version: "1.0.0",
        resolved: `file:added-${iteration}.tgz`,
        integrity: `sha512-added-${iteration}`,
      };
    } else {
      delete after.packages["node_modules/plain"];
    }

    const expected = oracleDelta(before, after);
    const report = compareLockfileTexts(JSON.stringify(before), JSON.stringify(after));
    assert.deepEqual(report.added.map((pin) => pin.id), expected.added, `added at ${iteration}`);
    assert.deepEqual(report.removed.map((pin) => pin.id), expected.removed, `removed at ${iteration}`);
    assert.deepEqual(report.changed.map((item) => item.id), expected.changed, `changed at ${iteration}`);
    assert.equal(report.counts.unchanged, expected.unchanged.length, `unchanged at ${iteration}`);
  }
});
