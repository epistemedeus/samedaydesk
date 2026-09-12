import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { compareLockfileTexts, gitCommitFromResolved, JSON_LIMITS, parseLockfileText, ROOT } from "../lib/index.mjs";

const bin = path.join(ROOT, "bin/lockfile-delta.mjs");
const empty = '{"lockfileVersion":3,"packages":{}}';
const lock = (entry, version = 3) => JSON.stringify({ lockfileVersion: version, packages: { "node_modules/x": entry } });

test("Git annotations require a Git source and preserve SHA-256 object IDs", () => {
  const oid = "a".repeat(64);
  for (const prefix of ["git://example.test/pkg", "git+ssh://git@example.test/pkg.git", "github:org/pkg"]) {
    assert.equal(gitCommitFromResolved(`${prefix}#${oid}`), oid);
  }
  for (const prefix of ["https://example.test/archive.git", "https://example.test/a.tgz?github:"]) {
    assert.equal(gitCommitFromResolved(`${prefix}#${oid}`), null);
  }
  for (const size of [6, 41, 63, 65]) assert.equal(gitCommitFromResolved(`git://example.test/pkg#${"a".repeat(size)}`), null);
});

function cliPair(t, before, after = empty) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-adversarial-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "before.json"), before);
  fs.writeFileSync(path.join(dir, "after.json"), after);
  const out = path.join(dir, "output");
  const r = spawnSync(process.execPath, [bin, "--before", path.join(dir, "before.json"),
    "--after", path.join(dir, "after.json"), "--out-dir", out], {
    encoding: "utf8", timeout: 5000, maxBuffer: 128 * 1024,
  });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  return { ...r, brief: JSON.parse(r.stdout), out };
}

function refused(r, code, resource) {
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.brief.code, code);
  if (resource) assert.equal(r.brief.detail.resource, resource);
  assert.equal(fs.existsSync(r.out), false, "refusal creates no output artifacts");
}

test("CLI rejects invalid UTF-8 instead of merging distinct literal source bytes", (t) => {
  const prefix = Buffer.from('{"lockfileVersion":3,"packages":{"node_modules/x":{"version":"1.0.0","resolved":"https://example.test/');
  const suffix = Buffer.from('","integrity":"sha512-x"}}}');
  const before = Buffer.concat([prefix, Buffer.from([0x80]), suffix]);
  const after = Buffer.concat([prefix, Buffer.from([0x81]), suffix]);
  refused(cliPair(t, before, after), "parse-error");
});

test("CLI counts array elements globally, including empty containers", (t) => {
  const half = Math.floor(JSON_LIMITS.maxArrayElements / 2);
  const text = `{"lockfileVersion":3,"packages":{},"a":[${Array(half).fill("[]").join(",")}],"b":[${Array(half + 1).fill("0").join(",")}]}`;
  refused(cliPair(t, text), "resource-limit", "json-array-elements");
});

test("array bound accepts exactly the configured number of primitive elements", () => {
  const text = `{"lockfileVersion":3,"packages":{},"metadata":[${Array(JSON_LIMITS.maxArrayElements).fill("0").join(",")}]}`;
  assert.equal(parseLockfileText(text).pins.length, 0);
});

test("CLI bounds individual platform terms before hashing or report amplification", (t) => {
  refused(cliPair(t, lock({ version: "1.0.0", os: ["x".repeat(16_385)] })), "resource-limit");
});

test("CLI bounds expanded legacy dependency paths", (t) => {
  const name = "x".repeat(1500);
  const deps = { [name]: { version: "1.0.0", dependencies: { [name]: { version: "1.0.0",
    dependencies: { [name]: { version: "1.0.0" } } } } } };
  refused(cliPair(t, JSON.stringify({ lockfileVersion: 2, dependencies: deps })), "resource-limit", "pin-id-chars");
});

test("CLI bounds aggregate legacy path expansion below the raw input byte cap", (t) => {
  const prefix = "x".repeat(3500);
  const children = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`p${i}`, { version: "1" }]));
  const text = JSON.stringify({ lockfileVersion: 2, dependencies: { [prefix]: { version: "1", dependencies: children } } });
  assert.ok(Buffer.byteLength(text) < 256 * 1024);
  refused(cliPair(t, text), "resource-limit", "total-pin-id-chars");
});

