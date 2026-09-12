import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { KIT_SHA256, ensureKit, runPageChange } from "../adapter.mjs";
import { CONTROL_FIELDS, SELECTED_FIELDS, extractFields, wrapHeldBatch } from "../wrap-extract-batch.mjs";
import { witness } from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmpRoot = join(root, "tmp-out");
mkdirSync(tmpRoot, { recursive: true });

function sha256File(rel) {
  return createHash("sha256").update(readFileSync(join(root, rel))).digest("hex");
}

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function withOutDir(prefix, fn) {
  const dir = mkdtempSync(join(tmpRoot, prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const acquisition = loadJson("acquisition.json");
const owned = loadJson("owned-paths.json");
const beforeBatch = loadJson("fixtures/held/before.json");
const afterBatch = loadJson("fixtures/held/after.json");

test("useful-jobs 1.4.0 kit is present under the exclusive vendor path", () => {
  const kit = ensureKit();
  assert.match(kit.cli.replace(/\\/g, "/"), /vendor\/useful-jobs-1\.4\.0\/bin\/useful-jobs\.mjs$/);
  assert.equal(KIT_SHA256, "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f");
  assert.equal(acquisition.usefulJobs.sha256, KIT_SHA256);
});

test("SOURCE pins full SHAs and stored fixture sha256", () => {
  assert.equal(acquisition.beforeSha, "f75839ee25cde2383fab299f6d8fc94a442f444b");
  assert.equal(acquisition.afterSha, "7e10095e0c9028c9e7109df00d15db46411a3378");
  assert.equal(acquisition.repo, "spdx/license-list-data");
  assert.match(acquisition.license, /CC-BY-3\.0/);
  assert.equal(acquisition.liveFetch, false);
  assert.equal(acquisition.purchaseAuthority, false);
  for (const file of acquisition.files) {
    assert.equal(sha256File(file.path), file.sha256, file.path);
    assert.equal(readFileSync(join(root, file.path)).length, file.bytes, file.path);
  }
  const source = readFileSync(join(root, "SOURCE.md"), "utf8");
  assert.match(source, /f75839ee25cde2383fab299f6d8fc94a442f444b/);
  assert.match(source, /7e10095e0c9028c9e7109df00d15db46411a3378/);
  assert.match(source, /b749d91c8afaf1c3400b0a8a23eacebddcea0a6fbe7303b70430cc7254a3f6c3/);
  assert.match(source, /7dffa7ddfbc27ff214bca363629533cfd081e08fc8c15cfc021bef4e89a71c6a/);
});

test("owned paths declare non-equivalent HTML to extract-batch migration", () => {
  assert.equal(owned.ownedPath, "experiments/wave6/h6d-real-consumers/consumers/P03-spdx-mit-html/");
  assert.equal(owned.receivingIntegrationOwner, "H6D-parent");
  assert.equal(owned.jobId, "page-change-offline-job");
  assert.equal(owned.migration.equivalent, false);
  assert.equal(owned.migration.id, "html-to-extract-batch");
  assert.equal(owned.purchaseAuthority, false);
  assert.equal(owned.networkOnJobPath, false);
});

test("held extract-batch is a caller-owned wrap of official HTML+jsonld", () => {
  const htmlBefore = readFileSync(join(root, "fixtures/official/html.MIT.f75839ee25cd.html"), "utf8");
  const htmlAfter = readFileSync(join(root, "fixtures/official/html.MIT.7e10095e0c90.html"), "utf8");
  const jsonldBefore = loadJson("fixtures/official/jsonld.MIT.f75839ee25cd.jsonld");
  const jsonldAfter = loadJson("fixtures/official/jsonld.MIT.7e10095e0c90.jsonld");
  const beforeFields = extractFields(htmlBefore, jsonldBefore);
  const afterFields = extractFields(htmlAfter, jsonldAfter);
  assert.deepEqual(beforeBatch.sources[0].data, beforeFields);
  assert.deepEqual(afterBatch.sources[0].data, afterFields);
  assert.equal(beforeBatch.product, "samedaydesk-extract-batch");
  assert.equal(beforeBatch.schemaVersion, "samedaydesk.extract-batch.v0");
  assert.equal(beforeBatch.charged, false);
  assert.equal(afterBatch.charged, false);
  assert.equal(beforeFields.title, "MIT License");
  assert.equal(afterFields.title, "MIT License");
  assert.match(beforeFields.text, /without limitation the rights/);
  assert.match(afterFields.text, /without limitation on the rights/);
  assert.ok(!beforeFields.text.includes("without limitation on the rights"));
  assert.equal(beforeFields.jsonLd.seeAlso.length, 1);
  assert.ok(afterFields.jsonLd.seeAlso.includes("http://opensource.org/licenses/MIT"));
  assert.equal(beforeBatch.sources[0].source.startsWith("https:"), false);
  const rebuilt = wrapHeldBatch({
    html: htmlBefore,
    jsonld: jsonldBefore,
    gitSha: acquisition.beforeSha,
    htmlSha256: acquisition.blobs.htmlBefore.sha256,
    jsonldSha256: acquisition.blobs.jsonldBefore.sha256,
    htmlBytes: acquisition.blobs.htmlBefore.bytes,
    jsonldBytes: acquisition.blobs.jsonldBefore.bytes,
    observedAt: "2024-12-19T09:39:35.000Z",
    side: "before",
  });
  assert.deepEqual(rebuilt.sources[0].data, beforeBatch.sources[0].data);
});

test("positive witness: text and jsonLd changed; title/headings unchanged", () => {
  const w = witness(beforeBatch, afterBatch);
  assert.deepEqual(w.changed.sort(), ["jsonLd", "text"]);
  assert.deepEqual(w.unchanged.sort(), ["headings", "title"]);
  assert.deepEqual(w.unknown, []);
  assert.ok(w.added.some((row) => row.includes("http://opensource.org/licenses/MIT")));
  assert.match(w.fact, /optional 'on'/);
  assert.match(w.fact, /seeAlso/);
});

test("control witness: identical batches and title/headings-only on the real pair", () => {
  const identical = witness(beforeBatch, beforeBatch);
  assert.deepEqual(identical.changed, []);
  assert.deepEqual(identical.unchanged, [...SELECTED_FIELDS]);
  const titleHeadings = witness(beforeBatch, afterBatch, CONTROL_FIELDS);
  assert.deepEqual(titleHeadings.changed, []);
  assert.deepEqual(titleHeadings.unchanged, [...CONTROL_FIELDS]);
  assert.deepEqual(titleHeadings.unknown, []);
});

test("witness.mjs does not import kit engine compare/oracle", () => {
  const src = readFileSync(join(root, "witness.mjs"), "utf8");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/engines\/page-change-offline-job\/lib\/compare/.test(src), false);
  assert.equal(/engines\/lockfile-pin-delta\/lib\/compare/.test(src), false);
  assert.equal(/engines\/json-schema-webhook-drift\/lib\/compare/.test(src), false);
});

test("positive adapter: engine verdict changed; claims.fresh false; no network", () => {
  withOutDir("pos-", (outDir) => {
    const r = runPageChange({ job: join(root, "fixtures/jobs/positive.json"), outDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdoutJson?.ok, true);
    const report = r.report;
    assert.equal(report.verdict, "changed");
    assert.equal(report.claims.fresh, false);
    assert.equal(report.claims.complete, true);
    assert.equal(report.provenance.networkUsed, false);
    assert.equal(report.provenance.paymentAttempted, false);
    const paths = (report.changes || []).map((c) => c.path);
    assert.ok(paths.includes("/text"), paths.join(" "));
    assert.ok(paths.includes("/jsonLd/seeAlso"), paths.join(" "));
    assert.ok((report.changes || []).every((c) => c.class === "semantic"));
    const w = witness(beforeBatch, afterBatch);
    assert.ok(w.changed.includes("text"));
    assert.ok(w.changed.includes("jsonLd"));
    assert.ok(existsSync(join(outDir, "page-change.json")));
    assert.ok(existsSync(join(outDir, "page-change.md")));
    assert.equal(r.args.includes("--fetch"), false);
    assert.equal(r.args.includes("--example"), false);
  });
});

test("control adapter: identical before/after is unchanged", () => {
  withOutDir("cid-", (outDir) => {
    const r = runPageChange({ job: join(root, "fixtures/jobs/control-identical.json"), outDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.report.verdict, "unchanged");
    assert.equal(r.report.claims.fresh, false);
    assert.equal(r.report.claims.noChangeProven, true);
    assert.equal(r.report.summary.semantic, 0);
  });
});

test("control adapter: title/headings on the real pair stay unchanged", () => {
  withOutDir("cth-", (outDir) => {
    const r = runPageChange({ job: join(root, "fixtures/jobs/control-title-headings.json"), outDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.report.verdict, "unchanged");
    assert.equal(r.report.claims.fresh, false);
    assert.equal(r.report.claims.noChangeProven, true);
    assert.equal(r.report.claims.complete, true);
    const w = witness(beforeBatch, afterBatch, ["title", "headings"]);
    assert.deepEqual(w.changed, []);
  });
});

test("negative: missing clock refuses clock_required", () => {
  withOutDir("clk-", (outDir) => {
    const r = runPageChange({ job: join(root, "fixtures/jobs/missing-clock.json"), outDir });
    assert.equal(r.status, 2);
    assert.equal(r.code, "clock_required");
    assert.equal(r.stderrJson?.ok, false);
  });
});

test("negative: quote-as-success refuses quote_as_success", () => {
  withOutDir("qas-", (outDir) => {
    const r = runPageChange({ job: join(root, "fixtures/jobs/quote-as-success.json"), outDir });
    assert.equal(r.status, 2);
    assert.equal(r.code, "quote_as_success");
  });
});

test("negative: --example is sample_as_delivered_watch", () => {
  withOutDir("ex-", (outDir) => {
    const r = runPageChange({ outDir, example: true });
    assert.equal(r.status, 2);
    assert.equal(r.code, "sample_as_delivered_watch");
    assert.ok(r.args.includes("--example"));
    assert.equal(r.args.includes("--job"), false);
  });
});

test("negative: live URL path refuses live_fetch_url", () => {
  withOutDir("live-", (outDir) => {
    const r = runPageChange({ job: join(root, "fixtures/jobs/live-url.json"), outDir });
    assert.equal(r.status, 2);
    assert.equal(r.code, "live_fetch_url");
  });
});

test("adapter CLI default job is the held positive pair", () => {
  withOutDir("cli-", (outDir) => {
    const r = spawnSync(process.execPath, [join(root, "adapter.mjs"), "--out-dir", outDir], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.report.verdict, "changed");
    assert.equal(body.report.claims.fresh, false);
  });
});
