import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {linkSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync} from "node:fs";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const publisher = path.join(repoRoot, "server/scripts/publish-preserved-client.mjs");
const receipt = path.join(repoRoot, "publication/PRESERVED-PUBLICATION.json");
const dist = path.join(repoRoot, "client/dist");
const EXPECTED_COMMAND =
  "node server/scripts/publish-preserved-client.mjs && npm run foundry:runtime -- --deployable && npm run foundry:managed-probe";
const EXPECTED_PROOF = {
  ok: true,
  viteInvoked: false,
  files: 353,
  bytes: 59965585,
  inventorySha256: "46a41b4afd082862b6d014dbca07c279962827eb4da8d7f7dea3328fde99dfe6",
};

function runPublisher(cwd) {
  return spawnSync(process.execPath, [publisher], {cwd, encoding: "utf8"});
}

function hardlinkTree(source, destination) {
  mkdirSync(destination, {recursive: true});
  for (const name of readdirSync(source)) {
    const from = path.join(source, name);
    const to = path.join(destination, name);
    const stat = statSync(from);
    if (stat.isDirectory()) {
      hardlinkTree(from, to);
    } else if (stat.isFile()) {
      linkSync(from, to);
    } else {
      throw new Error(`unexpected_member:${from}`);
    }
  }
}

function makeSandbox() {
  const roots = [tmpdir(), repoRoot];
  let lastError;
  for (const root of roots) {
    const sandbox = mkdtempSync(path.join(root, "sds-preserved-publish-"));
    try {
      mkdirSync(path.join(sandbox, "publication"), {recursive: true});
      linkSync(receipt, path.join(sandbox, "publication/PRESERVED-PUBLICATION.json"));
      hardlinkTree(dist, path.join(sandbox, "client/dist"));
      return sandbox;
    } catch (error) {
      lastError = error;
      rmSync(sandbox, {recursive: true, force: true});
    }
  }
  throw lastError;
}

test("package.json build:managed-foundry is the preserved publisher, not Vite", () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const command = pkg.scripts["build:managed-foundry"];
  assert.equal(command, EXPECTED_COMMAND);
  assert.equal(command.includes("client run build"), false);
  assert.equal(command.includes("vite"), false);
});

test("normal consumed dist is accepted without Vite", () => {
  const result = runPublisher(repoRoot);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout.trim());
  assert.deepEqual(proof, EXPECTED_PROOF);
  assert.equal(result.stderr, "");
});

test("wrong membership is refused", () => {
  const sandbox = makeSandbox();
  try {
    writeFileSync(path.join(sandbox, "client/dist/wrong-membership-extra.txt"), "extra\n");
    const result = runPublisher(sandbox);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /extra_member_refused/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(sandbox, {recursive: true, force: true});
  }
});