for (const value of [null, [], "1.0.0", false]) {
  test(`CLI refuses malformed package entry ${JSON.stringify(value)} instead of dropping it`, (t) => {
    refused(cliPair(t, lock(value)), "invalid-lockfile-entry");
  });
}

test("malformed preferred packages map cannot fall back to legacy dependencies", (t) => {
  refused(cliPair(t, '{"lockfileVersion":2,"packages":[],"dependencies":{}}'), "invalid-lockfile-entry");
});

test("nested legacy dependency map must be an object", (t) => {
  refused(cliPair(t, '{"lockfileVersion":2,"dependencies":{"x":{"version":"1","dependencies":[]}}}'), "invalid-lockfile-entry");
});

test("duplicate decoded package names and prototype names refuse without last-write-wins", (t) => {
  for (const [a, b] of [["node_modules/x", "node_modules\\/x"], ["__proto__", "\\u005f_proto__"], ["𝄞", "\\ud834\\udd1e"]]) {
    refused(cliPair(t, `{"lockfileVersion":3,"packages":{"${a}":{},"${b}":{}}}`), "duplicate-json-key");
  }
});

test("literal URLs keep case, escapes, ports, query ordering and Unicode differences", (t) => {
  const pairs = [
    ["https://EXAMPLE.test/a", "https://example.test/a"],
    ["https://example.test:443/a", "https://example.test/a"],
    ["https://example.test/%2f", "https://example.test/%2F"],
    ["https://example.test/a?x=1&y=2", "https://example.test/a?y=2&x=1"],
    ["https://example.test/caf\u00e9", "https://example.test/cafe\u0301"],
    ["https://example.test/a#one", "https://example.test/a#two"],
    ["https://example.test/a\tb", "https://example.test/ab"],
    [`git+https://example.test/a.git#${"a".repeat(64)}`, `git+https://example.test/a.git#${"b".repeat(64)}`],
  ];
  for (const [before, after] of pairs) {
    const r = cliPair(t, lock({ version: "1", integrity: "sha512-x", resolved: before }),
      lock({ version: "1", integrity: "sha512-x", resolved: after }));
    assert.equal(r.status, 0, r.stdout);
    const report = JSON.parse(fs.readFileSync(path.join(r.out, "pin-delta.json"), "utf8"));
    assert.deepEqual(report.changed[0].changeKinds, ["resolved"]);
    assert.equal(report.changed[0].before.resolved, before);
    assert.equal(report.changed[0].after.resolved, after);
  }
});

test("legacy v2 dev and peer flags use the same validated pin construction", () => {
  for (const field of ["dev", "peer"]) {
    const before = { lockfileVersion: 2, dependencies: { x: { version: "1", integrity: "sha512-x" } } };
    const after = structuredClone(before);
    after.dependencies.x[field] = true;
    assert.deepEqual(compareLockfileTexts(JSON.stringify(before), JSON.stringify(after)).changed[0].changeKinds, [field]);
    after.dependencies.x[field] = "true";
    assert.throws(() => parseLockfileText(JSON.stringify(after)), (err) => err.code === "invalid-lockfile-field");
  }
});

test("CLI refuses a FIFO promptly before trying to read it", { skip: process.platform === "win32" }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-fifo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fifo = path.join(dir, "fifo");
  assert.equal(spawnSync("mkfifo", [fifo], { timeout: 1000 }).status, 0);
  const r = spawnSync(process.execPath, [bin, "--before", fifo, "--after", fifo], { encoding: "utf8", timeout: 2000 });
  assert.equal(r.error, undefined, "non-regular input must not hang until killed");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).code, "invalid-input-file");
});

for (const alias of ["same-path", "symlink", "hardlink"]) {
  test(`CLI protects source bytes when report output aliases the input by ${alias}`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-output-alias-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const output = path.join(dir, "pin-delta.json");
    const source = alias === "same-path" ? output : path.join(dir, "source.json");
    fs.writeFileSync(source, empty);
    if (alias === "symlink") fs.symlinkSync(source, output);
    if (alias === "hardlink") fs.linkSync(source, output);
    const r = spawnSync(process.execPath, [bin, "--before", source, "--after", source, "--out-dir", dir], {
      encoding: "utf8", timeout: 3000,
    });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).code, "out-dir-collides-with-input");
    assert.equal(fs.readFileSync(source, "utf8"), empty);
    assert.equal(fs.existsSync(path.join(dir, "pin-delta.md")), false);
  });
}
