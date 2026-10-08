import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { D01_EXPORT, D01_PIN, importD01 } from "../lib/d01.mjs";
import { runLabelledJob } from "../lib/run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(ROOT, "../..");
const WORKTREE = "/tmp/ro-sds-pr52-aeef964";

function ensurePr52Worktree() {
  if (existsSync(join(WORKTREE, D01_EXPORT))) return WORKTREE;
  const added = spawnSync("git", ["fetch", "origin", D01_PIN], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (added.status !== 0) {
    throw new Error(`git fetch D01 pin failed: ${added.stderr || added.stdout}`);
  }
  const wt = spawnSync("git", ["worktree", "add", "--detach", WORKTREE, D01_PIN], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (!existsSync(join(WORKTREE, D01_EXPORT))) {
    throw new Error(`D01 worktree missing ${WORKTREE}: ${wt.stderr || wt.stdout}`);
  }
  return WORKTREE;
}

describe("thin D01 consumer against current SDS52 pin", () => {
  test("consumes runPaidOffer from aeef964 without copying the wrapper", async () => {
    const root = ensurePr52Worktree();
    const d01 = await importD01(root);
    assert.equal(d01.available, true);
    assert.equal(d01.pin, D01_PIN);
    assert.equal(typeof d01.runPaidOffer, "function");

    const work = mkdtempSync(join(tmpdir(), "bvl-d01-"));
    const outDir = join(work, "out");
    mkdirSync(outDir);
    const result = await runLabelledJob(
      {
        jobId: "vendor-budget-impact",
        buyerClass: "owner-qa",
        example: true,
        outDir,
      },
      { paidOffer: (request) => d01.runPaidOffer(request) },
    );
    assert.equal(result.ok, true, JSON.stringify({ outcomeKind: result.outcomeKind, error: result.message, stderr: result.engineStderr, code: result.code }));
    assert.equal(result.row.evidence.jobExecution, "d01-wrapper-pin");
    assert.equal(result.row.d01.pin, D01_PIN);
    assert.equal(result.usefulPaidWork, false);
    assert.equal(result.row.purchaseAuthority, false);
    assert.equal(result.row.usefulDelivery, true);
    assert.ok(result.row.outputs.every((item) => item.sha256));
  });
});
