import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateMaintHandoff } from "../lib/handoff.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const cli = join(repoRoot, "tools/l08-agent-repair/cli.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("prove runs both owned endpoints and rejects seeded failures", () => {
  const result = run(["prove"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /owned-endpoint POST \/v1\/diagnose exit 0 finding mcp\.unknownTool status fail/);
  assert.match(result.stdout, /owned-endpoint POST \/v1\/regress exit 0 finding mcp\.unknownTool fail -> pass/);
  assert.match(result.stdout, /seeded reject-unchanged exit 1/);
  assert.match(result.stdout, /seeded reject-scored exit 1/);
  assert.match(result.stdout, /protocol-edge MCP-Protocol-Version: 1999-01-01 observed 200 required 400 unresolved/);
  const handoff = JSON.parse(readFileSync(join(repoRoot, "tools/l08-agent-repair/MAINT-HANDOFF.json"), "utf8"));
  assert.deepEqual(validateMaintHandoff(handoff), { ok: true });
  assert.equal(handoff.regression.changed.length, 1);
  assert.equal(Object.hasOwn(handoff, "score"), false);
});

test("an unrepaired target is rejected by POST /v1/regress", () => {
  const result = run(["reject-unchanged"]);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /POST \/v1\/regress exit 1/);
  assert.match(result.stdout, /finding_unchanged|unchanged/);
});

test("a scored handoff is rejected", () => {
  const result = run(["reject-scored"]);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /score_product/);
});

test("SDS255, seller-repair, and SDS260 paths stay untouched", () => {
  const diff = spawnSync("git", [
    "diff",
    "--name-only",
    "9cc816e13bfea448d68a26380efe2a91c88773dd",
    "--",
    "server/lib/agent-readiness",
    "server/routes/mcp.js",
    "server/routes/agent-readiness.js",
    "server/lib/seller-repair-checkout.js",
    "server/lib/pulse.js",
    "client/src/data/sellerRepairBriefs.ts",
    "experiments/s260-useful-jobs-public-integration",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(diff.status, 0, diff.stderr);
  assert.equal(diff.stdout.trim(), "");
});
