#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapHeldExtractBatch, sha256Hex, SELECTED_FIELDS } from "./held-batch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = join(here, "fixtures/raw");
const heldDir = join(here, "fixtures/held");
const negativeDir = join(here, "fixtures/negative");
mkdirSync(heldDir, { recursive: true });
mkdirSync(negativeDir, { recursive: true });

const OBSERVED_AT = "2026-09-12T06:53:00.000Z";
const CLOCK = "2026-09-12T12:00:00.000Z";

const pins = {
  before: {
    gitSha: "ba98cc468032c95cb397b11895537b1c893ac63a",
    blobSha: "72310e75916f0a471f1f6cbb78ccb3e2ef346c50",
    file: "content.before.md",
  },
  after: {
    gitSha: "be31ea3fc5ba9e0d1b96d300894145ca4f6af57c",
    blobSha: "78ef7528842381e24fe92ede57391ba4bdb1f49e",
    file: "content.after.md",
  },
};

function loadMd(name) {
  const path = join(rawDir, name);
  const bytes = readFileSync(path);
  return {
    markdown: bytes.toString("utf8"),
    byteLength: bytes.length,
    sha256: sha256Hex(bytes),
  };
}

const beforeMd = loadMd(pins.before.file);
const afterMd = loadMd(pins.after.file);

const beforeBatch = wrapHeldExtractBatch({
  markdown: beforeMd.markdown,
  role: "before",
  gitSha: pins.before.gitSha,
  blobSha: pins.before.blobSha,
  byteLength: beforeMd.byteLength,
  sha256: beforeMd.sha256,
  observedAt: OBSERVED_AT,
});
const afterBatch = wrapHeldExtractBatch({
  markdown: afterMd.markdown,
  role: "after",
  gitSha: pins.after.gitSha,
  blobSha: pins.after.blobSha,
  byteLength: afterMd.byteLength,
  sha256: afterMd.sha256,
  observedAt: OBSERVED_AT,
});

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

writeJson(join(heldDir, "before.json"), beforeBatch);
writeJson(join(heldDir, "after.json"), afterBatch);

const job = {
  id: "p02-express-docs-codetabs",
  title: "Express docs content.md CodeTabs addition (held extract-batch)",
  clock: CLOCK,
  fields: [...SELECTED_FIELDS],
  before: "./before.json",
  after: "./after.json",
};
writeJson(join(heldDir, "job.json"), job);

const controlJob = {
  id: "p02-express-docs-control-identical",
  title: "Control: identical held extract-batch (before vs before)",
  clock: CLOCK,
  fields: [...SELECTED_FIELDS],
  before: "./before.json",
  after: "./before.json",
};
writeJson(join(heldDir, "job-control.json"), controlJob);

const missingClock = {
  id: "p02-express-docs-missing-clock",
  title: "Negative: held extract-batch without clock",
  fields: [...SELECTED_FIELDS],
  before: "../held/before.json",
  after: "../held/after.json",
};
writeJson(join(negativeDir, "job-missing-clock.json"), missingClock);

const quoteOnly = {
  ok: true,
  product: "samedaydesk-extract-batch",
  schemaVersion: "samedaydesk.extract-batch.v0",
  quote: {
    amountAtomic: "0",
    displayUsdc: "0.00",
    meaning: "Quote without sources is not page-change success.",
  },
};
writeJson(join(negativeDir, "quote-only.json"), quoteOnly);

const license = readFileSync(join(rawDir, "LICENSE.md"));
const acquisition = {
  schema: "h6d.consumer.acquisition.v1",
  repo: "expressjs/expressjs.com",
  owner: "expressjs",
  name: "expressjs.com",
  path: "docs/content.md",
  beforeSha: pins.before.gitSha,
  afterSha: pins.after.gitSha,
  beforeShort: pins.before.gitSha.slice(0, 12),
  afterShort: pins.after.gitSha.slice(0, 12),
  license: "CC-BY-4.0",
  licenseSpdx: "CC-BY-4.0",
  licenseFile: "LICENSE.md",
  licenseName: "Creative Commons Attribution 4.0 International",
  method: "github-contents-api+raw",
  retrievedAt: OBSERVED_AT,
  liveFetch: false,
  purchaseAuthority: false,
  clock: CLOCK,
  selectedFields: [...SELECTED_FIELDS],
  bytes: {
    "fixtures/raw/content.before.md": beforeMd.byteLength,
    "fixtures/raw/content.after.md": afterMd.byteLength,
    "fixtures/raw/LICENSE.md": license.length,
    "fixtures/raw/commit.before.json": statSync(join(rawDir, "commit.before.json")).size,
    "fixtures/raw/commit.after.json": statSync(join(rawDir, "commit.after.json")).size,
  },
  sha256: {
    "fixtures/raw/content.before.md": beforeMd.sha256,
    "fixtures/raw/content.after.md": afterMd.sha256,
    "fixtures/raw/LICENSE.md": sha256Hex(license),
    "fixtures/raw/commit.before.json": sha256Hex(readFileSync(join(rawDir, "commit.before.json"))),
    "fixtures/raw/commit.after.json": sha256Hex(readFileSync(join(rawDir, "commit.after.json"))),
  },
  gitBlobSha: {
    before: pins.before.blobSha,
    after: pins.after.blobSha,
  },
  urls: {
    beforeRaw: `https://raw.githubusercontent.com/expressjs/expressjs.com/${pins.before.gitSha}/docs/content.md`,
    afterRaw: `https://raw.githubusercontent.com/expressjs/expressjs.com/${pins.after.gitSha}/docs/content.md`,
    beforeCommit: `https://github.com/expressjs/expressjs.com/commit/${pins.before.gitSha}`,
    afterCommit: `https://github.com/expressjs/expressjs.com/commit/${pins.after.gitSha}`,
  },
};
writeJson(join(here, "acquisition.json"), acquisition);

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      beforeBytes: beforeMd.byteLength,
      afterBytes: afterMd.byteLength,
      beforeTitle: beforeBatch.sources[0].data.title,
      afterH2: afterBatch.sources[0].data.headings.h2,
    },
    null,
    2,
  ) + "\n",
);
