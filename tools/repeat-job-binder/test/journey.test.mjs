import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractKit, readJson, runBind, runNode, sha256File, writeJson } from "./helpers.mjs";

function mutateAfter(src, dest) {
  const doc = JSON.parse(fs.readFileSync(src, "utf8"));
  doc.rows = doc.rows.map((row) =>
    row.field === "gpt-4.1-input" ? { ...row, value: 4 } : row,
  );
  writeJson(dest, doc);
}

test("journey: repeat-job-record on samples/repeat/a, then binder with changed after", async () => {
  const kit = extractKit();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w4-rjb-journey-"));
  const firstOut = path.join(work, "first");
  fs.mkdirSync(firstOut, { recursive: true });

  const nextRun = path.join(kit.usefulJobsRoot, "samples/repeat/a/next-run.json");
  const recorded = runNode(
    kit.usefulJobsCli,
    ["run", "repeat-job-record", "--next-run", nextRun, "--out-dir", firstOut],
    { cwd: kit.usefulJobsRoot },
  );
  assert.equal(recorded.json.ok, true, recorded.stdout);
  assert.equal(recorded.json.identityVerified, true);
  assert.equal(recorded.json.family, "pricing-row-unit");
  const firstTicket = readJson(path.join(firstOut, "repeat-job.json"));
  assert.equal(firstTicket.repeatJob.schedulerDaemon, false);
  const firstAfterSha = firstTicket.repeatJob.inputs.verifiedDigests.after.sha256;
  assert.equal(typeof firstAfterSha, "string");
  assert.match(firstAfterSha, /^[0-9a-f]{64}$/);

  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  fs.copyFileSync(path.join(kit.usefulJobsRoot, "samples/pricing/a/before.json"), before);
  mutateAfter(path.join(kit.usefulJobsRoot, "samples/pricing/a/after.json"), after);
  const newSha = sha256File(after);
  assert.notEqual(newSha, firstAfterSha);

  const catalogOut = path.join(work, "second-catalog");
  const catalog = runBind([
    "--ticket",
    path.join(firstOut, "repeat-job.json"),
    "--before",
    before,
    "--after",
    after,
    "--declare-after-sha256",
    newSha,
    "--engine",
    "catalog",
    "--out-dir",
    catalogOut,
  ]);
  assert.equal(catalog.json.ok, true, catalog.stdout);
  assert.equal(catalog.json.status, "actionable");
  assert.equal(catalog.json.family, "pricing-row-unit");
  assert.equal(catalog.json.engineKind, "catalog");
  assert.equal(catalog.json.distinctFromFirst, true);
  assert.equal(catalog.json.schedulerDaemon, false);
  assert.equal(catalog.json.settling, false);
  assert.match(catalog.json.termsVersion, /^sha256:[0-9a-f]{64}$/);

  const second = readJson(path.join(catalogOut, "second-run.json"));
  assert.equal(second.schema, "w4.repeat-job-binder.second-run.v1");
  assert.equal(second.secondRun.afterSha256, newSha);
  assert.equal(second.firstRun.afterSha256, firstAfterSha);
  assert.notEqual(second.digest, recorded.json.digest);
  assert.equal(fs.existsSync(path.join(catalogOut, "engine/budget-impact.json")), true);
  assert.equal(fs.existsSync(path.join(catalogOut, "second-run.md")), true);
  const engineArt = readJson(path.join(catalogOut, "engine/budget-impact.json"));
  assert.equal(engineArt.appId, "vendor-budget-impact");
  assert.notEqual(engineArt.status, "refused");

  const vpOut = path.join(work, "second-vendor-pin");
  const vp = runBind([
    "--ticket",
    path.join(firstOut, "repeat-job.json"),
    "--before",
    before,
    "--after",
    after,
    "--declare-after-sha256",
    newSha,
    "--engine",
    "vendor-pin",
    "--out-dir",
    vpOut,
  ]);
  assert.equal(vp.json.ok, true, vp.stdout);
  assert.equal(vp.json.engineKind, "vendor-pin");
  assert.equal(vp.json.distinctFromFirst, true);
  assert.notEqual(vp.json.digest, catalog.json.digest);
  const vpReport = readJson(path.join(vpOut, "engine/record-repeat.json"));
  assert.equal(vpReport.family, "pricing-row-unit");
  assert.equal(vpReport.ok, true);
});

test("openapi-used-ops catalog second use from published caller-beta fixture (not live)", () => {
  const kit = extractKit();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w4-rjb-openapi-"));
  const firstOut = path.join(work, "first");
  fs.mkdirSync(firstOut, { recursive: true });
  const sampleDir = path.join(kit.usefulJobsRoot, "samples/repeat/caller-beta");
  const recorded = runNode(
    kit.usefulJobsCli,
    ["run", "repeat-job-record", "--next-run", path.join(sampleDir, "next-run.json"), "--out-dir", firstOut],
    { cwd: kit.usefulJobsRoot },
  );
  assert.equal(recorded.json.ok, true, recorded.stdout);
  assert.equal(recorded.json.family, "openapi-used-ops");
  const firstTicket = readJson(path.join(firstOut, "repeat-job.json"));
  const firstAfterSha = firstTicket.repeatJob.inputs.verifiedDigests.after.sha256;

  const before = path.join(work, "before.yaml");
  const after = path.join(work, "after.yaml");
  const used = path.join(work, "used.json");
  fs.copyFileSync(path.join(sampleDir, "before.yaml"), before);
  fs.copyFileSync(path.join(sampleDir, "used.json"), used);
  const afterText = fs.readFileSync(path.join(sampleDir, "after.yaml"), "utf8");
  fs.writeFileSync(after, `${afterText}\n# w4-repeat-job-binder-second-run\n`);
  const newSha = sha256File(after);
  assert.notEqual(newSha, firstAfterSha);

  const out = path.join(work, "second");
  const bound = runBind([
    "--ticket",
    path.join(firstOut, "repeat-job.json"),
    "--before",
    before,
    "--after",
    after,
    "--used",
    used,
    "--declare-after-sha256",
    newSha,
    "--engine",
    "catalog",
    "--out-dir",
    out,
  ]);
  assert.equal(bound.json.ok, true, bound.stdout);
  assert.equal(bound.json.family, "openapi-used-ops");
  assert.equal(bound.json.distinctFromFirst, true);
  assert.equal(fs.existsSync(path.join(out, "engine/upgrade-brief.json")), true);
});
