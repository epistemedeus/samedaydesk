/**
 * Public-entry gate: shell the offline examples cited in root README.md.
 * Clean checkout + Node 22 — no npm install, no network, no payment.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const readmePath = join(root, "README.md");

function bash(script, env = {}) {
  return spawnSync("bash", ["-lc", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
}

function extractFencedBash(md) {
  const blocks = [];
  const re = /```bash\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md))) blocks.push(m[1].trim());
  return blocks;
}

test("root README cites presence/result-reuse docs and free vs offline modes", () => {
  const md = readFileSync(readmePath, "utf8");
  assert.match(md, /tools\/presence\/FOR-AGENTS-COLD-READ\.md/);
  assert.match(md, /tools\/presence\/REGISTRY-CONSUMER\.md/);
  assert.match(md, /tools\/result-reuse\/README\.md/);
  assert.match(md, /preferFixture/);
  assert.match(md, /offline_fixture/);
  assert.match(md, /--opt-in/);
  assert.match(md, /test:public-entry/);
});

test("cited offline cold-read example returns offline_fixture unpaid", () => {
  const md = readFileSync(readmePath, "utf8");
  const blocks = extractFencedBash(md);
  const cold = blocks.find((b) => b.includes("preferFixture:true") && b.includes("resolveForAgentsColdRead"));
  assert.ok(cold, "README must cite preferFixture cold-read bash block");
  const r = bash(cold);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const json = JSON.parse(r.stdout);
  assert.equal(json.outcome, "offline_fixture");
  assert.equal(json.paid, false);
  assert.equal(json.liveObserved, false);
});

test("cited result-reuse page-change export writes neomorphic observation", () => {
  const md = readFileSync(readmePath, "utf8");
  const blocks = extractFencedBash(md);
  const pageBlock = blocks.find(
    (b) =>
      b.includes("accepted-page-change.json") &&
      b.includes("export") &&
      b.includes("--opt-in") &&
      b.includes("$PILOT_EXAMPLE_DIR/reuse-observation.json"),
  );
  assert.ok(pageBlock, "README must cite page-change export bash block");

  const dir = mkdtempSync(join(tmpdir(), "sdd-public-entry-"));
  const out = join(dir, "reuse-observation.json");
  // Keep the literal example; replace only its fresh-directory allocation.
  assert.ok(pageBlock.includes('PILOT_EXAMPLE_DIR="$(mktemp -d)"'));
  const script = pageBlock.replace('PILOT_EXAMPLE_DIR="$(mktemp -d)"', `PILOT_EXAMPLE_DIR=${JSON.stringify(dir)}`);
  try {
    const r = bash(script);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const observation = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(observation.schema, "neomorphic.task-memory.observation.v1");
    assert.equal(observation.taskScope.taskId, "vendor-watch");
    assert.match(r.stdout, /"optIn": true/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cited result-reuse record export writes neomorphic observation", () => {
  const md = readFileSync(readmePath, "utf8");
  const blocks = extractFencedBash(md);
  const recordBlock = blocks.find(
    (b) =>
      b.includes("accepted-record-report.json") &&
      b.includes("--opt-in") &&
      b.includes("$PILOT_EXAMPLE_DIR/reuse-record-observation.json"),
  );
  assert.ok(recordBlock, "README must cite record-export bash block");

  const dir = mkdtempSync(join(tmpdir(), "sdd-public-entry-rec-"));
  const out = join(dir, "reuse-record-observation.json");
  assert.ok(recordBlock.includes('PILOT_EXAMPLE_DIR="$(mktemp -d)"'));
  const script = recordBlock.replace('PILOT_EXAMPLE_DIR="$(mktemp -d)"', `PILOT_EXAMPLE_DIR=${JSON.stringify(dir)}`);
  try {
    const r = bash(script);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const observation = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(observation.schema, "neomorphic.task-memory.observation.v1");
    assert.equal(observation.taskScope.taskId, "vendor-watch");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
