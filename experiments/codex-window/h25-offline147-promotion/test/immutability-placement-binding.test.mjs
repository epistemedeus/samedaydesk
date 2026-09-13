import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  USEFUL_JOBS_ARCHIVE,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_COLD_START,
  USEFUL_JOBS_INSTALL,
  USEFUL_JOBS_JOB_IDS,
  USEFUL_JOBS_ROOT,
  USEFUL_JOBS_SOURCE_COMMIT,
  USEFUL_JOBS_ARCHIVE_FREEZE,
  USEFUL_JOBS_REVIEWED_SOURCE,
} from "../../../../client/src/data/machineEntry.mjs";
import KIT from "../../../../client/src/data/usefulJobsKit.json" with { type: "json" };
import {
  APPROVED_147,
  INHERITED,
  NEVER_PUBLISH,
  NEVER_RETCON,
  NEWLY_REVIEWED,
  PUBLISHED_IMMUTABLE,
} from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const publicDir = join(root, "client/public/for-agents/useful-jobs");
const kitDir = join(root, "client/public/kit");
const input147 = "/tmp/h25/inputs/useful-jobs-1.4.7.tar.gz";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function readArchive(dir, version) {
  return readFileSync(join(dir, `useful-jobs-${version}.tar.gz`));
}

test("published 1.0.0-1.4.0 public and kit copies stay byte-identical to seed", () => {
  for (const [version, meta] of Object.entries(PUBLISHED_IMMUTABLE)) {
    const pub = readArchive(publicDir, version);
    const kit = readArchive(kitDir, version);
    assert.equal(pub.length, meta.bytes, `public ${version} size`);
    assert.equal(kit.length, meta.bytes, `kit ${version} size`);
    assert.equal(sha256(pub), meta.sha256, `public ${version} sha256`);
    assert.equal(sha256(kit), meta.sha256, `kit ${version} sha256`);
    const pin = JSON.parse(readFileSync(join(publicDir, `useful-jobs-${version}.sha256.json`), "utf8"));
    assert.equal(pin.bytes, meta.bytes);
    assert.equal(pin.sha256, meta.sha256);
  }
});

test("1.4.7 public and kit copies match approved input bytes and sidecar", () => {
  const pub = readArchive(publicDir, "1.4.7");
  const kit = readArchive(kitDir, "1.4.7");
  assert.equal(pub.length, APPROVED_147.bytes);
  assert.equal(kit.length, APPROVED_147.bytes);
  assert.equal(sha256(pub), APPROVED_147.sha256);
  assert.equal(sha256(kit), APPROVED_147.sha256);
  assert.equal(Buffer.compare(pub, kit), 0);
  if (existsSync(input147)) {
    const input = readFileSync(input147);
    assert.equal(input.length, APPROVED_147.bytes);
    assert.equal(sha256(input), APPROVED_147.sha256);
    assert.equal(Buffer.compare(pub, input), 0);
  }
  for (const dir of [publicDir, kitDir]) {
    const pin = JSON.parse(readFileSync(join(dir, "useful-jobs-1.4.7.sha256.json"), "utf8"));
    assert.equal(pin.name, "useful-jobs-1.4.7");
    assert.equal(pin.archive, "useful-jobs-1.4.7.tar.gz");
    assert.equal(pin.bytes, APPROVED_147.bytes);
    assert.equal(pin.sha256, APPROVED_147.sha256);
    assert.equal(pin.sourceCommit, APPROVED_147.repairSource);
    assert.equal(pin.repairSource, APPROVED_147.repairSource);
    assert.equal(pin.purchaseAuthority, false);
    assert.equal(pin.previous.name, "useful-jobs-1.4.0");
    assert.deepEqual(
      pin.immutable.map((row) => row.name),
      ["useful-jobs-1.0.0", "useful-jobs-1.1.0", "useful-jobs-1.2.0", "useful-jobs-1.3.0", "useful-jobs-1.4.0"],
    );
  }
});

test("unpublished 1.4.1-1.4.6 are not public downloads", () => {
  const names = [...readdirSync(publicDir), ...readdirSync(kitDir)].join("\n");
  for (const version of NEVER_RETCON) {
    assert.equal(existsSync(join(publicDir, `useful-jobs-${version}.tar.gz`)), false, version);
    assert.equal(existsSync(join(kitDir, `useful-jobs-${version}.tar.gz`)), false, version);
    assert.doesNotMatch(names, new RegExp(`useful-jobs-${version.replaceAll(".", "\\.")}\\.tar\\.gz`));
  }
  for (const version of NEVER_PUBLISH) {
    assert.equal(existsSync(join(publicDir, `useful-jobs-${version}.tar.gz`)), false);
  }
});

