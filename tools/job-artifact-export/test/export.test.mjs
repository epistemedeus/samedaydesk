import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { exportJobArtifacts } from "../lib/export.mjs";
import { FILE_MAX_BYTES, HASH_TERMS_GOLDEN, isSha256Prefixed, prefixSha256, USEFUL_JOBS_ARCHIVE_SHA256 } from "../lib/pins.mjs";
import { hashTermsVersion, isTermsVersionHash } from "../lib/hash-terms.mjs";
import {
  copyFixture,
  payload,
  runExport,
  runFeedAgendaA,
  sha256Hex,
  tmp,
  unzipTo,
  writeOversize,
} from "./helpers.mjs";

const ARCHIVE = prefixSha256(USEFUL_JOBS_ARCHIVE_SHA256);
const CLOCK = "2026-09-11T20:00:00.000Z";

test("I01 hash-terms golden fixture matches Neo PR54 content hash", () => {
  const golden = JSON.parse(readFileSync(new URL("../fixtures/hash-terms/complete.terms.json", import.meta.url), "utf8"));
  assert.equal(golden.termsVersion, HASH_TERMS_GOLDEN);
  assert.equal(hashTermsVersion(golden), HASH_TERMS_GOLDEN);
  assert.equal(isTermsVersionHash(golden.termsVersion), true);
  assert.equal(isTermsVersionHash(1), false);
  assert.equal(isTermsVersionHash("1"), false);
  const withInteger = { ...golden, termsVersion: 1 };
  assert.equal(hashTermsVersion(withInteger), HASH_TERMS_GOLDEN);
});

