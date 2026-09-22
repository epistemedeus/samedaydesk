import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { discoverOffer } from "../src/discover.mjs";
import { parseDiscoveryDocument } from "../src/parse-offer.mjs";
import { PACKAGE_ID, SURFACES } from "../src/surfaces.mjs";
import { BIN, FIXTURES, REPO_ROOT, runDiscover, parseStdout } from "./helpers.mjs";

const EXPECTED_JOBS = [
  "lockfile-pin-delta",
  "json-schema-webhook-drift",
  "route-table-diff",
  "page-change-offline-job",
  "api-upgrade-brief",
  "vendor-budget-impact",
  "feed-agenda",
  "evidence-ci-annotation",
  "listing-repair-packet",
  "repeat-job-record",
];

test("committed maintained client discovers the useful-jobs offer", async () => {
  const result = await discoverOffer({ mode: "committed", repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, JSON.stringify(result.failure || result));
  assert.equal(result.client, "e4-maintained-runtime");
  assert.equal(result.mode, "committed");
  assert.equal(result.paid, false);
  assert.equal(result.newDiscoveryFramework, false);
  assert.equal(result.homepageRewrite, false);
  assert.equal(result.offer.package, PACKAGE_ID);
  assert.equal(result.offer.schema, "samedaydesk.for-agents.useful-jobs.v1");
  assert.equal(result.offer.version, "1.4.7");
  assert.equal(result.offer.page, SURFACES.page.url);
  assert.equal(result.offer.discoveryUrl, SURFACES.discovery.url);
  assert.deepEqual(result.offer.jobs, EXPECTED_JOBS);
  assert.equal(result.offer.jobs.length, 10);
  assert.equal(result.offer.archive.sha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(result.offer.archive.bytes, 5255824);
  assert.match(result.offer.archive.url, /useful-jobs-1\.4\.7\.tar\.gz$/);
  assert.equal(result.offer.purchaseAuthority, false);
  assert.equal(result.offer.paidHostedClaim, false);
  assert.equal(result.offer.firstOffer, "lockfile-pin-delta");
  assert.equal(result.catalog.firstOffer, "lockfile-pin-delta");
  assert.deepEqual(result.catalog.jobs, EXPECTED_JOBS);
  assert.equal(result.llms.pointerFound, true);
  assert.equal(result.surfaces.discovery.ok, true);
  assert.equal(result.surfaces.catalog.ok, true);
  assert.equal(result.surfaces.llms.ok, true);
});

test("CLI --committed exits 0 and prints the offer", () => {
  const proc = runDiscover(["--committed"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 0, proc.stderr);
  assert.equal(json.ok, true);
  assert.equal(json.offer.package, "useful-jobs");
  assert.equal(json.offer.jobs.length, 10);
  assert.equal(json.offer.version, "1.4.7");
});

test("committed discovery bytes match the maintained public file", async () => {
  const result = await discoverOffer({ mode: "committed", repoRoot: REPO_ROOT });
  const raw = readFileSync(join(REPO_ROOT, SURFACES.discovery.committedRel));
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(raw).digest("hex");
  assert.equal(result.surfaces.discovery.sha256, sha);
  assert.equal(result.surfaces.discovery.bytes, raw.length);
});

test("missing archive is an explicit failure, not success", async () => {
  const result = await discoverOffer({
    mode: "fixture",
    fixturePath: join(FIXTURES, "missing-archive.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "missing_archive");
});

test("wrong package is an explicit failure", async () => {
  const result = await discoverOffer({
    mode: "fixture",
    fixturePath: join(FIXTURES, "wrong-package.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "wrong_package");
  assert.match(result.failure.message, /useful-job-desk/);
});

test("document ok:false stays explicit_document_error", async () => {
  const result = await discoverOffer({
    mode: "fixture",
    fixturePath: join(FIXTURES, "explicit-error.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "explicit_document_error");
});

test("llms pointer helper rejects a file that omits /discovery/useful-jobs.json", async () => {
  const { parseLlmsPointer } = await import("../src/parse-offer.mjs");
  const llms = parseLlmsPointer("# SameDayDesk\n\nNo useful-jobs pointer here.\n");
  assert.equal(llms.ok, false);
  assert.equal(llms.failure.class, "llms_pointer_missing");
});

test("ok:true never appears without jobs", async () => {
  const empty = await discoverOffer({
    mode: "fixture",
    fixturePath: join(FIXTURES, "silent-empty-object.json"),
  });
  assert.equal(empty.ok, false);
  assert.ok(empty.failure.class);
  assert.equal(empty.offer, undefined);
});

test("pack is a consumer, not a new discovery framework", () => {
  const readme = readFileSync(join(REPO_ROOT, "packs/e4-maintained-runtime-discovery/README.md"), "utf8");
  assert.match(readme, /does \*\*not\*\* add a discovery framework/i);
  assert.match(readme, /\/discovery\/useful-jobs\.json/);
  assert.match(readme, /Homepage rewrite/);
  const notice = readFileSync(join(REPO_ROOT, "packs/e4-maintained-runtime-discovery/SOURCE-NOTICE.txt"), "utf8");
  assert.match(notice, /does not add a public discovery schema/i);
  assert.match(notice, /packs\/useful-job-desk/);
  const bin = readFileSync(BIN, "utf8");
  assert.doesNotMatch(bin, /packs\/useful-job-desk/);
});

test("HTTP 404 is http_error, not silent success", () => {
  const parsed = parseDiscoveryDocument("", { httpStatus: 404, source: "discovery" });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "http_error");
});
