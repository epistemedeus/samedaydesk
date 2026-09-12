import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createRequire } from "node:module";
import {
  KIT_ARCHIVE_BYTES,
  KIT_ARCHIVE_SHA256,
  KIT_BIN,
  KIT_ROOT,
  runPageChange,
} from "../adapter.mjs";
import {
  PAGE_SOURCE,
  factsFromBatch,
  factsFromPageSource,
  witness,
} from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const fixtures = join(root, "fixtures");
const require = createRequire(import.meta.url);

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function sha256File(abs) {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

function tmpOut(label) {
  return mkdtempSync(join(tmpdir(), `p04-${label}-`));
}

test("kit pin and cold bin exist", () => {
  const archive = "/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz";
  assert.equal(statSync(archive).size, KIT_ARCHIVE_BYTES);
  assert.equal(sha256File(archive), KIT_ARCHIVE_SHA256);
  assert.equal(statSync(KIT_BIN).isFile(), true);
  const pkg = JSON.parse(readFileSync(join(KIT_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.version, "1.4.0");
});

test("witness does not import kit engines", () => {
  const src = readFileSync(join(root, "witness.mjs"), "utf8");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/engines\/page-change-offline-job/.test(src), false);
  assert.equal(/compare\.mjs/.test(src), false);
});

test("held wrappers match git-show title/description/headings and omit forbidden pages", () => {
  const beforeTsx = readFileSync(join(fixtures, "raw/UsefulJobs.before.tsx"), "utf8");
  const afterTsx = readFileSync(join(fixtures, "raw/UsefulJobs.after.tsx"), "utf8");
  const beforeExcerpt = readFileSync(join(fixtures, "raw/machineEntry.useful-jobs.before.excerpt.mjs"), "utf8");
  const afterExcerpt = readFileSync(join(fixtures, "raw/machineEntry.useful-jobs.after.excerpt.mjs"), "utf8");
  const fromBefore = factsFromPageSource(beforeTsx, beforeExcerpt);
  const fromAfter = factsFromPageSource(afterTsx, afterExcerpt);
  assert.equal(fromBefore.ok, true);
  assert.equal(fromAfter.ok, true);

  const beforeBatch = readJson("fixtures/held/before.json");
  const afterBatch = readJson("fixtures/held/after.json");
  const wrappedBefore = factsFromBatch(beforeBatch);
  const wrappedAfter = factsFromBatch(afterBatch);

  assert.equal(wrappedBefore.title, fromBefore.title);
  assert.equal(wrappedBefore.description, fromBefore.description);
  assert.deepEqual(wrappedBefore.headings, fromBefore.headings);
  assert.equal(wrappedAfter.title, fromAfter.title);
  assert.equal(wrappedAfter.description, fromAfter.description);
  assert.deepEqual(wrappedAfter.headings, fromAfter.headings);

  assert.equal(fromBefore.title, fromAfter.title);
  assert.notEqual(fromBefore.description, fromAfter.description);
  assert.notDeepEqual(fromBefore.headings, fromAfter.headings);
  assert.match(fromBefore.headings.h1[0], /Six local jobs/);
  assert.match(fromAfter.headings.h1[0], /Turn changing files/);
  assert.equal(beforeBatch.charged, false);
  assert.equal(afterBatch.charged, false);

  assert.equal(wrappedBefore.source, PAGE_SOURCE);
  assert.equal(wrappedAfter.source, PAGE_SOURCE);
  const names = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else names.push(name);
    }
  };
  walk(fixtures);
  assert.equal(names.includes("schema-validator.html"), false);
  assert.equal(names.includes("resources.html"), false);
  assert.equal(JSON.stringify(beforeBatch.sources[0].source).includes("/x402/verified"), false);
});

