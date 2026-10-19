import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareLockfileTexts,
  decodeLockedNpmAlias,
  parseLockfileText,
  ROOT,
  runLockfileDelta,
} from "../lib/index.mjs";

// Owner regressions for the identity classes in x402-url-extractor issues 125 and 126.
// ROOT678 qualified those reports against frozen source fba9d148. The minimized
// contributor lockfiles stay in that qualification packet. The objects below are
// ours. Frozen pre-repair observations are recorded separately and are not the
// current expected result.

const FROZEN_PRE_REPAIR = Object.freeze({
  source: "fba9d14872bc4c04214e527b9edfb30c2123c9e7",
  scopedNameExported: "widget",
  aliasNameExported: "renamed",
  aliasVersionExported: "npm:is-number@7.0.0",
});

const integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
const integrity2 = `sha512-${Buffer.alloc(64, 2).toString("base64")}`;
const resolved = "https://registry.example.invalid/pkg.tgz";
const resolved2 = "https://registry.example.invalid/pkg-2.tgz";

function packages(entries, lockfileVersion = 3) {
  return {
    name: "identity-owner",
    version: "1.0.0",
    lockfileVersion,
    packages: { "": {}, ...entries },
  };
}

function deps(entries) {
  return {
    name: "identity-owner",
    version: "1.0.0",
    lockfileVersion: 2,
    dependencies: entries,
  };
}

function registryPin(extra = {}) {
  return { version: "1.0.0", resolved, integrity, ...extra };
}

function text(doc) {
  return JSON.stringify(doc);
}

function compare(before, after, options) {
  return compareLockfileTexts(text(before), text(after), options);
}

function pinsOf(doc) {
  return parseLockfileText(text(doc)).pins;
}

test("locked npm alias decoder accepts exact targets and refuses unlocked specifiers", () => {
  assert.deepEqual(decodeLockedNpmAlias("npm:is-number@7.0.0"), { name: "is-number", version: "7.0.0" });
  assert.deepEqual(decodeLockedNpmAlias("npm:@team/number@7.0.0"), { name: "@team/number", version: "7.0.0" });
  assert.deepEqual(decodeLockedNpmAlias("npm:@team-node_modules/widget@1.0.0-rc.1"), {
    name: "@team-node_modules/widget",
    version: "1.0.0-rc.1",
  });
  assert.deepEqual(decodeLockedNpmAlias("npm:left-pad@1.0.0+build.1"), { name: "left-pad", version: "1.0.0+build.1" });
  for (const spec of [
    "npm:is-number@^7.0.0",
    "npm:is-number@~7.0.0",
    "npm:is-number@>=7.0.0",
    "npm:is-number@7.0.0 || 8.0.0",
    "npm:is-number",
    "npm:is-number@",
    "npm:@team/number",
    "npm:@team/number@latest",
    "npm:npm:is-number@7.0.0",
    "npm:file:../is-number.tgz",
    "npm:git+https://example.invalid/is-number.git",
    "npm:https://example.invalid/is-number.tgz",
    "npm:node_modules@1.0.0",
    "npm:favicon.ico@1.0.0",
    "npm:.hidden@1.0.0",
    "npm:_hidden@1.0.0",
    "npm:@scope/.hidden@1.0.0",
    "NPM:is-number@1.0.0",
    "is-number@7.0.0",
    "",
    "npm:" + "a".repeat(513),
  ]) {
    assert.equal(decodeLockedNpmAlias(spec), null, spec);
  }
});

test("packages-map names use whole node_modules segments", () => {
  const cases = [
    ["node_modules/pkg", "pkg"],
    ["node_modules/parent/node_modules/pkg", "pkg"],
    ["node_modules/@team/pkg", "@team/pkg"],
    ["node_modules/has-node_modules", "has-node_modules"],
    ["node_modules/@team-node_modules/widget", "@team-node_modules/widget"],
    ["node_modules/@node_modules/widget", "@node_modules/widget"],
    [
      "node_modules/parent/node_modules/@team-node_modules/widget",
      "@team-node_modules/widget",
    ],
  ];
  for (const [id, name] of cases) {
    const parsed = pinsOf(packages({ [id]: registryPin() }));
    assert.equal(parsed.length, 1, id);
    assert.equal(parsed[0].id, id);
    assert.equal(parsed[0].name, name);
    assert.notEqual(parsed[0].name, FROZEN_PRE_REPAIR.scopedNameExported);
  }
});

