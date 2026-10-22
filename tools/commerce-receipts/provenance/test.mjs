import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  S122_UNRESOLVED,
  SDS_PIN,
  SDS_PIN_ABBREV,
  SDS_PIN_README_BLOB,
  SDS_PIN_TREE,
  UNBOUND_CODE,
  WRONG_FULL_SHA,
  bindClaimedHash,
  catFileType,
  defaultGitDirs,
  evaluateFile,
  invalidFixtureDir,
  listJsonFiles,
  loadCatalog,
  loadInvalidManifest,
  loadJson,
  runSuite,
  validFixtureDir,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const catalog = loadCatalog();

function gitCatFile(gitDir, hash) {
  return spawnSync("git", ["--git-dir", gitDir, "cat-file", "-t", hash], {
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

test("catalog closed sets and pins", () => {
  assert.equal(catalog.schemaVersion, "samedaydesk.commerce-receipts.provenance.v1");
  assert.deepEqual(catalog.kinds, ["contribution"]);
  assert.deepEqual(catalog.sourceRepositories, ["epistemedeus/samedaydesk"]);
  assert.deepEqual(catalog.surfaces, ["git_commit", "git_tree", "git_blob", "git_tag"]);
  assert.deepEqual(catalog.objectTypes, ["commit", "tree", "blob", "tag"]);
  assert.ok(catalog.requiredProhibitedInferences.includes(UNBOUND_CODE));
  assert.ok(catalog.requiredProhibitedInferences.includes("json_substitutes_for_cat_file"));
  assert.ok(catalog.requiredProhibitedInferences.includes("money_movement"));
  assert.equal(catalog.pins.sdsCheckout, SDS_PIN);
  assert.equal(catalog.pins.s122Unresolved, S122_UNRESOLVED);
  assert.equal(catalog.pins.wrongFullSha, WRONG_FULL_SHA);
});

test("git cat-file -t on SDS pin is commit", () => {
  const dirs = defaultGitDirs();
  assert.ok(dirs.length > 0);
  const raw = gitCatFile(dirs[0], SDS_PIN);
  assert.equal(raw.status, 0, raw.stderr);
  assert.equal(raw.stdout.trim(), "commit");
  const abbrev = gitCatFile(dirs[0], SDS_PIN_ABBREV);
  assert.equal(abbrev.status, 0, abbrev.stderr);
  assert.equal(abbrev.stdout.trim(), "commit");
});

test("git cat-file -t on unresolved c0255ac exits nonzero", () => {
  const dirs = defaultGitDirs();
  for (const gitDir of dirs) {
    const raw = gitCatFile(gitDir, S122_UNRESOLVED);
    assert.notEqual(raw.status, 0, gitDir);
  }
  const full = gitCatFile(dirs[0], WRONG_FULL_SHA);
  assert.notEqual(full.status, 0);
});

test("bindClaimedHash SDS pin is commit", () => {
  const result = bindClaimedHash(SDS_PIN);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.objectType, "commit");
  assert.equal(result.gitCatFileExit, 0);
  assert.equal(result.code, null);
});

test("bindClaimedHash SDS pin abbrev is commit", () => {
  const result = bindClaimedHash(SDS_PIN_ABBREV);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.objectType, "commit");
});

test("bindClaimedHash tree and blob objects bind", () => {
  const tree = bindClaimedHash(SDS_PIN_TREE);
  assert.equal(tree.ok, true, JSON.stringify(tree));
  assert.equal(tree.objectType, "tree");
  const blob = bindClaimedHash(SDS_PIN_README_BLOB);
  assert.equal(blob.ok, true, JSON.stringify(blob));
  assert.equal(blob.objectType, "blob");
});

test("bindClaimedHash c0255ac is claimed_hash_unbound_object", () => {
  const result = bindClaimedHash(S122_UNRESOLVED);
  assert.equal(result.ok, false);
  assert.equal(result.code, UNBOUND_CODE);
  assert.equal(result.objectType, null);
  assert.notEqual(result.gitCatFileExit, 0);
  assert.ok(result.errors.some((item) => item.code === UNBOUND_CODE));
});

test("bindClaimedHash deadbeef full SHA is claimed_hash_unbound_object", () => {
  const result = bindClaimedHash(WRONG_FULL_SHA);
  assert.equal(result.ok, false);
  assert.equal(result.code, UNBOUND_CODE);
  assert.equal(result.objectType, null);
});

test("every valid fixture is accepted and covers commit/tree/blob", () => {
  const files = listJsonFiles(validFixtureDir());
  const types = new Set();
  for (const filePath of files) {
    const result = evaluateFile(filePath);
    assert.equal(result.ok, true, `${filePath}: ${JSON.stringify(result.errors)}`);
    types.add(result.objectType);
  }
  assert.deepEqual([...types].sort(), ["blob", "commit", "tree"]);
});

test("every invalid fixture is rejected with the declared code", () => {
  const manifest = loadInvalidManifest();
  const files = listJsonFiles(invalidFixtureDir());
  assert.deepEqual(
    files.map((filePath) => filePath.split("/").pop()).sort(),
    Object.keys(manifest).sort(),
  );
  for (const [name, spec] of Object.entries(manifest)) {
    const result = evaluateFile(join(invalidFixtureDir(), name));
    assert.equal(result.ok, false, name);
    assert.ok(
      result.errors.some((item) => item.code === spec.code),
      `${name} missing ${spec.code}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test("suite accepts valid fixtures and rejects invalid fixtures", () => {
  const report = runSuite();
  assert.equal(report.ok, true, JSON.stringify(report.results.filter((item) => !item.ok), null, 2));
  assert.equal(report.failed, 0);
});

test("wrong-sha fixture is unbound even if JSON names a type", () => {
  const result = evaluateFile(join(invalidFixtureDir(), "wrong-sha.json"));
  assert.equal(result.ok, false);
  assert.equal(result.code, UNBOUND_CODE);
  assert.equal(result.objectType, null);
  assert.notEqual(result.gitCatFileExit, 0);
});

test("json objectType does not bind an unbound hash", () => {
  const result = evaluateFile(join(invalidFixtureDir(), "json-object-type.json"));
  assert.equal(result.ok, false);
  const codes = result.errors.map((item) => item.code);
  assert.ok(codes.includes("json_substitutes_for_cat_file"), JSON.stringify(result.errors));
  assert.ok(codes.includes(UNBOUND_CODE), JSON.stringify(result.errors));
  assert.equal(result.objectType, null);
});

test("CLI --hash SDS pin exits 0 with objectType commit", () => {
  const proc = runCli(["--hash", SDS_PIN]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.objectType, "commit");
  assert.equal(body.gitCatFileExit, 0);
  assert.equal(body.code, null);
});

test("CLI --hash c0255ac exits nonzero claimed_hash_unbound_object", () => {
  const expect = runCli(["--expect-reject", UNBOUND_CODE, "--hash", S122_UNRESOLVED]);
  assert.equal(expect.status, 0, expect.stderr + expect.stdout);
  const expectBody = JSON.parse(expect.stdout);
  assert.equal(expectBody.ok, true);
  assert.equal(expectBody.expectReject, UNBOUND_CODE);
  assert.equal(expectBody.code, UNBOUND_CODE);
  assert.equal(expectBody.objectType, null);
  assert.notEqual(expectBody.gitCatFileExit, 0);

  const raw = runCli(["--hash", S122_UNRESOLVED]);
  assert.notEqual(raw.status, 0);
  const rawBody = JSON.parse(raw.stdout);
  assert.equal(rawBody.ok, false);
  assert.equal(rawBody.code, UNBOUND_CODE);
  assert.equal(rawBody.objectType, null);
});

test("CLI --claim valid pin exits 0", () => {
  const proc = runCli(["--claim", join(validFixtureDir(), "sds-pin-commit.json")]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.objectType, "commit");
  assert.equal(body.claimedHash, SDS_PIN);
});

test("CLI --claim wrong-sha exits nonzero", () => {
  const proc = runCli(["--claim", join(invalidFixtureDir(), "wrong-sha.json")]);
  assert.notEqual(proc.status, 0);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.code, UNBOUND_CODE);
});

test("CLI --suite exits 0", () => {
  const proc = runCli(["--suite"]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.failed, 0);
});

test("CLI rejects money-movement even on a bound SDS SHA", () => {
  const proc = runCli([
    "--expect-reject",
    "money_movement",
    "--claim",
    join(invalidFixtureDir(), "money-movement.json"),
  ]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
});

test("runtime source does not call GitHub or mutate remotes", () => {
  const joined = ["lib.mjs", "cli.mjs"]
    .map((name) => readFileSync(join(here, name), "utf8"))
    .join("\n");
  assert.doesNotMatch(joined, /api\.github\.com/);
  assert.doesNotMatch(joined, /gh\s+api/);
  assert.doesNotMatch(joined, /git\s+push/);
  assert.doesNotMatch(joined, /git\s+fetch/);
  const names = readdirSync(here);
  assert.ok(!names.includes("radar.mjs"));
  for (const filePath of listJsonFiles(validFixtureDir())) {
    const claim = loadJson(filePath);
    assert.equal(claim.kind, "contribution");
    assert.equal(claim.sourceRepository, "epistemedeus/samedaydesk");
    assert.ok(!Object.hasOwn(claim, "objectType"), filePath);
    assert.ok(!Object.hasOwn(claim, "paid"), filePath);
  }
});

test("catFileType does not invent unresolved S122 object", () => {
  const result = catFileType(S122_UNRESOLVED);
  assert.equal(result.ok, false);
  assert.equal(result.code, UNBOUND_CODE);
});
