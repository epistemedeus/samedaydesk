import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { ROOT } from "../lib/index.mjs";
import { install, npm, pack, writeJson } from "./helpers/npm-oracle.mjs";

let root;
let spec;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-npm-oracle-"));
  spec = pack(root);
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

function cli(before, after, label) {
  const out = path.join(root, `report-${label}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "bin/lockfile-delta.mjs"),
    "--before", path.join(before.dir, "package-lock.json"),
    "--after", path.join(after.dir, "package-lock.json"), "--out-dir", out], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 128 * 1024,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { report: JSON.parse(fs.readFileSync(path.join(out, "pin-delta.json"), "utf8")),
    markdown: fs.readFileSync(path.join(out, "pin-delta.md"), "utf8") };
}

for (const version of [2, 3]) {
  for (const [kind, field] of [["devDependencies", "dev"], ["peerDependencies", "peer"], ["optionalDependencies", "optional"]]) {
    test(`npm-generated v${version}: ${field} delta matches actual omitted install`, () => {
      const opts = { omit: ["dev", "peer", "optional"] };
      const before = install(root, version, `prod-${field}`, { dependencies: { "oracle-pin": spec } }, opts);
      const after = install(root, version, field, { [kind]: { "oracle-pin": spec } }, opts);
      assert.equal(fs.existsSync(path.join(before.dir, "node_modules/oracle-pin/package.json")), true);
      assert.equal(fs.existsSync(path.join(after.dir, "node_modules/oracle-pin/package.json")), false);
      const { report, markdown } = cli(before, after, `${version}-${field}`);
      assert.equal(report.status, "actionable");
      assert.equal(report.counts.changed, 1);
      const change = report.changed[0];
      assert.deepEqual(change.changeKinds, [field]);
      for (const term of ["version", "resolved", "integrity"]) assert.equal(change.before[term], change.after[term]);
      assert.equal(change.before[field], false);
      assert.equal(change.after[field], true);
      assert.match(markdown, new RegExp(`${field}: false -> true`));
    });
  }

  test(`npm-generated v${version}: unchanged workspace stub exposes changed real target pin`, () => {
    const trees = [];
    for (const targetVersion of ["1.0.0", "2.0.0"]) {
      const dir = path.join(root, `workspace-${version}-${targetVersion}`);
      writeJson(path.join(dir, "package.json"), { name: "workspace-oracle", version: "1.0.0", workspaces: ["packages/*"] });
      writeJson(path.join(dir, "packages/local-pin/package.json"), { name: "local-pin", version: targetVersion });
      npm(dir, ["install", `--lockfile-version=${version}`]);
      const installed = path.join(dir, "node_modules/local-pin");
      assert.equal(fs.realpathSync(installed), path.join(dir, "packages/local-pin"));
      assert.equal(JSON.parse(fs.readFileSync(path.join(installed, "package.json"))).version, targetVersion);
      trees.push({ dir });
    }
    const { report } = cli(...trees, `workspace-${version}`);
    assert.equal(report.counts.changed, 1);
    assert.equal(report.changed[0].id, "packages/local-pin");
    assert.deepEqual(report.changed[0].changeKinds, ["version"]);
    assert.equal(report.changed[0].before.version, "1.0.0");
    assert.equal(report.changed[0].after.version, "2.0.0");
    assert.equal(report.status, "partial", "local content has no archive integrity; no install verification claim");
  });

  test(`npm-generated v${version}: optional OS metadata agrees with actual platform selection`, () => {
    const platformSpec = pack(root, `oracle-linux-${version}`, { os: ["linux"] });
    const name = `oracle-linux-${version}`;
    const manifest = { optionalDependencies: { [name]: platformSpec } };
    const linux = install(root, version, "linux", manifest, { platform: "linux" });
    const darwin = install(root, version, "darwin", manifest, { platform: "darwin" });
    assert.equal(fs.existsSync(path.join(linux.dir, `node_modules/${name}/package.json`)), true);
    assert.equal(fs.existsSync(path.join(darwin.dir, `node_modules/${name}/package.json`)), false);
    assert.deepEqual(JSON.parse(linux.text).packages[`node_modules/${name}`].os, ["linux"]);
    const { report } = cli(linux, darwin, `platform-${version}`);
    assert.equal(report.counts.changed, 0, "same lock across platforms is not a lockfile edit");
    assert.equal(report.counts.unchanged, 1);
  });
}