test("explicit entry.name wins over the path and over a locked alias", () => {
  const id = "node_modules/@team-node_modules/widget";
  const explicit = pinsOf(packages({ [id]: registryPin({ name: "@explicit/widget" }) }));
  assert.equal(explicit[0].name, "@explicit/widget");
  assert.equal(explicit[0].id, id);
  const blank = pinsOf(packages({ [id]: registryPin({ name: "  " }) }));
  assert.equal(blank[0].name, "@team-node_modules/widget");
  const aliasNamed = pinsOf(packages({
    "node_modules/renamed": registryPin({ name: "@explicit/alias", version: "npm:is-number@7.0.0" }),
  }));
  assert.equal(aliasNamed[0].name, "@explicit/alias");
  assert.equal(aliasNamed[0].version, "7.0.0");
  assert.equal(aliasNamed[0].id, "node_modules/renamed");
});

test("alias identity matches across packages and dependencies maps", () => {
  const modern = packages({
    "node_modules/renamed": registryPin({ name: "is-number", version: "7.0.0" }),
  }, 2);
  const legacy = deps({
    renamed: { version: "npm:is-number@7.0.0", resolved, integrity },
  });
  const scopedModern = packages({
    "node_modules/renamed": registryPin({ name: "@team/number", version: "7.0.0" }),
  }, 2);
  const scopedLegacy = deps({
    renamed: { version: "npm:@team/number@7.0.0", resolved, integrity },
  });
  for (const [label, before, after] of [
    ["packages self", modern, modern],
    ["dependencies self", legacy, legacy],
    ["forward", modern, legacy],
    ["reverse", legacy, modern],
    ["scoped forward", scopedModern, scopedLegacy],
    ["scoped reverse", scopedLegacy, scopedModern],
  ]) {
    const art = compare(before, after);
    assert.equal(art.status, "informational", label);
    assert.equal(art.counts.changed, 0, label);
    assert.equal(art.counts.unchanged, 1, label);
    assert.equal(art.counts.added, 0, label);
    assert.equal(art.counts.removed, 0, label);
  }
  const legacyPins = pinsOf(legacy);
  assert.equal(legacyPins[0].id, "node_modules/renamed");
  assert.equal(legacyPins[0].name, "is-number");
  assert.equal(legacyPins[0].version, "7.0.0");
  assert.notEqual(legacyPins[0].name, FROZEN_PRE_REPAIR.aliasNameExported);
  assert.notEqual(legacyPins[0].version, FROZEN_PRE_REPAIR.aliasVersionExported);
});

test("nested and scoped install aliases keep the install id and the target name", () => {
  const nested = deps({
    parent: {
      version: "1.0.0",
      resolved,
      integrity,
      dependencies: {
        renamed: { version: "npm:@team/number@2.1.0", resolved: resolved2, integrity: integrity2 },
      },
    },
  });
  const pins = pinsOf(nested);
  const child = pins.find((pin) => pin.id === "node_modules/parent/node_modules/renamed");
  assert.ok(child);
  assert.equal(child.name, "@team/number");
  assert.equal(child.version, "2.1.0");
  assert.equal(pins.find((pin) => pin.id === "node_modules/parent").name, "parent");
  const scopedInstall = deps({
    "@alias/renamed": { version: "npm:@team/pkg@1.2.3", resolved, integrity },
  });
  const installed = pinsOf(scopedInstall)[0];
  assert.equal(installed.id, "node_modules/@alias/renamed");
  assert.equal(installed.name, "@team/pkg");
  assert.equal(installed.version, "1.2.3");
});

