import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeTitleFact } from "../lib/fields.mjs";
import { PACKAGE_ROOT } from "../lib/cli.mjs";

const CLOCK = "2026-09-12T06:00:00.000Z";
const bin = join(PACKAGE_ROOT, "bin/page-change.mjs");
const witness = join(PACKAGE_ROOT, "fixtures/semantic-witness");
const selected = "title,openGraph,links,text";

function spawnCompare(before, after, extra = []) {
  const outDir = mkdtempSync(join(tmpdir(), "pc-semantic-"));
  const result = spawnSync(process.execPath, [
    bin,
    "compare",
    "--before", before,
    "--after", after,
    "--fields", selected,
    "--clock", CLOCK,
    "--out-dir", outDir,
    ...extra,
  ], { cwd: PACKAGE_ROOT, encoding: "utf8" });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout ? JSON.parse(result.stdout) : null,
    outDir,
  };
}

function titleFrom(html) {
  return html.match(/<title>([^<]*)<\/title>/u)?.[1] ?? null;
}

function visibleTextFromWitness(html) {
  return html
    .replace(/<aside\s+hidden>.*?<\/aside>/gsu, " ")
    .replace(/<head>.*?<\/head>/gsu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function metadataFromWitness(html) {
  const metadata = Object.create(null);
  for (const [tag] of html.matchAll(/<meta\s+[^>]+>/gu)) {
    const attributes = Object.fromEntries(
      [...tag.matchAll(/(property|content)="([^"]*)"/gu)].map((match) => [match[1], match[2]]),
    );
    if (attributes.property && attributes.content) metadata[attributes.property] = attributes.content;
  }
  return metadata;
}

function assertExtractMatchesHtml(html, batch) {
  const data = batch.sources[0].data;
  const metadata = metadataFromWitness(html);
  assert.equal(data.title, titleFrom(html));
  assert.equal(data.text, visibleTextFromWitness(html));
  assert.equal(data.openGraph["product:price:amount"], Number(metadata["product:price:amount"]));
  assert.equal(data.openGraph["product:price:currency"], metadata["product:price:currency"]);
  assert.equal(data.openGraph["product:availability"], metadata["product:availability"]);
  assert.equal(data.links[0].href, html.match(/<a\s+href="([^"]+)"/u)?.[1]);
}

test("independent HTML witness separates hidden counter noise from business changes", () => {
  const beforeHtml = readFileSync(join(witness, "before.html"), "utf8");
  const noiseHtml = readFileSync(join(witness, "after-noise.html"), "utf8");
  const businessHtml = readFileSync(join(witness, "after-business.html"), "utf8");
  const beforeBatch = JSON.parse(readFileSync(join(witness, "before.json"), "utf8"));
  const noiseBatch = JSON.parse(readFileSync(join(witness, "after-noise.json"), "utf8"));
  const businessBatch = JSON.parse(readFileSync(join(witness, "after-business.json"), "utf8"));

  assert.notEqual(beforeHtml.match(/visitor counter (\d+)/u)?.[1], noiseHtml.match(/visitor counter (\d+)/u)?.[1]);
  assert.equal(visibleTextFromWitness(beforeHtml), visibleTextFromWitness(noiseHtml));
  assert.notEqual(visibleTextFromWitness(beforeHtml), visibleTextFromWitness(businessHtml));
  assert.equal(normalizeTitleFact(titleFrom(beforeHtml)), normalizeTitleFact(titleFrom(noiseHtml)));
  assert.notEqual(normalizeTitleFact(titleFrom(beforeHtml)), normalizeTitleFact(titleFrom(businessHtml)));
  assert.match(businessHtml, /\$24\.99/u);
  assert.match(businessHtml, /out_of_stock/u);
  assert.match(businessHtml, /href="\/terms\?v=2"/u);
  assertExtractMatchesHtml(beforeHtml, beforeBatch);
  assertExtractMatchesHtml(noiseHtml, noiseBatch);
  assertExtractMatchesHtml(businessHtml, businessBatch);
  assert.doesNotMatch(noiseBatch.sources[0].data.text, /visitor counter/u);
});

test("CLI: Unicode-equivalent title and reordered fractional metadata are unchanged", () => {
  const result = spawnCompare(join(witness, "before.json"), join(witness, "after-noise.json"));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.report.verdict, "unchanged");
  assert.equal(result.stdout.report.summary.semantic, 0);
  assert.equal(result.stdout.report.claims.complete, true);
  assert.equal(JSON.parse(readFileSync(join(result.outDir, "page-change.json"), "utf8")).report.verdict, "unchanged");
});

test("CLI: changed fractional price, availability, terms link, title, and text survive normalization", () => {
  const result = spawnCompare(join(witness, "before.json"), join(witness, "after-business.json"));
  assert.equal(result.status, 0, result.stderr);
  const report = result.stdout.report;
  assert.equal(report.verdict, "changed");
  assert.equal(report.claims.complete, true);
  assert.ok(report.changes.some((change) => change.path === "/openGraph/product:price:amount" && change.before === "19.99" && change.after === "24.99"));
  assert.ok(report.changes.some((change) => change.path === "/openGraph/product:availability" && change.after === "out_of_stock"));
  assert.ok(report.changes.some((change) => change.path === "/links" && change.after.includes("/terms?v=2")));
  assert.ok(report.changes.some((change) => change.path === "/title" && change.after.includes("$24.99")));
  assert.ok(report.changes.some((change) => change.path === "/text" && change.after.includes("Out of stock")));
});

test("CLI: removed nested metadata is a removal, not invented null content", () => {
  const work = mkdtempSync(join(tmpdir(), "pc-attribute-remove-"));
  const after = JSON.parse(readFileSync(join(witness, "after-noise.json"), "utf8"));
  delete after.sources[0].data.openGraph["product:availability"];
  const afterPath = join(work, "after.json");
  writeFileSync(afterPath, `${JSON.stringify(after)}\n`);

  const result = spawnCompare(join(witness, "before.json"), afterPath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.report.verdict, "changed");
  const removal = result.stdout.report.changes.find((change) => change.path === "/openGraph/product:availability");
  assert.equal(removal?.op, "remove");
  assert.equal(removal?.before, "in_stock");
  assert.equal(Object.hasOwn(removal, "after"), false);
});

test("CLI: an explicitly partial batch cannot become a complete unchanged claim", () => {
  const work = mkdtempSync(join(tmpdir(), "pc-partial-"));
  const after = JSON.parse(readFileSync(join(witness, "after-noise.json"), "utf8"));
  after.partial = true;
  after.ok = false;
  after.jobStatus = "completed_with_unknown";
  const afterPath = join(work, "after.json");
  writeFileSync(afterPath, `${JSON.stringify(after)}\n`);

  const result = spawnCompare(join(witness, "before.json"), afterPath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.report.verdict, "incomplete");
  assert.equal(result.stdout.report.claims.complete, false);
  assert.equal(result.stdout.report.claims.noChangeProven, false);
  assert.ok(result.stdout.report.coverageUnknown.some((item) => item.side === "after" && item.code === "merchant_batch_partial"));
  assert.ok(result.stdout.report.coverageUnknown.some((item) => item.side === "after" && item.code === "merchant_batch_not_ok"));
});

test("CLI: every compared after-row must satisfy the observation horizon", () => {
  const work = mkdtempSync(join(tmpdir(), "pc-row-age-"));
  const before = JSON.parse(readFileSync(join(witness, "before.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(witness, "after-noise.json"), "utf8"));
  before.sources.push({ ...structuredClone(before.sources[0]), id: "plan-2", source: "https://plans.example/team" });
  after.sources[0].provenance.completedAt = "2026-09-01T00:00:00.000Z";
  after.sources.push({ ...structuredClone(after.sources[0]), id: "plan-2", source: "https://plans.example/team" });
  after.sources[1].provenance.completedAt = "2026-09-12T05:59:30.000Z";
  const beforePath = join(work, "before.json");
  const afterPath = join(work, "after.json");
  writeFileSync(beforePath, `${JSON.stringify(before)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(after)}\n`);

  const result = spawnCompare(beforePath, afterPath, ["--max-stale-ms", "3600000"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.report.verdict, "unchanged");
  assert.equal(result.stdout.report.freshness, "stale");
  assert.equal(result.stdout.report.claims.current, false);
  assert.equal(result.stdout.report.snapshot.after.observedAt, "2026-09-12T05:59:30.000Z");

  delete after.sources[0].provenance.completedAt;
  writeFileSync(afterPath, `${JSON.stringify(after)}\n`);
  const missing = spawnCompare(beforePath, afterPath, ["--max-stale-ms", "3600000"]);
  assert.equal(missing.status, 0, missing.stderr);
  assert.equal(missing.stdout.report.verdict, "unchanged");
  assert.equal(missing.stdout.report.freshness, "unknown");
  assert.equal(missing.stdout.report.claims.current, false);
});

test("CLI: impossible UTC calendar clock is refused", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pc-bad-clock-"));
  const result = spawnSync(process.execPath, [
    bin,
    "compare",
    "--before", join(witness, "before.json"),
    "--after", join(witness, "after-noise.json"),
    "--fields", selected,
    "--clock", "2026-02-30T06:00:00.000Z",
    "--out-dir", outDir,
  ], { cwd: PACKAGE_ROOT, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).code, "clock_required");
});
