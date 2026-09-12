#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLOCK, SELECTED_FIELDS, jobDocument, wrapExtractBatch } from "./map-site.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GITHUB = join(ROOT, "fixtures/github");
const OFFICIAL = join(ROOT, "fixtures/official");
const PROV = join(ROOT, "fixtures/provenance");
const BATCHES = join(ROOT, "fixtures/batches");
const JOBS = join(ROOT, "fixtures/jobs");
const NEG = join(ROOT, "fixtures/negative");

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function trimCommit(raw) {
  const files = Array.isArray(raw.files)
    ? raw.files
      .filter((file) => file.filename === "apps/site/site.json")
      .map((file) => ({
        filename: file.filename,
        sha: file.sha,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        blob_url: file.blob_url,
        raw_url: file.raw_url,
        patch: file.patch,
      }))
    : [];
  return {
    sha: raw.sha,
    html_url: raw.html_url,
    commit: {
      message: raw.commit?.message ?? null,
      author: raw.commit?.author ?? null,
      committer: raw.commit?.committer ?? null,
    },
    stats: raw.stats ?? null,
    files,
  };
}

function trimContents(raw) {
  return {
    name: raw.name,
    path: raw.path,
    sha: raw.sha,
    size: raw.size,
    html_url: raw.html_url,
    git_url: raw.git_url,
    download_url: raw.download_url,
    type: raw.type,
    encoding: "omitted-stored-decoded",
  };
}

function observedAt(commit) {
  const raw = commit.commit?.committer?.date || commit.commit?.author?.date;
  if (typeof raw === "string" && raw.endsWith("Z") && !raw.includes(".")) {
    return raw.replace("Z", ".000Z");
  }
  return raw;
}

mkdirSync(OFFICIAL, { recursive: true });
mkdirSync(PROV, { recursive: true });
mkdirSync(BATCHES, { recursive: true });
mkdirSync(JOBS, { recursive: true });
mkdirSync(NEG, { recursive: true });

copyFileSync(join(GITHUB, "site.before.json"), join(OFFICIAL, "site.before.json"));
copyFileSync(join(GITHUB, "site.after.json"), join(OFFICIAL, "site.after.json"));

const licenseApi = JSON.parse(readFileSync(join(GITHUB, "license-api.json"), "utf8"));
const licenseBytes = Buffer.from(licenseApi.content.replace(/\n/g, ""), "base64");
writeFileSync(join(OFFICIAL, "LICENSE"), licenseBytes);

const commitBefore = JSON.parse(readFileSync(join(GITHUB, "commit.before.json"), "utf8"));
const commitAfter = JSON.parse(readFileSync(join(GITHUB, "commit.after.json"), "utf8"));
const contentsBefore = JSON.parse(readFileSync(join(GITHUB, "contents.before.json"), "utf8"));
const contentsAfter = JSON.parse(readFileSync(join(GITHUB, "contents.after.json"), "utf8"));

writeJson(join(PROV, "commit.before.json"), trimCommit(commitBefore));
writeJson(join(PROV, "commit.after.json"), trimCommit(commitAfter));
writeJson(join(PROV, "contents.before.json"), trimContents(contentsBefore));
writeJson(join(PROV, "contents.after.json"), trimContents(contentsAfter));
writeJson(join(PROV, "license.json"), {
  name: licenseApi.name,
  path: licenseApi.path,
  sha: licenseApi.sha,
  size: licenseApi.size,
  html_url: licenseApi.html_url,
  license: licenseApi.license,
});

const siteBeforeBytes = readFileSync(join(OFFICIAL, "site.before.json"));
const siteAfterBytes = readFileSync(join(OFFICIAL, "site.after.json"));
const siteBefore = JSON.parse(siteBeforeBytes.toString("utf8"));
const siteAfter = JSON.parse(siteAfterBytes.toString("utf8"));

const decodedBefore = Buffer.from(contentsBefore.content.replace(/\n/g, ""), "base64");
const decodedAfter = Buffer.from(contentsAfter.content.replace(/\n/g, ""), "base64");
if (!decodedBefore.equals(siteBeforeBytes) || !decodedAfter.equals(siteAfterBytes)) {
  throw new Error("raw site.json does not match GitHub contents API payload");
}

