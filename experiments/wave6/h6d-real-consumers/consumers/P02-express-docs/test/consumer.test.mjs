import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runPageChangeJob } from "../adapter.mjs";
import { extractMarkdownFacts } from "../md-facts.mjs";
import { witness } from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const acquisition = JSON.parse(readFileSync(join(root, "acquisition.json"), "utf8"));
const beforeMd = readFileSync(join(root, "fixtures/raw/content.before.md"), "utf8");
const afterMd = readFileSync(join(root, "fixtures/raw/content.after.md"), "utf8");
const beforeBatch = JSON.parse(readFileSync(join(root, "fixtures/held/before.json"), "utf8"));
const afterBatch = JSON.parse(readFileSync(join(root, "fixtures/held/after.json"), "utf8"));

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tmpOut(label) {
  mkdirSync(join(root, "tmp"), { recursive: true });
  return mkdtempSync(join(root, "tmp", `${label}-`));
}

test("stored raw fixtures match acquisition sha256 and bytes", () => {
  for (const [rel, digest] of Object.entries(acquisition.sha256)) {
    const path = join(root, rel);
    assert.equal(sha256(path), digest, rel);
    assert.equal(readFileSync(path).length, acquisition.bytes[rel], `${rel} bytes`);
  }
  assert.equal(acquisition.license, "CC-BY-4.0");
  assert.equal(acquisition.beforeSha, "ba98cc468032c95cb397b11895537b1c893ac63a");
  assert.equal(acquisition.afterSha, "be31ea3fc5ba9e0d1b96d300894145ca4f6af57c");
  assert.equal(acquisition.liveFetch, false);
});

test("markdown facts: title Content; after adds h2 Code Tabs", () => {
  const before = extractMarkdownFacts(beforeMd);
  const after = extractMarkdownFacts(afterMd);
  assert.equal(before.title, "Content");
  assert.equal(after.title, "Content");
  assert.deepEqual(before.headings.h1, ["Content"]);
  assert.equal(before.headings.h2.includes("Code Tabs"), false);
  assert.equal(after.headings.h2.includes("Code Tabs"), true);
  assert.deepEqual(
    after.headings.h2,
    [
      "Collections",
      "Frontmatter Schema",
      "Using Components in Content (MDX)",
      "Code Tabs",
      "API Reference",
      "Versioning",
      "Internal Links",
    ],
  );
  assert.notEqual(before.text, after.text);
  assert.match(after.text, /Code Tabs/);
  assert.equal(before.text.includes("Code Tabs"), false);
});

test("held batches are extract-batch.v0 with claims-relevant flags", () => {
  for (const batch of [beforeBatch, afterBatch]) {
    assert.equal(batch.ok, true);
    assert.equal(batch.product, "samedaydesk-extract-batch");
    assert.equal(batch.schemaVersion, "samedaydesk.extract-batch.v0");
    assert.equal(batch.charged, false);
    assert.equal(batch.sources[0].source, "held:expressjs/expressjs.com:docs/content.md");
    assert.equal(batch.sources[0].source.startsWith("http"), false);
  }
});

test("positive witness: Code Tabs added, title unchanged", () => {
  const w = witness(beforeBatch, afterBatch);
  assert.equal(w.unchanged.includes("title"), true);
  assert.equal(w.changed.includes("headings"), true);
  assert.equal(w.changed.includes("text"), true);
  assert.equal(w.added.includes("h2:Code Tabs"), true);
  assert.deepEqual(w.removed, []);
  assert.deepEqual(w.unknown, []);
  assert.match(w.fact, /Code Tabs/);
});

test("control witness: identical batches are unchanged", () => {
  const w = witness(beforeBatch, beforeBatch);
  assert.deepEqual(w.changed, []);
  assert.ok(w.unchanged.includes("title"));
  assert.ok(w.unchanged.includes("headings"));
  assert.ok(w.unchanged.includes("text"));
  assert.deepEqual(w.added, []);
  assert.deepEqual(w.unknown, []);
});

