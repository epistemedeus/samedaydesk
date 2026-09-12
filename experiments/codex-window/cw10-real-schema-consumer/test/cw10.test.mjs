import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archiveRoot = process.env.USEFUL_JOBS_ROOT;

test("fixture pins a different real pair than M15", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "manifest.json"), "utf8"));
  assert.equal(manifest.source.repository, "octokit/webhooks");
  assert.match(manifest.source.path, /organization\/renamed/);
  assert.notEqual(manifest.source.path, "src/schemas/json/package.json");
  assert.notEqual(manifest.source.repository, "epistemedeus/samedaydesk");
});

test("source pair is the required membership-to-changes revision", () => {
  const pairRoot = path.join(root, "fixtures", "upstream", "organization-renamed");
  const before = JSON.parse(fs.readFileSync(path.join(pairRoot, "before", "schema.json"), "utf8"));
  const after = JSON.parse(fs.readFileSync(path.join(pairRoot, "after", "schema.json"), "utf8"));
  assert(before.required.includes("membership"));
  assert(!before.required.includes("changes"));
  assert(after.required.includes("changes"));
  assert(!after.required.includes("membership"));
  assert.equal(before.additionalProperties, false);
  assert.equal(after.additionalProperties, false);
});

test("released CLI false negative is witnessed and migration is sufficient", { skip: !archiveRoot && "USEFUL_JOBS_ROOT not set" }, () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw10-test-"));
  const run = spawnSync(process.execPath, [path.join(root, "bin", "check.mjs"), `--archive-root=${archiveRoot}`, `--out-dir=${outDir}`], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf8"));
  assert.equal(report.archive.result.status, "informational");
  assert.equal(report.archive.result.breaking, 0);
  assert.match(report.decision.engineDisposition, /false-negative/);
  assert.deepEqual(report.decision.stoppedWorking, ["saved-membership.json"]);
  assert.equal(report.witness["saved-membership.json"].beforeValid, true);
  assert.equal(report.witness["saved-membership.json"].afterValid, false);
  assert.equal(report.witness["migrated-changes.json"].afterValid, true);
});
