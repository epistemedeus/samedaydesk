import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { PACK_ROOT, REPO_ROOT } from "../lib/paths.mjs";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const TEXT_EXT = new Set([".mjs", ".js", ".json", ".md", ".txt"]);

test("pack files stay inside tests/v6-useful-job-desk-counterexamples", () => {
  const files = walk(PACK_ROOT);
  assert.ok(files.length > 0);
  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    assert.match(rel, /^tests\/v6-useful-job-desk-counterexamples\//);
  }
});

test("pack does not import J6 desk or production engines", () => {
  const files = walk(PACK_ROOT).filter((f) => TEXT_EXT.has(extname(f)) || extname(f) === "");
  const banned = [
    /from\s+["'][^"']*packs\/useful-job-desk/,
    /from\s+["'][^"']*\/engines\//,
    /from\s+["'][^"']*server\/paid-useful-jobs/,
    /require\(["'][^"']*packs\/useful-job-desk/,
    /require\(["'][^"']*\/engines\//,
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const re of banned) {
      assert.equal(re.test(text), false, `${relative(REPO_ROOT, file)} matches ${re}`);
    }
  }
});

test("SOURCE-NOTICE records the J6 disjoint and engine kill", () => {
  const notice = readFileSync(join(PACK_ROOT, "SOURCE-NOTICE.txt"), "utf8");
  assert.match(notice, /packs\/useful-job-desk/);
  assert.match(notice, /does not own or import J6/i);
  assert.match(notice, /does not edit\s+production engines/i);
  assert.match(notice, /missing-output-reported-delivered/);
});

function git(args) {
  return spawnSync("git", args, { encoding: "utf8", cwd: REPO_ROOT });
}

function lines(stdout) {
  return String(stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function assertInPack(name, label) {
  assert.equal(name.startsWith("engines/"), false, `${label}: ${name}`);
  assert.equal(name.includes("/engines/"), false, `${label}: ${name}`);
  assert.equal(name.startsWith("packs/useful-job-desk"), false, `${label}: ${name}`);
  assert.match(name, /^tests\/v6-useful-job-desk-counterexamples\//, `${label}: ${name}`);
}

test("branch and dirty tree stay inside the write boundary", () => {
  const tracked = lines(git(["ls-files", "tests/v6-useful-job-desk-counterexamples"]).stdout);
  assert.ok(tracked.length > 0, "expected tracked pack files");
  for (const name of tracked) assertInPack(name, "tracked");

  const dirty = [
    ...lines(git(["diff", "--name-only", "HEAD"]).stdout),
    ...lines(git(["diff", "--name-only", "--cached"]).stdout),
    ...lines(git(["ls-files", "--others", "--exclude-standard"]).stdout),
  ];
  for (const name of dirty) assertInPack(name, "dirty");

  const shas = lines(git(["log", "--pretty=%H", "-n", "50"]).stdout);
  let base = null;
  for (const sha of shas) {
    const parent = git(["rev-parse", "--verify", "--quiet", `${sha}^`]);
    if (parent.status !== 0) continue;
    const changed = lines(git(["diff", "--name-only", `${sha}^`, sha]).stdout);
    if (changed.some((name) => !name.startsWith("tests/v6-useful-job-desk-counterexamples/"))) {
      base = sha;
      break;
    }
  }
  assert.ok(base, "expected an ancestor commit outside the pack");
  const branch = lines(git(["diff", "--name-only", `${base}...HEAD`]).stdout);
  assert.ok(branch.length > 0, "expected pack files vs the last non-pack ancestor");
  for (const name of branch) assertInPack(name, "branch");
});