test("real alias target, version, integrity, and resolved changes stay visible on both maps", () => {
  const modern = packages({
    "node_modules/renamed": registryPin({ name: "is-number", version: "7.0.0" }),
  }, 2);
  const legacy = deps({ renamed: { version: "npm:is-number@7.0.0", resolved, integrity } });
  const modernVersion = packages({
    "node_modules/renamed": registryPin({ name: "is-number", version: "7.0.1", integrity: integrity2 }),
  }, 2);
  const legacyVersion = deps({
    renamed: { version: "npm:is-number@7.0.1", resolved, integrity: integrity2 },
  });
  for (const [before, after] of [[modern, modernVersion], [legacy, legacyVersion]]) {
    const art = compare(before, after);
    assert.equal(art.counts.changed, 1);
    assert.equal(art.changed[0].name, "is-number");
    assert.equal(art.changed[0].before.name, "is-number");
    assert.equal(art.changed[0].after.name, "is-number");
    assert.deepEqual(art.changed[0].changeKinds.sort(), ["integrity", "version"]);
  }
  const target = compare(legacy, deps({
    renamed: { version: "npm:other-number@7.0.0", resolved, integrity },
  }));
  assert.deepEqual(target.changed[0].changeKinds, ["name"]);
  assert.equal(target.changed[0].before.name, "is-number");
  assert.equal(target.changed[0].after.name, "other-number");
  const onlyIntegrity = compare(legacy, deps({
    renamed: { version: "npm:is-number@7.0.0", resolved, integrity: integrity2 },
  }));
  assert.deepEqual(onlyIntegrity.changed[0].changeKinds, ["integrity"]);
  const onlyResolved = compare(legacy, deps({
    renamed: { version: "npm:is-number@7.0.0", resolved: resolved2, integrity },
  }));
  assert.deepEqual(onlyResolved.changed[0].changeKinds, ["resolved"]);
});

test("malformed and unlocked aliases are not given a guessed identity", () => {
  const range = deps({ renamed: { version: "npm:is-number@^7.0.0", resolved, integrity } });
  const bare = deps({ renamed: { version: "npm:is-number", resolved, integrity } });
  const nestedAlias = deps({ renamed: { version: "npm:npm:is-number@7.0.0", resolved, integrity } });
  for (const doc of [range, bare, nestedAlias]) {
    const art = compare(doc, doc);
    assert.equal(art.status, "informational");
    assert.equal(art.counts.unchanged, 1);
    const pin = pinsOf(doc)[0];
    assert.equal(pin.id, "node_modules/renamed");
    assert.equal(pin.name, "renamed");
    assert.equal(pin.version, doc.dependencies.renamed.version);
  }
  const guessed = compare(
    deps({ renamed: { version: "npm:is-number@7.0.0", resolved, integrity } }),
    range,
  );
  assert.equal(guessed.counts.changed, 1);
  assert.ok(guessed.changed[0].changeKinds.includes("version"));
  assert.equal(guessed.changed[0].before.name, "is-number");
  assert.equal(guessed.changed[0].after.name, "renamed");
});

test("same pin count with a different name is a name change in the pins and the row", () => {
  const before = packages({ "node_modules/pkg": registryPin({ name: "alpha" }) });
  const after = packages({ "node_modules/pkg": registryPin({ name: "beta" }) });
  const art = compare(before, after);
  assert.equal(art.counts.beforePins, art.counts.afterPins);
  assert.equal(art.counts.changed, 1);
  assert.equal(art.counts.unchanged, 0);
  assert.notEqual(art.status, "informational");
  assert.deepEqual(art.changed[0].changeKinds, ["name"]);
  assert.equal(art.changed[0].id, "node_modules/pkg");
  assert.equal(art.changed[0].before.name, "alpha");
  assert.equal(art.changed[0].after.name, "beta");
  assert.equal(pinsOf(before)[0].name, "alpha");
  assert.equal(pinsOf(after)[0].name, "beta");
});

