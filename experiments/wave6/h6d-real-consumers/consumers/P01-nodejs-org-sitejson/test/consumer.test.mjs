import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { kitCli, readOutputJson, runPageChange } from "../adapter.mjs";
import { mapSiteToSelected } from "../map-site.mjs";
import { badgeFact, witness } from "../witness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADAPTER = join(ROOT, "adapter.mjs");
const WITNESS_SRC = readFileSync(join(ROOT, "witness.mjs"), "utf8");

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

const beforeSite = readJson("fixtures/official/site.before.json");
const afterSite = readJson("fixtures/official/site.after.json");
const beforeBatch = readJson("fixtures/batches/before.json");
const afterBatch = readJson("fixtures/batches/after.json");

test("witness.mjs does not import kit engine compare modules", () => {
  assert.equal(
    /useful-jobs-1\.4\.0\/engines\/|engines\/page-change-offline-job\/lib\/compare|engines\/lockfile-pin-delta\/lib\/compare|engines\/json-schema-webhook-drift\/lib\/compare/.test(WITNESS_SRC),
    false,
  );
});

test("official site.json pair is the security-release snapshot vs Next 10 survey badge", () => {
  assert.equal(beforeSite.title, "Node.js");
  assert.equal(afterSite.title, "Node.js");
  assert.equal(beforeSite.description, afterSite.description);
  assert.equal(beforeSite.websiteBanners.index.text, "July 2026 security releases are available");
  assert.equal(afterSite.websiteBanners.index.text, "July 2026 security releases are available");
  assert.equal(beforeSite.websiteBadges.index.title, "Discover");
  assert.equal(beforeSite.websiteBadges.index.text, "New migration guides");
  assert.equal(afterSite.websiteBadges.index.title, "Be Heard");
  assert.equal(afterSite.websiteBadges.index.text, "Take the Node.js User Survey 2026");
  const fact = badgeFact(beforeSite, afterSite);
  assert.equal(fact.changed, true);
});

test("held extract-batches wrap official bytes with required merchant fields and charged false", () => {
  for (const batch of [beforeBatch, afterBatch]) {
    assert.equal(batch.ok, true);
    assert.equal(batch.product, "samedaydesk-extract-batch");
    assert.equal(batch.schemaVersion, "samedaydesk.extract-batch.v0");
    assert.equal(batch.charged, false);
    assert.equal(batch.sources[0].source, "nodejs.org/apps/site/site.json");
    assert.equal(batch.sources[0].status, "success");
    assert.equal(batch.boundary.automaticRetries, false);
    assert.equal(batch.quote.amountAtomic, "0");
  }
  assert.deepEqual(beforeBatch.sources[0].data, mapSiteToSelected(beforeSite));
  assert.deepEqual(afterBatch.sources[0].data, mapSiteToSelected(afterSite));
  assert.equal(beforeBatch.sources[0].provenance.gitSha, "aad2540a476ff94fa8419dc3a0a5e37c413b2ee1");
  assert.equal(afterBatch.sources[0].provenance.gitSha, "71f7fdc56a1c9381abc5da60d991c089f8891893");
});

test("positive: engine and independent witness agree selected fields changed", () => {
  const outDir = tempDir("p01-pos-");
  try {
    const result = runPageChange({
      job: join(ROOT, "fixtures/jobs/positive.json"),
      outDir,
    });
    assert.equal(result.status, 0, result.stderr || result.message);
    assert.equal(result.ok, true);
    assert.equal(result.verdict, "changed");
    assert.equal(result.claims.fresh, false);
    assert.equal(result.claims.complete, true);
    assert.equal(result.claims.usefulOutputProven, true);
    assert.equal(result.claims.paymentImpliesUsefulOutput, false);
    assert.equal(result.networkUsed, false);
    assert.equal(result.report.provenance.networkUsed, false);
    assert.equal(result.report.provenance.merchantCompareImported, false);
    assert.equal(result.report.observations.before.charged, false);
    assert.equal(result.report.observations.after.charged, false);

    const w = witness(beforeBatch, afterBatch);
    assert.deepEqual(w.changed.slice().sort(), ["headings", "jsonLd", "text"]);
    assert.deepEqual(w.unchanged.slice().sort(), ["description", "title"]);
    assert.deepEqual(w.added, []);
    assert.deepEqual(w.removed, []);
    assert.deepEqual(w.unknown, []);
    assert.equal(result.report.summary.semantic, 3);
    const paths = result.report.changes.map((change) => change.path).sort();
    assert.deepEqual(paths, ["/headings/h2", "/jsonLd/hasPart", "/text"]);

    const written = readOutputJson(outDir);
    assert.equal(written.report.verdict, "changed");
    assert.equal(written.report.claims.fresh, false);
  } finally {
    cleanup(outDir);
  }
});

test("control: identical before/after batches are unchanged", () => {
  const outDir = tempDir("p01-ctl-");
  try {
    const result = runPageChange({
      job: join(ROOT, "fixtures/jobs/control.json"),
      outDir,
    });
    assert.equal(result.status, 0, result.stderr || result.message);
    assert.equal(result.verdict, "unchanged");
    assert.equal(result.claims.fresh, false);
    assert.equal(result.claims.noChangeProven, true);
    assert.equal(result.claims.complete, true);
    const w = witness(beforeBatch, beforeBatch);
    assert.deepEqual(w.changed, []);
    assert.deepEqual(w.unchanged.slice().sort(), ["description", "headings", "jsonLd", "text", "title"]);
    assert.equal(result.report.summary.semantic, 0);
  } finally {
    cleanup(outDir);
  }
});

test("negative: missing clock refuses clock_required", () => {
  const outDir = tempDir("p01-clk-");
  try {
    const result = runPageChange({
      job: join(ROOT, "fixtures/negative/missing-clock.json"),
      outDir,
    });
    assert.equal(result.status, 2);
    assert.equal(result.ok, false);
    assert.equal(result.code, "clock_required");
  } finally {
    cleanup(outDir);
  }
});

test("negative: live URL and --fetch refuse live_fetch_url", () => {
  const outDir = tempDir("p01-live-");
  try {
    const live = runPageChange({
      job: join(ROOT, "fixtures/negative/live-fetch-url.json"),
      outDir,
    });
    assert.equal(live.status, 2);
    assert.equal(live.code, "live_fetch_url");
    const fetchFlag = runPageChange({ extraArgs: ["--fetch"], outDir });
    assert.equal(fetchFlag.status, 2);
    assert.equal(fetchFlag.code, "live_fetch_url");
  } finally {
    cleanup(outDir);
  }
});

test("negative: --example is refused as sample_as_delivered_watch", () => {
  const outDir = tempDir("p01-ex-");
  try {
    const result = runPageChange({ extraArgs: ["--example"], outDir });
    assert.equal(result.status, 2);
    assert.equal(result.code, "sample_as_delivered_watch");
  } finally {
    cleanup(outDir);
  }
});

test("adapter CLI emits JSON and uses the extracted useful-jobs 1.4.0 binary", () => {
  assert.match(kitCli(), /vendor\/useful-jobs-1\.4\.0\/bin\/useful-jobs\.mjs$/);
  const outDir = tempDir("p01-cli-");
  try {
    const r = spawnSync(
      process.execPath,
      [ADAPTER, "--job", join(ROOT, "fixtures/jobs/positive.json"), "--out-dir", outDir],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.verdict, "changed");
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.claims.fresh, false);
  } finally {
    cleanup(outDir);
  }
});