test("kit, discovery, catalog, outcomes, and coldStart bind 1.4.7", () => {
  const discovery = JSON.parse(readFileSync(join(root, "client/public/discovery/useful-jobs.json"), "utf8"));
  const catalog = JSON.parse(readFileSync(join(publicDir, "catalog.json"), "utf8"));
  const outcomes = JSON.parse(readFileSync(join(publicDir, "jobs-outcomes.json"), "utf8"));

  assert.equal(KIT.version, "1.4.7");
  assert.equal(KIT.bytes, APPROVED_147.bytes);
  assert.equal(KIT.sha256, APPROVED_147.sha256);
  assert.equal(KIT.archive, APPROVED_147.archivePath);
  assert.equal(KIT.kitArchive, APPROVED_147.kitPath);
  assert.equal(KIT.rootName, APPROVED_147.rootName);
  assert.equal(KIT.sourceCommit, APPROVED_147.repairSource);
  assert.equal(KIT.archiveFreeze, APPROVED_147.repairSource);
  assert.equal(KIT.reviewedSource, APPROVED_147.repairSource);
  assert.equal(KIT.purchaseAuthority, false);
  assert.equal(KIT.paidHostedClaim, false);
  assert.equal(KIT.previous.version, "1.4.0");
  assert.deepEqual(
    KIT.immutableArchives.map((row) => row.version),
    ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"],
  );
  for (const version of NEVER_RETCON) {
    assert.equal(KIT.immutableArchives.some((row) => row.version === version), false);
  }

  assert.equal(USEFUL_JOBS_ARCHIVE, APPROVED_147.archivePath);
  assert.equal(USEFUL_JOBS_ARCHIVE_BYTES, APPROVED_147.bytes);
  assert.equal(USEFUL_JOBS_ARCHIVE_SHA256, APPROVED_147.sha256);
  assert.equal(USEFUL_JOBS_ROOT, APPROVED_147.rootName);
  assert.equal(USEFUL_JOBS_SOURCE_COMMIT, APPROVED_147.repairSource);
  assert.equal(USEFUL_JOBS_ARCHIVE_FREEZE, APPROVED_147.repairSource);
  assert.equal(USEFUL_JOBS_REVIEWED_SOURCE, APPROVED_147.repairSource);

  assert.equal(discovery.version, "1.4.7");
  assert.equal(discovery.bytes, APPROVED_147.bytes);
  assert.equal(discovery.sha256, APPROVED_147.sha256);
  assert.equal(discovery.archive.path, APPROVED_147.archivePath);
  assert.equal(discovery.archive.kitPath, APPROVED_147.kitPath);
  assert.equal(discovery.archive.url, `https://samedaydesk.com${APPROVED_147.archivePath}`);
  assert.equal(discovery.purchaseAuthority, false);
  assert.equal(discovery.paidHostedClaim, false);
  assert.equal(discovery.pins.sourceCommit, APPROVED_147.repairSource);
  assert.equal(discovery.coldStart, USEFUL_JOBS_COLD_START);
  assert.deepEqual(discovery.install, [...USEFUL_JOBS_INSTALL]);
  assert.match(discovery.coldStart, /bytes=5255824/);
  assert.match(discovery.coldStart, new RegExp(APPROVED_147.sha256));
  assert.match(discovery.coldStart, /useful-jobs-1\.4\.7\.tar\.gz/);
  assert.match(discovery.coldStart, /root="\$work\/useful-jobs-1\.4\.7"/);
  assert.match(discovery.coldStart, /\/for-agents\/useful-jobs\/useful-jobs-1\.4\.7\.tar\.gz/);
  assert.doesNotMatch(discovery.coldStart, /useful-jobs-1\.4\.0\.tar\.gz/);
  assert.doesNotMatch(JSON.stringify(discovery.pins), /817a00ca/);

  assert.equal(catalog.version, "1.4.7");
  assert.equal(outcomes.version, "1.4.7");
  assert.deepEqual(
    catalog.jobs.map((j) => j.id),
    [...USEFUL_JOBS_JOB_IDS],
  );
  assert.deepEqual(
    outcomes.jobs.map((j) => j.id),
    [...USEFUL_JOBS_JOB_IDS],
  );
  assert.deepEqual([...KIT.newlyReviewedJobIds], [...NEWLY_REVIEWED]);
  assert.deepEqual([...KIT.inheritedJobIds], [...INHERITED]);
  assert.deepEqual(discovery.releaseScope.newlyReviewedJobIds, [...NEWLY_REVIEWED]);
  assert.deepEqual(discovery.releaseScope.inheritedJobIds, [...INHERITED]);
  const union = new Set([...NEWLY_REVIEWED, ...INHERITED]);
  assert.equal(union.size, 10);
  for (const id of USEFUL_JOBS_JOB_IDS) assert.equal(union.has(id), true);
  const vendor = catalog.jobs.find((j) => j.id === "vendor-budget-impact");
  assert.match(vendor.summary, /Not a bill calculator or live quote/);
  assert.match(vendor.notes, /stable field identity/);
});
