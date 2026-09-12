import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FAMILIES, MIGRATIONS, loadCatalog, selectJob } from "../lib/catalog.mjs";
import { USEFUL_JOBS, verifyPublishedArchive } from "../lib/kit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const cli = join(root, "bin/select-job.mjs");

function run(args, extra = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
    timeout: 30_000,
    ...extra,
  });
}

test("published useful-jobs 1.4.0 bytes match pin", () => {
  const v = verifyPublishedArchive();
  assert.equal(v.bytes, USEFUL_JOBS.bytes);
  assert.equal(v.digest, USEFUL_JOBS.sha256);
});

test("catalog lists 16 exclusive consumers across four families", () => {
  const cat = loadCatalog();
  assert.equal(cat.purchaseAuthority, false);
  assert.equal(cat.consumers.length, 16);
  for (const f of FAMILIES) {
    assert.equal(cat.byFamily[f].length, 4, f);
  }
});

test("unknown job id refuses closed", () => {
  const r = run(["show", "not-a-real-job"]);
  assert.equal(r.status, 2);
  const err = JSON.parse(r.stderr);
  assert.equal(err.ok, false);
  assert.equal(err.purchaseAuthority, false);
});

test("list --json includes labeled non-equivalent migrations", () => {
  const r = run(["list", "--json"]);
  assert.equal(r.status, 0);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.jobs.length, 16);
  const mig = run(["migrations", "--json"]);
  const m = JSON.parse(mig.stdout);
  assert.equal(m.equivalent, false);
  assert.equal(MIGRATIONS["openapi-to-sds-route-table"].equivalent, false);
  assert.ok(m.migrations["html-to-extract-batch"].dropped.includes("live freshness"));
});

test("select known lockfile consumer", () => {
  const rec = selectJob("L01-commander-lockfile");
  assert.equal(rec.family, "lockfile");
  assert.equal(rec.jobId, "lockfile-pin-delta");
  assert.equal(rec.purchaseAuthority, false);
  assert.ok(existsSync(join(rec.dir, "BRIEF.md")));
});

test("family filter rejects unknown family", () => {
  const r = run(["list", "--family", "openai-routes"]);
  assert.equal(r.status, 2);
});

test("missing job id on show refuses", () => {
  const r = run(["show"]);
  assert.equal(r.status, 2);
});