test("positive engine: held job verdict changed, claims.fresh false", () => {
  const outDir = tmpOut("positive");
  try {
    const r = runPageChangeJob({
      jobPath: join(root, "fixtures/held/job.json"),
      outDir,
    });
    assert.equal(r.status, 0, r.stderr || r.error);
    const body = r.stdoutJson;
    assert.equal(body?.ok, true);
    const report = body.report;
    assert.equal(report.verdict, "changed");
    assert.equal(report.claims.fresh, false);
    assert.equal(report.claims.usefulOutputProven, true);
    assert.equal(report.provenance.networkUsed, false);
    assert.equal(report.provenance.paymentAttempted, false);
    assert.equal(report.provenance.merchantCompareImported, false);
    assert.equal(report.kind, "merchant_extract_batch");
    const headingChange = report.changes.some(
      (c) => c.class === "semantic" && String(c.path || "").includes("headings"),
    );
    const textChange = report.changes.some(
      (c) => c.class === "semantic" && String(c.path || "").includes("text"),
    );
    assert.equal(headingChange, true);
    assert.equal(textChange, true);
    const w = witness(beforeBatch, afterBatch);
    assert.equal(w.added.includes("h2:Code Tabs"), true);
    assert.equal(report.verdict === "changed", w.changed.length > 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control engine: identical batches verdict unchanged", () => {
  const outDir = tmpOut("control");
  try {
    const r = runPageChangeJob({
      jobPath: join(root, "fixtures/held/job-control.json"),
      outDir,
    });
    assert.equal(r.status, 0, r.stderr || r.error);
    const report = r.stdoutJson?.report;
    assert.equal(report.verdict, "unchanged");
    assert.equal(report.claims.fresh, false);
    assert.equal(report.claims.noChangeProven, true);
    assert.equal(report.summary.semantic, 0);
    const w = witness(beforeBatch, beforeBatch);
    assert.equal(w.changed.length, 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: missing clock is refused", () => {
  const outDir = tmpOut("missing-clock");
  try {
    const r = runPageChangeJob({
      jobPath: join(root, "fixtures/negative/job-missing-clock.json"),
      outDir,
    });
    assert.equal(r.status, 2);
    const err = r.stderrJson || r.stdoutJson;
    assert.equal(err?.ok, false);
    assert.equal(err?.code, "clock_required");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: --example is sample_as_delivered_watch", () => {
  const outDir = tmpOut("example");
  try {
    const r = runPageChangeJob({
      extraArgs: ["--example"],
      outDir,
    });
    assert.equal(r.status, 2);
    const err = r.stderrJson || r.stdoutJson;
    assert.equal(err?.ok, false);
    assert.equal(err?.code, "sample_as_delivered_watch");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: live fetch URL is refused", () => {
  const outDir = tmpOut("live");
  try {
    const r = runPageChangeJob({
      extraArgs: [
        "compare",
        "--before",
        "https://expressjs.com/",
        "--after",
        join(root, "fixtures/held/after.json"),
        "--fields",
        "title,headings,text",
        "--clock",
        acquisition.clock,
      ],
      outDir,
    });
    assert.equal(r.status, 2);
    const err = r.stderrJson || r.stdoutJson;
    assert.equal(err?.ok, false);
    assert.equal(err?.code, "live_fetch_url");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("witness source does not import kit engine compare", () => {
  const src = readFileSync(join(root, "witness.mjs"), "utf8");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/engines\/page-change-offline-job\/lib\/compare/.test(src), false);
});

test("adapter does not network; kit CLI exists", () => {
  const src = readFileSync(join(root, "adapter.mjs"), "utf8");
  assert.match(src, /page-change-offline-job/);
  assert.match(src, /--max-old-space-size=768/);
  assert.equal(/https?:\/\//.test(src.replace(/KIT_SHA256[\s\S]*?\n/, "")), false);
});
