import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  compareLockfileTexts,
  createHashTermsAdapter,
  defaultHashPinTerms,
  parseLockfileText,
  ROOT,
  runLockfileDelta,
} from "../lib/index.mjs";
import { CliRefuse } from "../lib/errors.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (...p) => path.join(ROOT, "fixtures", ...p);
const bin = path.join(ROOT, "bin/lockfile-delta.mjs");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-pin-delta-"));
}

function runCli(args, { expectStatus = 0 } = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: tmpDir(),
    timeout: 30_000,
  });
  const stdout = (r.stdout || "").trim();
  let json = null;
  if (stdout) {
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
  }
  assert.equal(r.status, expectStatus, `${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return { ...r, json };
}

test("journey CLI: one version/integrity bump; brief lists it; unchanged omitted", () => {
  const outDir = tmpDir();
  const result = runCli([
    "--before",
    fx("journey/before.json"),
    "--after",
    fx("journey/after.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.status, "actionable");
  assert.equal(result.json.purchaseAuthority, false);
  assert.equal(result.json.settlement, "nonsettling-prototype");
  const art = JSON.parse(fs.readFileSync(path.join(outDir, "pin-delta.json"), "utf8"));
  const md = fs.readFileSync(path.join(outDir, "pin-delta.md"), "utf8");
  assert.equal(art.counts.changed, 1);
  assert.equal(art.counts.unchanged, 1);
  assert.equal(art.changed[0].name, "fixture-alpha");
  assert.equal(art.changed[0].before.version, "1.0.0");
  assert.equal(art.changed[0].after.version, "1.0.1");
  assert.deepEqual(art.changed[0].changeKinds.sort(), ["integrity", "version"]);
  assert.match(md, /fixture-alpha/);
  assert.equal(md.includes("fixture-beta"), false);
  assert.equal(JSON.stringify(art.changed).includes("fixture-beta"), false);
  assert.equal(JSON.stringify(art.added).includes("fixture-beta"), false);
  assert.equal(JSON.stringify(art.removed).includes("fixture-beta"), false);
  assert.match(md, /Unchanged packages omitted \(1\)/);
});

test("seeded failure: HTML input refuses", () => {
  const result = runCli(
    ["--before", fx("html/not-a-lock.html"), "--after", fx("journey/after.json"), "--out-dir", tmpDir()],
    { expectStatus: 2 },
  );
  assert.equal(result.json.ok, false);
  assert.equal(result.json.refused, true);
  assert.equal(result.json.code, "html-input");
});

test("seeded failure: lockfile without integrity is labelled partial", () => {
  const outDir = tmpDir();
  const result = runCli([
    "--before",
    fx("missing-integrity/before.json"),
    "--after",
    fx("missing-integrity/after.json"),
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.status, "partial");
  const art = JSON.parse(fs.readFileSync(path.join(outDir, "pin-delta.json"), "utf8"));
  assert.equal(art.status, "partial");
  assert.ok(art.counts.missingIntegrity > 0);
  assert.equal(art.changed[0].name, "fixture-alpha");
  assert.match(fs.readFileSync(path.join(outDir, "pin-delta.md"), "utf8"), /partial/);
});

test("seeded failure: SAMPLE as customer delta refuses", () => {
  const result = runCli(
    [
      "--before",
      fx("sample-as-customer/before.json"),
      "--after",
      fx("sample-as-customer/after.json"),
      "--out-dir",
      tmpDir(),
    ],
    { expectStatus: 2 },
  );
  assert.equal(result.json.ok, false);
  assert.equal(result.json.code, "sample-as-customer-delta");
  const asCustomerExample = runCli(["--example", "--as-customer", "--out-dir", tmpDir()], { expectStatus: 2 });
  assert.equal(asCustomerExample.json.code, "sample-as-customer-delta");
});

test("package.json-only input refuses", () => {
  const result = runCli(
    [
      "--before",
      fx("package-json-only/package.json"),
      "--after",
      fx("journey/after.json"),
      "--out-dir",
      tmpDir(),
    ],
    { expectStatus: 2 },
  );
  assert.equal(result.json.code, "package-json-only");
});

test("lockfileVersion 1 refuses", () => {
  const result = runCli(
    [
      "--before",
      fx("unsupported-version/lock.json"),
      "--after",
      fx("journey/after.json"),
      "--out-dir",
      tmpDir(),
    ],
    { expectStatus: 2 },
  );
  assert.equal(result.json.code, "unsupported-lockfile-version");
});

test("integrity change without version change is a change", () => {
  const art = runLockfileDelta({
    before: fx("integrity-only/before.json"),
    after: fx("integrity-only/after.json"),
    "out-dir": tmpDir(),
  });
  assert.equal(art.counts.changed, 1);
  assert.equal(art.changed[0].before.version, art.changed[0].after.version);
  assert.deepEqual(art.changed[0].changeKinds, ["integrity"]);
  assert.notEqual(art.changed[0].before.termsHash, art.changed[0].after.termsHash);
});

test("lockfileVersion 2 packages map is preferred over dependencies", () => {
  const art = runLockfileDelta({
    before: fx("v2/before.json"),
    after: fx("v2/after.json"),
    "out-dir": tmpDir(),
  });
  assert.equal(art.lockfileVersion.before, 2);
  assert.equal(art.mapSource.before, "packages");
  assert.equal(art.changed[0].name, "v2-a");
  assert.equal(art.counts.unchanged, 1);
});

test("lockfileVersion 2 dependencies-only map walks nested pins", () => {
  const before = parseLockfileText(fs.readFileSync(fx("v2-deps-only/before.json"), "utf8"));
  assert.equal(before.mapSource, "dependencies");
  assert.ok(before.pins.some((p) => p.name === "nested"));
  const art = runLockfileDelta({
    before: fx("v2-deps-only/before.json"),
    after: fx("v2-deps-only/after.json"),
    "out-dir": tmpDir(),
  });
  assert.equal(art.changed[0].name, "v2-a");
  const blob = JSON.stringify({ added: art.added, removed: art.removed, changed: art.changed });
  assert.equal(blob.includes("v2-b"), false);
});

test("added and removed pins are listed; unchanged scoped pin omitted", () => {
  const art = runLockfileDelta({
    before: fx("added-removed/before.json"),
    after: fx("added-removed/after.json"),
    "out-dir": tmpDir(),
  });
  assert.equal(art.added[0].name, "fixture-gamma");
  assert.equal(art.removed[0].name, "fixture-beta");
  assert.equal(art.counts.unchanged, 2);
  const md = fs.readFileSync(path.join(art.outDir, "pin-delta.md"), "utf8");
  assert.equal(md.includes("@scope/pkg"), false);
});

test("missing required inputs refuse", () => {
  const result = runCli([], { expectStatus: 2 });
  assert.equal(result.json.code, "missing-required-inputs");
});

test("missing input file refuses", () => {
  const result = runCli(
    ["--before", fx("journey/no-such-before.json"), "--after", fx("journey/after.json"), "--out-dir", tmpDir()],
    { expectStatus: 2 },
  );
  assert.equal(result.json.code, "missing-input-file");
});

test("--example writes labeled fixture outputs, not a customer delta", () => {
  const outDir = tmpDir();
  const result = runCli(["--example", "--out-dir", outDir]);
  assert.equal(result.json.ok, true);
  const art = JSON.parse(fs.readFileSync(path.join(outDir, "pin-delta.json"), "utf8"));
  assert.equal(art.caller.exampleMode, true);
  assert.equal(art.caller.sampleLabel, "explicit-example");
  assert.equal(art.caller.notCustomerDemand, true);
  assert.equal(art.provenance, "fixture");
});

test("injected hashPinTerms adapter is used", () => {
  const adapter = createHashTermsAdapter(() => "injected-terms");
  const art = compareLockfileTexts(
    fs.readFileSync(fx("integrity-only/before.json"), "utf8"),
    fs.readFileSync(fx("integrity-only/after.json"), "utf8"),
    { hashPinTerms: adapter.hashPinTerms },
  );
  assert.equal(art.counts.changed, 0);
  assert.equal(art.counts.unchanged, 1);
  const beforePin = parseLockfileText(fs.readFileSync(fx("integrity-only/before.json"), "utf8"), {
    hashPinTerms: () => "one",
  });
  const afterPin = parseLockfileText(fs.readFileSync(fx("integrity-only/after.json"), "utf8"), {
    hashPinTerms: () => "two",
  });
  assert.equal(beforePin.pins[0].termsHash, "one");
  assert.equal(afterPin.pins[0].termsHash, "two");
});

test("default terms hash changes when integrity changes at same version", () => {
  const a = defaultHashPinTerms({ name: "fixture-alpha", version: "1.0.0", integrity: "sha512-aaa" });
  const b = defaultHashPinTerms({ name: "fixture-alpha", version: "1.0.0", integrity: "sha512-bbb" });
  const c = defaultHashPinTerms({ name: "fixture-alpha", version: "1.0.0", integrity: "sha512-aaa" });
  assert.notEqual(a, b);
  assert.equal(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("source does not spawn npm or call the registry", () => {
  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory() && ent.name !== "fixtures" && ent.name !== "test") walk(p);
      else if (ent.isFile() && ent.name.endsWith(".mjs")) files.push(p);
    }
  };
  walk(path.join(ROOT, "lib"));
  walk(path.join(ROOT, "bin"));
  const blob = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  assert.equal(/spawn(?:Sync)?\([^)]*npm/.test(blob), false);
  assert.equal(/https:\/\/registry\.npmjs\.org/.test(blob), false);
  assert.equal(/child_process/.test(blob), false);
});

test("help exits 0", () => {
  const r = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /lockfile-delta/);
});

test("runLockfileDelta throws CliRefuse for HTML", () => {
  assert.throws(
    () =>
      runLockfileDelta({
        before: fx("html/not-a-lock.html"),
        after: fx("journey/after.json"),
        "out-dir": tmpDir(),
      }),
    (err) => err instanceof CliRefuse && err.code === "html-input",
  );
});
