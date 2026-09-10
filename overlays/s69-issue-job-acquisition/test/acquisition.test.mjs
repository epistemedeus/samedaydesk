import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const overlay = join(here, "..");
const repo = join(overlay, "../..");
const cli = join(overlay, "bin/issue-evidence.mjs");
const fixtures = join(repo, "tools/recurring-job-recipes/fixtures/issue-evidence");

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd: overlay,
  });
}

test("pin targets S71 tip and input base", () => {
  const pin = JSON.parse(readFileSync(join(overlay, "PIN.json"), "utf8"));
  assert.equal(pin.semanticsTip, "063d04c3828e197bff32f3aa69a54170982a39a5");
  assert.equal(pin.inputBase, "c295af075c86ab28fea075633e95934a776d006c");
  assert.equal(pin.recipeId, "issue-evidence");
  assert.equal(pin.session, "s75");
});

test("SKILL.md has machine-readable frontmatter", () => {
  const md = readFileSync(join(overlay, "SKILL.md"), "utf8");
  assert.ok(md.startsWith("---\n"));
  assert.match(md, /name:\s*issue-evidence/);
  assert.match(md, /description:/);
  assert.match(md, /063d04c3828e197bff32f3aa69a54170982a39a5/);
});

test("fixture first run writes immutable prior artifact", () => {
  const out = mkdtempSync(join(tmpdir(), "s75-acq-"));
  const r = run([
    "--evidence-fixture",
    join(fixtures, "99533-base.json"),
    "--schedule",
    "weekly",
    "--clock",
    "2026-09-10T01:00:00.000Z",
    "--out-dir",
    out,
    "--write-artifact",
  ]);
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.outcome, "changed");
  assert.ok(body.persisted?.artifact?.path);
  assert.ok(existsSync(body.persisted.artifact.path));
  const prior = JSON.parse(readFileSync(body.persisted.artifact.path, "utf8"));
  assert.equal(prior.immutable, true);
  assert.equal(prior.sha256.length, 64);
  assert.ok(prior.payload?.evidence?.observation?.completeness);
  rmSync(out, { recursive: true, force: true });
});

test("prior + same-length edit fixture yields changed", () => {
  const out1 = mkdtempSync(join(tmpdir(), "s75-acq1-"));
  const first = run([
    "--evidence-fixture",
    join(fixtures, "99533-base.json"),
    "--schedule",
    "weekly",
    "--clock",
    "2026-09-10T01:00:00.000Z",
    "--out-dir",
    out1,
    "--write-artifact",
  ]);
  assert.equal(first.status, 0, first.stderr);
  const prior = JSON.parse(first.stdout).persisted.artifact.path;
  const out2 = mkdtempSync(join(tmpdir(), "s75-acq2-"));
  const second = run([
    "--evidence-fixture",
    join(fixtures, "99533-same-length-edit.json"),
    "--prior",
    prior,
    "--schedule",
    "weekly",
    "--clock",
    "2026-09-10T02:00:00.000Z",
    "--out-dir",
    out2,
    "--write-artifact",
  ]);
  assert.equal(second.status, 0, second.stderr + second.stdout);
  const body = JSON.parse(second.stdout);
  assert.equal(body.outcome, "changed");
  const delta = body.evidence?.delta || {};
  const changes = delta.commentChanges || [];
  assert.ok(changes.some((c) => c.classification === "edited" && c.sameLength === true));
  rmSync(out1, { recursive: true, force: true });
  rmSync(out2, { recursive: true, force: true });
});

test("foreign prior identity is rejected before observation", () => {
  const out1 = mkdtempSync(join(tmpdir(), "s75-id1-"));
  const first = run([
    "--evidence-fixture",
    join(fixtures, "99533-base.json"),
    "--schedule",
    "weekly",
    "--clock",
    "2026-09-10T01:00:00.000Z",
    "--out-dir",
    out1,
    "--write-artifact",
  ]);
  assert.equal(first.status, 0, first.stderr);
  const prior = JSON.parse(first.stdout).persisted.artifact.path;
  const second = run([
    "--evidence-fixture",
    join(fixtures, "identity-mismatch-body.json"),
    "--prior",
    prior,
    "--schedule",
    "weekly",
    "--clock",
    "2026-09-10T02:00:00.000Z",
  ]);
  assert.notEqual(second.status, 0);
  const body = JSON.parse(second.stdout);
  assert.equal(body.ok, false);
  const blob = JSON.stringify(body);
  assert.match(blob, /prior_identity_mismatch|invalid_prior|identity|mismatch/i);
  rmSync(out1, { recursive: true, force: true });
});

test("429 fixture classifies without hanging", () => {
  const r = run([
    "--evidence-fixture",
    join(fixtures, "http-429.json"),
    "--schedule",
    "once",
    "--clock",
    "2026-09-10T01:00:00.000Z",
  ]);
  // Honest error classification completes; process may exit non-zero when ok=false.
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(["partial", "error", "changed"].includes(body.outcome));
  const text = JSON.stringify(body);
  assert.match(text, /429|rate_limited|forbidden|partial|error/i);
});

test("GITHUB_TOKEN env is not required and not inferred by lean CLI args", () => {
  const r = run(
    [
      "--evidence-fixture",
      join(fixtures, "99533-base.json"),
      "--schedule",
      "once",
      "--clock",
      "2026-09-10T01:00:00.000Z",
    ],
    { GITHUB_TOKEN: "should-not-be-read" },
  );
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.doesNotMatch(JSON.stringify(body), /should-not-be-read/);
});

test("customer HTML note explains miss without paid-HTML or completeness claims", () => {
  const md = readFileSync(join(overlay, "docs/HTML-VS-COMMENTS.md"), "utf8");
  assert.match(md, /HTML/);
  assert.match(md, /REST|comments endpoints/i);
  assert.doesNotMatch(md, /HTML product failed|paid HTML failure|complete GitHub history/i);
  assert.doesNotMatch(md, /\$[0-9]|subscribe now|buy now|sign up to pay/i);
});
