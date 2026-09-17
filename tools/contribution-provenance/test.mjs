import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  S122_UNRESOLVED,
  SDS_PIN,
  UNBOUND_CODE,
  VERANTIS_PR2_ABBREV,
  VERANTIS_PR2_HEAD,
  bindClaimedHash,
  catFileType,
  defaultGitDirs,
  evaluateClaim,
  evaluateFile,
  invalidFixtureDir,
  listJsonFiles,
  loadCatalog,
  loadInvalidManifest,
  loadJson,
  objectStoreGitDir,
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

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 15000,
    cwd: options.cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(options.env ?? {}) },
  });
}

function withEnv(extra, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(extra)) {
    saved.set(key, Object.hasOwn(process.env, key) ? process.env[key] : undefined);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, previous] of saved) {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
}

function makeIsolatedCommitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "contribution-provenance-inject-"));
  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  delete gitEnv.GIT_DIR;
  delete gitEnv.GIT_WORK_TREE;
  delete gitEnv.GIT_OBJECT_DIRECTORY;
  delete gitEnv.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  gitEnv.GIT_AUTHOR_NAME = "t";
  gitEnv.GIT_AUTHOR_EMAIL = "t@t.example";
  gitEnv.GIT_COMMITTER_NAME = "t";
  gitEnv.GIT_COMMITTER_EMAIL = "t@t.example";
  const init = spawnSync("git", ["init"], { cwd: dir, encoding: "utf8", env: gitEnv });
  assert.equal(init.status, 0, init.stderr);
  writeFileSync(join(dir, "payload.txt"), "injected-object-body\n");
  const add = spawnSync("git", ["add", "payload.txt"], { cwd: dir, encoding: "utf8", env: gitEnv });
  assert.equal(add.status, 0, add.stderr);
  const commit = spawnSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t.example", "commit", "-m", "inject"],
    { cwd: dir, encoding: "utf8", env: gitEnv },
  );
  assert.equal(commit.status, 0, commit.stderr);
  const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8", env: gitEnv });
  assert.equal(rev.status, 0, rev.stderr);
  return { dir, gitDir: join(dir, ".git"), hash: rev.stdout.trim() };
}

function requiredInferences() {
  return [
    "claimed_hash_unbound_object",
    "comment_text_is_not_adoption",
    "solution_shaped_text_is_lead",
  ];
}

test("catalog closed sets are owner|member|commenter|app", () => {
  assert.deepEqual(catalog.actorLabels, ["owner", "member", "commenter", "app"]);
  assert.deepEqual(catalog.adoptionStates, ["lead", "object_bound", "owner_adopted"]);
  assert.ok(catalog.requiredProhibitedInferences.includes(UNBOUND_CODE));
  assert.ok(catalog.requiredProhibitedInferences.includes("comment_text_is_not_adoption"));
  assert.ok(catalog.requiredProhibitedInferences.includes("solution_shaped_text_is_lead"));
});

test("vendored object store git cat-file -t 072f8d0 is commit", () => {
  const store = objectStoreGitDir();
  const raw = gitCatFile(store, VERANTIS_PR2_ABBREV);
  assert.equal(raw.status, 0, raw.stderr);
  assert.equal(raw.stdout.trim(), "commit");
  const full = gitCatFile(store, VERANTIS_PR2_HEAD);
  assert.equal(full.status, 0, full.stderr);
  assert.equal(full.stdout.trim(), "commit");
});

test("git cat-file -t on unresolved c0255ac exits nonzero", () => {
  const store = gitCatFile(objectStoreGitDir(), S122_UNRESOLVED);
  assert.notEqual(store.status, 0);
  const dirs = defaultGitDirs();
  for (const gitDir of dirs) {
    const raw = gitCatFile(gitDir, S122_UNRESOLVED);
    assert.notEqual(raw.status, 0, gitDir);
  }
});

test("bindClaimedHash 072f8d0 is commit", () => {
  const result = bindClaimedHash(VERANTIS_PR2_ABBREV);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.objectType, "commit");
  assert.equal(result.gitCatFileExit, 0);
  assert.equal(result.code, null);
});

test("bindClaimedHash c0255ac is claimed_hash_unbound_object", () => {
  const result = bindClaimedHash(S122_UNRESOLVED);
  assert.equal(result.ok, false);
  assert.equal(result.code, UNBOUND_CODE);
  assert.equal(result.objectType, null);
  assert.notEqual(result.gitCatFileExit, 0);
  assert.ok(result.errors.some((item) => item.code === UNBOUND_CODE));
});

test("SDS pin 775051602d91 is commit in this repository", () => {
  const result = bindClaimedHash(SDS_PIN);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.objectType, "commit");
});