test("scoped name correction is visible in CLI JSON and Markdown", () => {
  const id = "node_modules/@team-node_modules/widget";
  const before = packages({ [id]: registryPin({ version: "1.0.0" }) });
  const after = packages({
    [id]: registryPin({ version: "1.0.1", integrity: integrity2, resolved: resolved2 }),
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-identity-"));
  const beforePath = path.join(dir, "before.json");
  const afterPath = path.join(dir, "after.json");
  const outDir = path.join(dir, "out");
  fs.writeFileSync(beforePath, text(before));
  fs.writeFileSync(afterPath, text(after));
  const art = runLockfileDelta({ before: beforePath, after: afterPath, "out-dir": outDir });
  assert.equal(art.changed[0].name, "@team-node_modules/widget");
  assert.equal(art.changed[0].before.name, "@team-node_modules/widget");
  assert.equal(art.changed[0].after.name, "@team-node_modules/widget");
  assert.deepEqual(art.changed[0].changeKinds.sort(), ["integrity", "resolved", "version"]);
  const md = fs.readFileSync(path.join(outDir, "pin-delta.md"), "utf8");
  assert.match(md, /@team-node_modules\/widget/);
  assert.equal(md.includes("`widget`"), false);
  const fileBytes = fs.readFileSync(path.join(outDir, "pin-delta.json"));
  assert.equal(art.reportSha256, createHash("sha256").update(fileBytes).digest("hex"));
  assert.equal(JSON.parse(fileBytes.toString("utf8")).changed[0].name, "@team-node_modules/widget");
  const cli = spawnSync(process.execPath, [
    "--max-old-space-size=128",
    path.join(ROOT, "bin/lockfile-delta.mjs"),
    "--before",
    beforePath,
    "--after",
    afterPath,
    "--out-dir",
    path.join(dir, "cli-out"),
  ], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const stdout = JSON.parse(cli.stdout);
  assert.equal(stdout.ok, true);
  assert.equal(stdout.counts.changed, 1);
  const cliBytes = fs.readFileSync(path.join(dir, "cli-out", "pin-delta.json"));
  assert.equal(stdout.digest, createHash("sha256").update(cliBytes).digest("hex"));
  assert.equal(JSON.parse(cliBytes.toString("utf8")).changed[0].name, "@team-node_modules/widget");
});

test("legacy alias self-compare stays informational through the library and keeps field equality", () => {
  const legacy = deps({ renamed: { version: "npm:is-number@7.0.0", resolved, integrity } });
  let n = 0;
  const unstable = compare(legacy, legacy, { hashPinTerms: () => String(++n) });
  assert.equal(unstable.counts.changed, 0);
  assert.equal(unstable.counts.unchanged, 1);
  const bumped = deps({
    renamed: { version: "npm:is-number@7.0.0", resolved, integrity: integrity2 },
  });
  const hidden = compare(legacy, bumped, { hashPinTerms: () => "constant" });
  assert.equal(hidden.counts.changed, 1);
  assert.deepEqual(hidden.changed[0].changeKinds, ["integrity"]);
  assert.equal(hidden.changed[0].before.termsHash, "constant");
  assert.equal(hidden.changed[0].after.termsHash, "constant");
  const reordered = compare(
    packages({ "node_modules/pkg": registryPin({ integrity: "sha512-aaa sha384-bbb" }) }),
    packages({ "node_modules/pkg": registryPin({ integrity: "sha384-bbb sha512-aaa" }) }),
  );
  assert.deepEqual(reordered.changed[0].changeKinds, ["integrity"]);
});

test("missing integrity, optional peers, links, and bundled children keep their rules", () => {
  const missing = deps({
    renamed: { version: "npm:is-number@7.0.0", resolved, optional: true, dev: true, peer: true },
  });
  const missingArt = compare(deps({}), missing);
  assert.equal(missingArt.status, "partial");
  assert.equal(missingArt.counts.added, 1);
  assert.equal(missingArt.counts.missingIntegrity, 1);
  assert.equal(missingArt.added[0].name, "is-number");
  assert.equal(missingArt.added[0].version, "7.0.0");
  assert.equal(missingArt.added[0].id, "node_modules/renamed");
  assert.equal(missingArt.added[0].missingIntegrity, true);
  const linked = pinsOf(packages({
    "node_modules/linked": { link: true },
    "node_modules/bundled-child": { ...registryPin(), inBundle: true },
  }));
  assert.equal(linked.some((pin) => pin.id === "node_modules/linked"), false);
  assert.equal(linked.some((pin) => pin.id === "node_modules/bundled-child" && pin.name === "bundled-child"), true);
  const legacyBundled = pinsOf(deps({
    child: { version: "1.2.3", resolved, integrity, bundled: true },
  }));
  assert.equal(legacyBundled[0].name, "child");
  assert.equal(legacyBundled[0].version, "1.2.3");
});
