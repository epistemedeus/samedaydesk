import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHash } from "node:crypto";
import { preflight } from "../lib/preflight.mjs";
import { loadCatalog, findJob } from "../lib/catalog.mjs";
import { loadDeliveryCatalog } from "../../../server/paid-useful-jobs/lib/delivery-catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = join(here, "../../page-change-offline-job/fixtures/customer-job");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

test("preflight stages page job.json and nested before/after captures", () => {
  const work = mkdtempSync(join(tmpdir(), "jip-jobdoc-"));
  copyFileSync(join(PAGE, "job.json"), join(work, "job.json"));
  copyFileSync(join(PAGE, "before.json"), join(work, "before.json"));
  copyFileSync(join(PAGE, "after.json"), join(work, "after.json"));
  const catalog = loadDeliveryCatalog();
  const job = findJob(catalog, "page-change-offline-job");
  const result = preflight({
    catalog,
    job,
    flags: { job: join(work, "job.json") },
    outDir: join(work, "pre"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.inputs.job.sha256, sha256(readFileSync(join(work, "job.json"))));
  assert.equal(result.inputs["job-before"].sha256, sha256(readFileSync(join(work, "before.json"))));
  assert.equal(result.inputs["job-after"].sha256, sha256(readFileSync(join(work, "after.json"))));
  assert.equal(readFileSync(result.inputs["job-after"].stagedPath).equals(readFileSync(join(work, "after.json"))), true);
});

test("preflight refuses a capture symlink that escapes the job directory", () => {
  const work = mkdtempSync(join(tmpdir(), "jip-jobdoc-esc-"));
  const outside = mkdtempSync(join(tmpdir(), "jip-jobdoc-outside-"));
  writeFileSync(join(outside, "secret.json"), `${JSON.stringify({ ok: true })}\n`);
  copyFileSync(join(PAGE, "job.json"), join(work, "job.json"));
  copyFileSync(join(PAGE, "before.json"), join(work, "before.json"));
  symlinkSync(join(outside, "secret.json"), join(work, "after.json"));
  const catalog = loadDeliveryCatalog();
  const job = findJob(catalog, "page-change-offline-job");
  assert.throws(
    () =>
      preflight({
        catalog,
        job,
        flags: { job: join(work, "job.json") },
        outDir: join(work, "pre"),
      }),
    (err) => err?.code === "input-path-escapes-root" || err?.detail?.code === "input-path-escapes-root",
  );
  void loadCatalog;
  void mkdirSync;
});