const beforeMeta = {
  gitSha: commitBefore.sha,
  blobSha: contentsBefore.sha,
  byteLength: siteBeforeBytes.length,
  sha256: sha256Bytes(siteBeforeBytes),
  observedAt: observedAt(commitBefore),
};
const afterMeta = {
  gitSha: commitAfter.sha,
  blobSha: contentsAfter.sha,
  byteLength: siteAfterBytes.length,
  sha256: sha256Bytes(siteAfterBytes),
  observedAt: observedAt(commitAfter),
};

const beforeBatch = wrapExtractBatch({
  site: siteBefore,
  jobId: `held-nodejs-org-sitejson-${beforeMeta.gitSha.slice(0, 12)}`,
  observedAt: beforeMeta.observedAt,
  gitSha: beforeMeta.gitSha,
  blobSha: beforeMeta.blobSha,
  byteLength: beforeMeta.byteLength,
  sha256: beforeMeta.sha256,
});
const afterBatch = wrapExtractBatch({
  site: siteAfter,
  jobId: `held-nodejs-org-sitejson-${afterMeta.gitSha.slice(0, 12)}`,
  observedAt: afterMeta.observedAt,
  gitSha: afterMeta.gitSha,
  blobSha: afterMeta.blobSha,
  byteLength: afterMeta.byteLength,
  sha256: afterMeta.sha256,
});

writeJson(join(BATCHES, "before.json"), beforeBatch);
writeJson(join(BATCHES, "after.json"), afterBatch);

writeJson(
  join(JOBS, "positive.json"),
  jobDocument({
    id: "p01-nodejs-org-sitejson-positive",
    title: "Node.js site.json security-release banner vs Next 10 survey badge",
    before: "../batches/before.json",
    after: "../batches/after.json",
  }),
);
writeJson(
  join(JOBS, "control.json"),
  jobDocument({
    id: "p01-nodejs-org-sitejson-control",
    title: "Identical before/after held batches",
    before: "../batches/before.json",
    after: "../batches/before.json",
  }),
);
writeJson(join(NEG, "missing-clock.json"), {
  id: "p01-nodejs-org-sitejson-missing-clock",
  title: "Missing clock must refuse",
  fields: [...SELECTED_FIELDS],
  before: "../batches/before.json",
  after: "../batches/after.json",
});
writeJson(join(NEG, "live-fetch-url.json"), {
  id: "p01-nodejs-org-sitejson-live-url",
  title: "Live URL must refuse",
  clock: CLOCK,
  fields: [...SELECTED_FIELDS],
  before: "https://nodejs.org/",
  after: "../batches/after.json",
});

const hashes = {
  "fixtures/official/site.before.json": {
    bytes: siteBeforeBytes.length,
    sha256: beforeMeta.sha256,
    gitBlobSha: beforeMeta.blobSha,
  },
  "fixtures/official/site.after.json": {
    bytes: siteAfterBytes.length,
    sha256: afterMeta.sha256,
    gitBlobSha: afterMeta.blobSha,
  },
  "fixtures/official/LICENSE": {
    bytes: licenseBytes.length,
    sha256: sha256Bytes(licenseBytes),
    gitBlobSha: licenseApi.sha,
  },
  "fixtures/batches/before.json": {
    bytes: readFileSync(join(BATCHES, "before.json")).length,
    sha256: sha256Bytes(readFileSync(join(BATCHES, "before.json"))),
  },
  "fixtures/batches/after.json": {
    bytes: readFileSync(join(BATCHES, "after.json")).length,
    sha256: sha256Bytes(readFileSync(join(BATCHES, "after.json"))),
  },
};
writeJson(join(PROV, "fixture-hashes.json"), hashes);

rmSync(GITHUB, { recursive: true, force: true });

process.stdout.write(`${JSON.stringify({
  beforeSha: beforeMeta.gitSha,
  afterSha: afterMeta.gitSha,
  beforeObservedAt: beforeMeta.observedAt,
  afterObservedAt: afterMeta.observedAt,
  hashes,
}, null, 2)}\n`);
