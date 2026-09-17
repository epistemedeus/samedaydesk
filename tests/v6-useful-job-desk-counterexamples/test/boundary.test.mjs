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

test("git diff vs HEAD does not touch production engines", () => {
  const diff = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  const names = `${diff.stdout || ""}\n${untracked.stdout || ""}`
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(names.length > 0, "expected pack files to be untracked or modified");
  for (const name of names) {
    assert.equal(name.startsWith("engines/"), false, name);
    assert.equal(name.includes("/engines/"), false, name);
    assert.equal(name.startsWith("packs/useful-job-desk"), false, name);
    assert.match(name, /^tests\/v6-useful-job-desk-counterexamples\//, name);
  }
});
