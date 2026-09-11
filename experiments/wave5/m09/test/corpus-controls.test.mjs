import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CASES } from "../lib/cases.mjs";
import { loadCorpus } from "../lib/corpus.mjs";
import { SDS_ROOT, SNAPSHOTS_ROOT } from "../lib/paths.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("corpus files exist for every authored case and are extract-batch v0", () => {
  const corpus = loadCorpus();
  assert.equal(corpus.length, CASES.length);
  for (const item of corpus) {
    assert.equal(item.before.schemaVersion, "samedaydesk.extract-batch.v0");
    assert.equal(item.after.schemaVersion, "samedaydesk.extract-batch.v0");
    assert.equal(item.before.product, "samedaydesk-extract-batch");
    assert.equal(item.after.product, "samedaydesk-extract-batch");
    assert.ok(Array.isArray(item.before.sources) && item.before.sources.length > 0);
    assert.ok(Array.isArray(item.fields) && item.fields.includes("title"));
    assert.match(item.clock, /Z$/);
  }
});

test("snapshots are independent of SDS customer-job RFQ fixtures", () => {
  const published = join(
    SDS_ROOT,
    "tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/before.json",
  );
  assert.equal(existsSync(published), true);
  const publishedSha = sha256(readFileSync(published));
  assert.equal(publishedSha, "23833bf7b28ca27a074cb9d73daaa2ec3beed14a55d767567c5fab50b66605f4");
  for (const item of loadCorpus()) {
    const beforeSha = sha256(readFileSync(item.beforePath));
    const afterSha = sha256(readFileSync(item.afterPath));
    assert.notEqual(beforeSha, publishedSha, item.id);
    assert.notEqual(afterSha, publishedSha, item.id);
    const blob = `${readFileSync(item.beforePath, "utf8")}\n${readFileSync(item.afterPath, "utf8")}`;
    assert.equal(blob.includes("https://rfq.example/widgets"), false, item.id);
    assert.equal(blob.includes("Q3 widget RFQ"), false, item.id);
  }
});

test("captured HTML pages exist beside extract snapshots", () => {
  const pages = [
    "northshore-lead-sheet.v1.html",
    "northshore-lead-sheet.title-changed.html",
    "northshore-lead-sheet.description-changed.html",
    "northshore-lead-sheet.heading-changed.html",
    "northshore-lead-sheet.noise-comment.html",
  ];
  for (const name of pages) {
    const html = readFileSync(join(SNAPSHOTS_ROOT, "pages", name), "utf8");
    assert.match(html, /<h1>/);
    assert.match(html, /Northshore/);
  }
  const titlePage = readFileSync(
    join(SNAPSHOTS_ROOT, "pages", "northshore-lead-sheet.title-changed.html"),
    "utf8",
  );
  assert.match(titlePage, /21-day lead/);
});

test("this package does not vendor a page-change kernel", () => {
  const owned = [
    join(SDS_ROOT, "experiments/wave5/m09/lib/evaluate.mjs"),
    join(SDS_ROOT, "experiments/wave5/m09/lib/cli.mjs"),
    join(SDS_ROOT, "experiments/wave5/m09/lib/engine.mjs"),
  ];
  for (const path of owned) {
    const text = readFileSync(path, "utf8");
    assert.equal(text.includes("function classifyVerdict"), false);
    assert.equal(text.includes("function diffJson"), false);
    assert.equal(text.includes("function comparePageChange"), false);
  }
  assert.equal(existsSync(join(SDS_ROOT, "experiments/wave5/m09/lib/compare.mjs")), false);
});
