import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ARCHIVE_SHA256, EXPORT_SCHEMA } from "../lib/pins.mjs";
import { prefixLayout, sha256File } from "../lib/install.mjs";
import { runD07Cli, runPythonCli } from "../lib/invoke.mjs";
import { archivePath, extractFeedSamples, sharedPrefix, stageCaller } from "./helpers.mjs";

function pythonBudget(prefix) {
  const layout = prefixLayout(prefix);
  const caller = stageCaller(prefix);
  const outDir = join(layout.work, "export-budget");
  const result = runPythonCli(prefix, [
    "run",
    "vendor-budget-impact",
    "--archive",
    archivePath(prefix),
    "--before",
    caller.before,
    "--after",
    caller.after,
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.json?.ok, true, result.stderr || result.stdout);
  return outDir;
}

test("export then import consumes the same zip bytes and restores job files", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const outDir = pythonBudget(prefix);
  const exportDir = join(layout.work, "zip-export");
  const exported = runD07Cli(prefix, ["export", "--in-dir", outDir, "--out", exportDir]);
  assert.equal(exported.status, 0, exported.stderr || exported.stdout);
  assert.equal(exported.json?.ok, true);
  assert.equal(exported.json?.jobId, "vendor-budget-impact");
  assert.equal(exported.json?.customerDelivery, false);
  const zip = join(exportDir, "job-artifacts.zip");
  assert.ok(existsSync(zip));
  const zipSha = `sha256:${sha256File(zip)}`;
  const sidecar = readFileSync(`${zip}.sha256`, "utf8").trim();
  assert.equal(sidecar, zipSha);
  const importDir = join(layout.work, "zip-import");
  const imported = runD07Cli(prefix, ["import", "--zip", zip, "--out", importDir]);
  assert.equal(imported.status, 0, imported.stderr || imported.stdout);
  assert.equal(imported.json?.ok, true);
  assert.equal(imported.json?.zipSha256, zipSha);
  assert.equal(imported.json?.jobOutputCorrespondence, true);
  assert.equal(sha256File(join(importDir, "budget-impact.json")), sha256File(join(outDir, "budget-impact.json")));
  const manifest = JSON.parse(readFileSync(join(exportDir, "manifest.json"), "utf8"));
  assert.equal(manifest.schema, EXPORT_SCHEMA);
  assert.equal(String(manifest.archiveSha256).replace(/^sha256:/, ""), ARCHIVE_SHA256);
});

test("caller archive sha256 override that does not match consumed bytes is refused", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const outDir = pythonBudget(prefix);
  const other = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const exported = runD07Cli(prefix, [
    "export",
    "--in-dir",
    outDir,
    "--out",
    join(layout.work, "override-export"),
    "--archive-sha256",
    other,
  ]);
  assert.equal(exported.status, 2);
  assert.equal(exported.json?.ok, false);
  assert.equal(exported.json?.code, "archive-identity-override");
});

test("known job id with another job's outputs is not a valid delivery", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const samples = extractFeedSamples(prefix, join(layout.work, "mismatch-feed"));
  const feedOut = join(layout.work, "feed-out");
  const ran = runPythonCli(prefix, [
    "run",
    "feed-agenda",
    "--archive",
    archivePath(prefix),
    "--before",
    samples.before,
    "--after",
    samples.after,
    "--out-dir",
    feedOut,
  ]);
  assert.equal(ran.json?.ok, true, ran.stderr || ran.stdout);
  const exported = runD07Cli(prefix, [
    "export",
    "--in-dir",
    feedOut,
    "--out",
    join(layout.work, "mismatch-export"),
    "--job-id",
    "vendor-budget-impact",
  ]);
  assert.equal(exported.status, 2);
  assert.equal(exported.json?.ok, false);
  assert.equal(exported.json?.code, "job-output-mismatch");
  assert.notEqual(exported.json?.customerDelivery, true);
});

test("import with a wrong zip digest claim refuses zip-bytes-mismatch", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const outDir = pythonBudget(prefix);
  const exportDir = join(layout.work, "mismatch-zip-export");
  const exported = runD07Cli(prefix, ["export", "--in-dir", outDir, "--out", exportDir]);
  assert.equal(exported.json?.ok, true);
  const zip = join(exportDir, "job-artifacts.zip");
  const imported = runD07Cli(prefix, [
    "import",
    "--zip",
    zip,
    "--out",
    join(layout.work, "mismatch-zip-import"),
    "--zip-sha256",
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ]);
  assert.equal(imported.status, 2);
  assert.equal(imported.json?.code, "zip-bytes-mismatch");
});