test("every valid fixture is accepted and labels cover the closed set", () => {
  const files = listJsonFiles(validFixtureDir());
  const labels = new Set();
  for (const filePath of files) {
    const result = evaluateFile(filePath);
    assert.equal(result.ok, true, `${filePath}: ${JSON.stringify(result.errors)}`);
    labels.add(result.actorLabel);
  }
  assert.deepEqual([...labels].sort(), [...catalog.actorLabels].sort());
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

test("commenter bound object is not owner adoption", () => {
  const result = evaluateFile(join(validFixtureDir(), "commenter-verantis-pr2.json"));
  assert.equal(result.ok, true);
  assert.equal(result.actorLabel, "commenter");
  assert.equal(result.objectType, "commit");
  assert.equal(result.adoption, "object_bound");
});

test("solution-shaped text without a hash is a lead", () => {
  const result = evaluateFile(join(validFixtureDir(), "commenter-solution-text-lead.json"));
  assert.equal(result.ok, true);
  assert.equal(result.actorLabel, "commenter");
  assert.equal(result.adoption, "lead");
  assert.equal(result.objectType, null);
  assert.equal(result.textIsLeadOnly, true);
  assert.equal(result.claimedHash, null);
});

test("CLI --hash 072f8d0 exits 0 with objectType commit", () => {
  const proc = runCli(["--hash", VERANTIS_PR2_ABBREV]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.objectType, "commit");
  assert.equal(body.gitCatFileExit, 0);
});

test("CLI --hash c0255ac exits nonzero claimed_hash_unbound_object", () => {
  const proc = runCli(["--expect-reject", UNBOUND_CODE, "--hash", S122_UNRESOLVED]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.expectReject, UNBOUND_CODE);
  assert.equal(body.code, UNBOUND_CODE);
  assert.equal(body.objectType, null);
  assert.notEqual(body.gitCatFileExit, 0);

  const raw = runCli(["--hash", S122_UNRESOLVED]);
  assert.notEqual(raw.status, 0);
  const rawBody = JSON.parse(raw.stdout);
  assert.equal(rawBody.ok, false);
  assert.equal(rawBody.code, UNBOUND_CODE);
});

test("CLI --suite exits 0", () => {
  const proc = runCli(["--suite"]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.failed, 0);
});

test("CLI rejects commenter-as-adoption", () => {
  const proc = runCli([
    "--expect-reject",
    "comment_text_is_not_adoption",
    "--claim",
    join(invalidFixtureDir(), "commenter-as-adoption.json"),
  ]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
});

test("bound hash does not waive a claimed signature that does not bind", () => {
  const result = evaluateClaim({
    schemaVersion: catalog.schemaVersion,
    claimId: "bound-hash-unbound-signature-inline",
    actorLabel: "commenter",
    adoption: "object_bound",
    claimedHash: VERANTIS_PR2_HEAD,
    claimedSignature: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGARBAGE",
    surface: "issue_comment",
    text: "bound hash plus garbage signature",
    prohibitedInferences: requiredInferences(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.objectType, "commit");
  assert.ok(result.errors.some((item) => item.code === UNBOUND_CODE && item.path === "$.claimedSignature"));

  const proc = runCli([
    "--expect-reject",
    UNBOUND_CODE,
    "--claim",
    join(invalidFixtureDir(), "bound-hash-unbound-signature.json"),
  ]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
});

test("GIT_OBJECT_DIRECTORY does not bind a foreign object or hide 072f8d0", () => {
  const injected = makeIsolatedCommitRepo();
  try {
    withEnv({ GIT_OBJECT_DIRECTORY: join(injected.gitDir, "objects") }, () => {
      const foreign = bindClaimedHash(injected.hash);
      assert.equal(foreign.ok, false, JSON.stringify(foreign));
      assert.equal(foreign.code, UNBOUND_CODE);
      const pinned = bindClaimedHash(VERANTIS_PR2_ABBREV);
      assert.equal(pinned.ok, true, JSON.stringify(pinned));
      assert.equal(pinned.objectType, "commit");
    });
  } finally {
    rmSync(injected.dir, { recursive: true, force: true });
  }
});

test("GIT_ALTERNATE_OBJECT_DIRECTORIES does not bind a foreign object", () => {
  const injected = makeIsolatedCommitRepo();
  try {
    const proc = runCli(["--hash", injected.hash], {
      env: { GIT_ALTERNATE_OBJECT_DIRECTORIES: join(injected.gitDir, "objects") },
    });
    assert.notEqual(proc.status, 0, proc.stdout);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, UNBOUND_CODE);
  } finally {
    rmSync(injected.dir, { recursive: true, force: true });
  }
});

test("cwd git directory is not an implicit object store", () => {
  const injected = makeIsolatedCommitRepo();
  try {
    const fromInjected = runCli(["--hash", injected.hash], { cwd: injected.dir });
    assert.notEqual(fromInjected.status, 0, fromInjected.stdout);
    const body = JSON.parse(fromInjected.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, UNBOUND_CODE);

    const explicit = runCli(["--git-dir", injected.gitDir, "--hash", injected.hash]);
    assert.equal(explicit.status, 0, explicit.stderr + explicit.stdout);
    const explicitBody = JSON.parse(explicit.stdout);
    assert.equal(explicitBody.ok, true);
    assert.equal(explicitBody.objectType, "commit");
  } finally {
    rmSync(injected.dir, { recursive: true, force: true });
  }
});

test("GIT_DIR does not add a third object store", () => {
  const injected = makeIsolatedCommitRepo();
  try {
    const proc = runCli(["--hash", injected.hash], { env: { GIT_DIR: injected.gitDir } });
    assert.notEqual(proc.status, 0, proc.stdout);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, UNBOUND_CODE);
  } finally {
    rmSync(injected.dir, { recursive: true, force: true });
  }
});

test("source does not call GitHub or mutate remotes", () => {
  const names = readdirSync(here);
  assert.ok(!names.includes("radar.mjs"));
  const scanned = ["lib.mjs", "cli.mjs", "test.mjs", "README.md", "PINS.md"];
  const joined = scanned.map((name) => readFileSync(join(here, name), "utf8")).join("\n");
  assert.doesNotMatch(joined, /api\.github\.com/);
  assert.doesNotMatch(joined, /gh\s+api/);
  assert.doesNotMatch(joined, /git\s+push/);
  assert.doesNotMatch(joined, /git\s+fetch/);
  for (const filePath of listJsonFiles(validFixtureDir())) {
    const claim = loadJson(filePath);
    assert.ok(catalog.actorLabels.includes(claim.actorLabel), filePath);
  }
});

test("catFileType does not invent unresolved S122 object", () => {
  const result = catFileType(S122_UNRESOLVED);
  assert.equal(result.ok, false);
  assert.equal(result.code, UNBOUND_CODE);
});
