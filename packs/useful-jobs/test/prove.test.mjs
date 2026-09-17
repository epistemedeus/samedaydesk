import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT, PIN, findRepoRoot } from "../lib/paths.mjs";
import { bindEngine, overlaySkill } from "../lib/bind.mjs";

const PROVE = join(PACK_ROOT, "bin/prove.mjs");
const REPO = findRepoRoot();

function runProve(args, extra = {}) {
  return spawnSync(process.execPath, [PROVE, ...args], {
    encoding: "utf8",
    cwd: REPO,
    maxBuffer: 8 * 1024 * 1024,
    ...extra,
  });
}

test("lint of shipped SKILL.md exits 0", () => {
  const r = runProve(["lint"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.deepEqual(body.advertisedCommands, ["list", "help"]);
  const verbs = new Set(body.advertised.map((a) => a.verb));
  assert.deepEqual([...verbs].sort(), ["help", "list"]);
});

test("cold prove overlays SKILL.md and runs advertised list/help on 1.4.7", () => {
  const r = runProve([]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "prove");
  assert.equal(body.archiveOverlay, "SKILL.md");
  assert.equal(body.engine.version, "1.4.7");
  assert.equal(body.engine.sha256, PIN.engine.sha256);
  assert.equal(body.engine.bytes, PIN.engine.bytes);
  assert.deepEqual(body.jobs, PIN.jobs);
  assert.equal(body.jobs.length, 10);
  assert.equal(body.jobs[0], "lockfile-pin-delta");
  assert.equal(body.boundary.published, false);
  assert.ok(body.results.length >= 4);
  for (const step of body.results) {
    assert.equal(step.status, 0, JSON.stringify(step));
    assert.ok(step.argv[0] === "list" || step.argv[0] === "help");
  }
  const list = body.results.find((s) => s.argv.length === 1 && s.argv[0] === "list");
  assert.ok(list, "list result missing");
  assert.match(list.stdoutPreview, /lockfile-pin-delta/);
});

test("next-archive overlay lands SKILL.md at extract root", () => {
  const bound = bindEngine({ repoRoot: REPO });
  try {
    const dest = overlaySkill(bound.kitRoot);
    assert.equal(dest, join(bound.kitRoot, "SKILL.md"));
    assert.equal(existsSync(dest), true);
    const shipped = readFileSync(join(PACK_ROOT, "SKILL.md"), "utf8");
    assert.equal(readFileSync(dest, "utf8"), shipped);
    assert.match(readFileSync(dest, "utf8"), /^name:\s*useful-jobs\s*$/m);
  } finally {
    rmSync(bound.extractRoot, { recursive: true, force: true });
  }
});