test("local-runtime journey: feed-agenda samples/feed/a export unzip matching sha256", () => {
  const inDir = tmp("w4-feed-a-");
  const seeded = runFeedAgendaA(inDir);
  assert.equal(seeded.proc.status, 0, seeded.proc.stdout + seeded.proc.stderr);
  assert.equal(seeded.json.ok, true);
  assert.equal(seeded.json.appId, "feed-agenda");
  const originalJson = readFileSync(join(inDir, "agenda.json"));
  const originalIcs = readFileSync(join(inDir, "agenda.ics"));
  const outDir = tmp("w4-export-");
  const proc = runExport(["export", "--in-dir", inDir, "--out", outDir, "--clock", CLOCK]);
  const body = payload(proc);
  assert.equal(proc.status, 0, proc.stdout + proc.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.jobId, "feed-agenda");
  assert.equal(body.label, "SAMPLE");
  assert.equal(body.customerDelivery, false);
  assert.equal(body.notSettling, true);
  assert.equal(body.archiveSha256, ARCHIVE);
  assert.equal(isSha256Prefixed(body.enginePin), true);
  assert.equal(isSha256Prefixed(body.termsVersion), true);
  const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
  assert.equal(manifest.jobId, "feed-agenda");
  assert.equal(manifest.archiveSha256, ARCHIVE);
  assert.equal(manifest.label, "SAMPLE");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(typeof manifest.termsVersion, "string");
  assert.doesNotMatch(String(manifest.termsVersion), /^\d+$/);
  const jsonl = readFileSync(join(outDir, "files.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(jsonl.length, 2);
  const byPath = Object.fromEntries(jsonl.map((row) => [row.path, row]));
  assert.equal(byPath["agenda.json"].sha256, prefixSha256(sha256Hex(originalJson)));
  assert.equal(byPath["agenda.ics"].sha256, prefixSha256(sha256Hex(originalIcs)));
  assert.equal(byPath["agenda.json"].label, "SAMPLE");
  assert.equal(byPath["agenda.json"].enginePin, body.enginePin);
  const unzipped = tmp("w4-unzip-");
  const unzip = unzipTo(join(outDir, "job-artifacts.zip"), unzipped);
  assert.equal(unzip.status, 0, unzip.stderr);
  assert.equal(sha256Hex(readFileSync(join(unzipped, "agenda.json"))), sha256Hex(originalJson));
  assert.equal(sha256Hex(readFileSync(join(unzipped, "agenda.ics"))), sha256Hex(originalIcs));
  const zippedManifest = JSON.parse(readFileSync(join(unzipped, "manifest.json"), "utf8"));
  assert.equal(zippedManifest.jobId, "feed-agenda");
  assert.equal(zippedManifest.archiveSha256, ARCHIVE);
});

test("seeded failure: SAMPLE out-dir exported as customer-delivery", () => {
  const inDir = copyFixture("sample-out-dir");
  const proc = runExport(["export", "--in-dir", inDir, "--out", tmp("w4-cust-"), "--as", "customer-delivery"]);
  const body = payload(proc);
  assert.equal(proc.status, 2);
  assert.equal(body.ok, false);
  assert.equal(body.code, "sample-not-customer-delivery");
  assert.match(body.error, /SAMPLE as customer-delivery/);
});

test("seeded failure: local-runtime SAMPLE feed-agenda refuses customer-delivery", () => {
  const inDir = tmp("w4-feed-cust-");
  const seeded = runFeedAgendaA(inDir);
  assert.equal(seeded.json.ok, true);
  const proc = runExport(["export", "--in-dir", inDir, "--out", tmp("w4-cust2-"), "--as", "customer-delivery"]);
  const body = payload(proc);
  assert.equal(proc.status, 2);
  assert.equal(body.code, "sample-not-customer-delivery");
});

test("seeded failure: file over 8MiB cap", () => {
  const inDir = tmp("w4-oversize-");
  writeOversize(inDir);
  const proc = runExport(["export", "--in-dir", inDir, "--out", tmp("w4-over-out-")]);
  const body = payload(proc);
  assert.equal(proc.status, 2);
  assert.equal(body.code, "file-over-size-cap");
  assert.equal(body.detail.cap, FILE_MAX_BYTES);
  assert.equal(body.detail.bytes, FILE_MAX_BYTES + 1);
});

test("seeded failure: empty in-dir", () => {
  const inDir = tmp("w4-empty-");
  mkdirSync(inDir, { recursive: true });
  const proc = runExport(["export", "--in-dir", inDir, "--out", tmp("w4-empty-out-")]);
  const body = payload(proc);
  assert.equal(proc.status, 2);
  assert.equal(body.code, "empty-in-dir");
});

test("fixture sale label export is not customer-delivery and not SAMPLE", () => {
  const inDir = copyFixture("sale-out-dir");
  const outDir = tmp("w4-sale-");
  const proc = runExport(["export", "--in-dir", inDir, "--out", outDir, "--clock", CLOCK]);
  const body = payload(proc);
  assert.equal(proc.status, 0, proc.stdout);
  assert.equal(body.label, "sale");
  assert.equal(body.customerDelivery, false);
  assert.equal(body.notSettling, true);
  const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
  assert.equal(manifest.label, "sale");
  assert.equal(manifest.jobId, "feed-agenda");
  assert.equal(isSha256Prefixed(manifest.termsVersion), true);
});

test("integer termsVersion is refused (original F01 integer key is not a claim key)", () => {
  const inDir = copyFixture("sale-out-dir");
  assert.throws(
    () =>
      exportJobArtifacts({
        inDir,
        out: tmp("w4-int-"),
        termsVersion: 1,
        clock: CLOCK,
      }),
    (err) => err.code === "integer-terms-version",
  );
});

test("CLI help is public and export is the command", () => {
  const proc = runExport(["--help"]);
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /export --in-dir/);
  assert.match(proc.stdout, /Not result-reuse/);
});

test("missing in-dir refuses closed", () => {
  const proc = runExport(["export", "--out", tmp("w4-miss-")]);
  const body = payload(proc);
  assert.equal(proc.status, 2);
  assert.equal(body.code, "missing-required-inputs");
});

test("seeded failure: SAMPLE cannot be relabeled sale", () => {
  const proc = runExport([
    "export",
    "--in-dir",
    copyFixture("sample-out-dir"),
    "--out",
    tmp("w4-relabel-"),
    "--label",
    "sale",
  ]);
  const body = payload(proc);
  assert.equal(proc.status, 2);
  assert.equal(body.code, "sample-not-sale");
});