test("positive: official S260 → 1.4.0 overlay is changed; claims.fresh false", () => {
  const before = readJson("fixtures/held/before.json");
  const after = readJson("fixtures/held/after.json");
  const independent = witness(before, after, ["title", "description", "headings"]);
  assert.equal(independent.fact, "changed");
  assert.equal(independent.unchanged.some((row) => row.field === "title"), true);
  assert.equal(independent.changed.some((row) => row.field === "description"), true);
  assert.equal(independent.changed.some((row) => row.field === "headings"), true);
  assert.equal(independent.unknown.length, 0);

  const result = runPageChange({
    job: join(fixtures, "held/job.json"),
    outDir: tmpOut("positive"),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.report.verdict, "changed");
  assert.equal(result.report.claims.fresh, false);
  assert.equal(result.report.snapshot.claims.fresh, false);
  assert.equal(result.report.claims.paymentImpliesUsefulOutput, false);
  assert.equal(result.report.provenance.networkUsed, false);
  assert.equal(result.report.observations.before.charged, false);
  assert.equal(result.report.observations.after.charged, false);
  assert.equal(result.report.summary.semantic > 0, true);
  assert.equal(result.report.changes.some((c) => c.path === "/description"), true);
  assert.equal(result.report.changes.some((c) => String(c.path).startsWith("/headings")), true);
  assert.equal(result.report.changes.some((c) => c.path === "/title"), false);
  assert.ok(result.written.paths.jsonPath);
  assert.ok(result.written.paths.mdPath);
  assert.match(result.args.join(" "), /page-change-offline-job/);
  assert.equal(result.args.includes("--example"), false);
});

test("control: identical before=after is unchanged", () => {
  const before = readJson("fixtures/held/before.json");
  const independent = witness(before, before, ["title", "description", "headings"]);
  assert.equal(independent.fact, "unchanged");
  assert.equal(independent.changed.length, 0);
  assert.equal(independent.unchanged.length, 3);

  const result = runPageChange({
    job: join(fixtures, "control/job.json"),
    outDir: tmpOut("control"),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.report.verdict, "unchanged");
  assert.equal(result.report.claims.fresh, false);
  assert.equal(result.report.summary.semantic, 0);
  assert.equal(result.report.changes.length, 0);
});

test("negative: missing clock refuses clock_required", () => {
  const result = runPageChange({
    job: join(fixtures, "negative/missing-clock.job.json"),
    outDir: tmpOut("missing-clock"),
  });
  assert.equal(result.status, 2);
  assert.equal(result.ok, false);
  const payload = result.body || {};
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "clock_required");
});

test("negative: --example is sample_as_delivered_watch", () => {
  const result = runPageChange({
    job: join(fixtures, "held/job.json"),
    outDir: tmpOut("example"),
    extra: ["--example"],
  });
  assert.equal(result.status, 2);
  assert.equal(result.body?.code, "sample_as_delivered_watch");
});

test("negative: live URL before path is live_fetch_url", () => {
  const result = runPageChange({
    job: join(fixtures, "negative/live-url.job.json"),
    outDir: tmpOut("live-url"),
  });
  assert.equal(result.status, 2);
  assert.equal(result.body?.code, "live_fetch_url");
});

test("negative: raw TSX is not extract-batch (html-to-extract-batch non-equivalent)", () => {
  const tsx = readFileSync(join(fixtures, "raw/UsefulJobs.before.tsx"), "utf8");
  const independent = witness(tsx, tsx, ["title"]);
  assert.equal(independent.fact, "unknown");

  const result = runPageChange({
    job: join(fixtures, "negative/html-not-batch.job.json"),
    outDir: tmpOut("html"),
  });
  assert.equal(result.status, 2);
  assert.ok(
    result.body?.code === "unrecognized_batch_artifact" || result.body?.ok === false,
    JSON.stringify(result.body),
  );
});

test("owned-paths and acquisition pins match this exclusive dir", () => {
  const owned = readJson("owned-paths.json");
  const acquisition = readJson("acquisition.json");
  assert.equal(owned.ownedPath, "experiments/wave6/h6d-real-consumers/consumers/P04-sds-useful-jobs-page/");
  assert.equal(owned.receivingIntegrationOwner, "H6D-parent");
  assert.equal(owned.jobId, "page-change-offline-job");
  assert.equal(owned.migration.equivalent, false);
  assert.equal(acquisition.method, "local-git-show");
  assert.equal(acquisition.network, false);
  assert.equal(acquisition.beforeSha, "abeb54eca9a71abe117898e8fe7de7e55e9d917f");
  assert.equal(acquisition.afterSha, "ad9bc7b448cf1f635ff1488affbe206aaf981ac0");
  assert.equal(acquisition.claimsFresh, false);
  assert.equal(acquisition.charged, false);
  for (const [rel, meta] of Object.entries(acquisition.fixtures)) {
    const abs = join(root, rel);
    assert.equal(statSync(abs).size, meta.bytes, rel);
    assert.equal(sha256File(abs), meta.sha256, rel);
  }
});

test("adapter is not a kit-engine import and require() of engines is unused", () => {
  const src = readFileSync(join(root, "adapter.mjs"), "utf8");
  assert.equal(/from ["'].*engines\/page-change/.test(src), false);
  assert.doesNotThrow(() => require.resolve(KIT_BIN));
});
