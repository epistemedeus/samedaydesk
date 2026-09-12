#!/usr/bin/env node
/**
 * Copy bounded official bytes from fixtures/_acquire and wrap held extract-batches.
 * Does not fetch. Re-run only after local acquire files exist.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL, sha256Hex, wrapHeldBatch } from "../wrap-extract-batch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const acquire = join(root, "fixtures/_acquire");
const official = join(root, "fixtures/official");
const held = join(root, "fixtures/held");
const jobs = join(root, "fixtures/jobs");
const negative = join(root, "fixtures/negative");

function sha256File(path) {
  return sha256Hex(readFileSync(path));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function slimCommit(rawPath, shaExpected) {
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  if (raw.sha !== shaExpected) {
    throw new Error(`commit sha ${raw.sha} != ${shaExpected}`);
  }
  return {
    sha: raw.sha,
    html_url: raw.html_url,
    commit: {
      message: raw.commit?.message ?? null,
      author: {
        name: raw.commit?.author?.name ?? null,
        date: raw.commit?.author?.date ?? null,
      },
      committer: {
        name: raw.commit?.committer?.name ?? null,
        date: raw.commit?.committer?.date ?? null,
      },
    },
    filesOmitted: true,
    note: "files[] omitted; publisher builds touch hundreds of generated licenses",
  };
}

function slimContents(rawPath) {
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  return {
    name: raw.name,
    path: raw.path,
    sha: raw.sha,
    size: raw.size,
    html_url: raw.html_url,
    git_url: raw.git_url,
    download_url: raw.download_url,
    type: raw.type,
    encodingOmitted: true,
    contentOmitted: true,
  };
}

if (!existsSync(join(acquire, "MIT.html.before"))) {
  throw new Error("missing fixtures/_acquire/MIT.html.before; acquire first");
}

mkdirSync(official, { recursive: true });
mkdirSync(held, { recursive: true });
mkdirSync(jobs, { recursive: true });
mkdirSync(negative, { recursive: true });

const htmlBefore = readFileSync(join(acquire, "MIT.html.before"));
const htmlAfter = readFileSync(join(acquire, "MIT.html.after"));
const jsonldBefore = readFileSync(join(acquire, "MIT.jsonld.before"));
const jsonldAfter = readFileSync(join(acquire, "MIT.jsonld.after"));

writeFileSync(join(official, "html.MIT.f75839ee25cd.html"), htmlBefore);
writeFileSync(join(official, "html.MIT.7e10095e0c90.html"), htmlAfter);
writeFileSync(join(official, "jsonld.MIT.f75839ee25cd.jsonld"), jsonldBefore);
writeFileSync(join(official, "jsonld.MIT.7e10095e0c90.jsonld"), jsonldAfter);
writeFileSync(join(official, "README.md"), readFileSync(join(acquire, "README.md")));

writeJson(join(official, "commit.before.json"), slimCommit(join(acquire, "commit-before.json"), OFFICIAL.beforeSha));
writeJson(join(official, "commit.after.json"), slimCommit(join(acquire, "commit-after.json"), OFFICIAL.afterSha));
writeJson(join(official, "contents.html.before.json"), slimContents(join(acquire, "contents.html.before.json")));
writeJson(join(official, "contents.html.after.json"), slimContents(join(acquire, "contents.html.after.json")));
writeJson(join(official, "contents.jsonld.before.json"), slimContents(join(acquire, "contents.jsonld.before.json")));
writeJson(join(official, "contents.jsonld.after.json"), slimContents(join(acquire, "contents.jsonld.after.json")));

const notice = `# NOTICE — SPDX license-list-data (P03 held snapshot)

Source: https://github.com/spdx/license-list-data
Official pair: html/MIT.html + jsonld/MIT.jsonld
SHAs: ${OFFICIAL.beforeSha} (2024-12-19) → ${OFFICIAL.afterSha} (2026-04-10)

The GitHub repository has no LICENSE file (license API 404 / SPDX NOASSERTION).
license-list-data README states generated data comes from license-list-XML and
LicenseListPublisher; see those repositories for licensing information.

accessingLicenses.md in this repository records the tech-report license as:

  Creative Commons Attribution 3.0 (SPDX License ID CC-BY-3.0)
  https://creativecommons.org/licenses/by/3.0/legalcode

Attribution: SPDX Workgroup, a Linux Foundation Project; License List
publisher maintained by Gary O'Neall. Held copies were retrieved from GitHub
raw/API for offline comparison. This consumer does not claim SPDX endorsement.

The MIT license *text* remains the MIT License (the listed license). Wrapping
it into samedaydesk.extract-batch.v0 does not change those terms.

HTML snippets in html/ are not complete HTML documents (README: "not complete
and valid HTML files, but simply HTML snippets for the license text").
`;
writeFileSync(join(official, "NOTICE.md"), notice);

const htmlBeforeMeta = JSON.parse(readFileSync(join(official, "contents.html.before.json"), "utf8"));
const htmlAfterMeta = JSON.parse(readFileSync(join(official, "contents.html.after.json"), "utf8"));
const jsonldBeforeMeta = JSON.parse(readFileSync(join(official, "contents.jsonld.before.json"), "utf8"));
const jsonldAfterMeta = JSON.parse(readFileSync(join(official, "contents.jsonld.after.json"), "utf8"));

const beforeBatch = wrapHeldBatch({
  html: htmlBefore.toString("utf8"),
  jsonld: JSON.parse(jsonldBefore.toString("utf8")),
  gitSha: OFFICIAL.beforeSha,
  blobSha: { html: htmlBeforeMeta.sha, jsonld: jsonldBeforeMeta.sha },
  htmlSha256: sha256Hex(htmlBefore),
  jsonldSha256: sha256Hex(jsonldBefore),
  htmlBytes: htmlBefore.length,
  jsonldBytes: jsonldBefore.length,
  observedAt: "2024-12-19T09:39:35.000Z",
  side: "before",
});
const afterBatch = wrapHeldBatch({
  html: htmlAfter.toString("utf8"),
  jsonld: JSON.parse(jsonldAfter.toString("utf8")),
  gitSha: OFFICIAL.afterSha,
  blobSha: { html: htmlAfterMeta.sha, jsonld: jsonldAfterMeta.sha },
  htmlSha256: sha256Hex(htmlAfter),
  jsonldSha256: sha256Hex(jsonldAfter),
  htmlBytes: htmlAfter.length,
  jsonldBytes: jsonldAfter.length,
  observedAt: "2026-04-10T14:35:52.000Z",
  side: "after",
});

writeJson(join(held, "before.json"), beforeBatch);
writeJson(join(held, "after.json"), afterBatch);

writeJson(join(jobs, "positive.json"), {
  id: "P03-spdx-mit-html-positive",
  title: "SPDX MIT html/jsonld publisher pair 2024-12-19 → 2026-04-10",
  clock: "2026-09-12T12:00:00.000Z",
  fields: ["title", "headings", "text", "jsonLd"],
  before: "../held/before.json",
  after: "../held/after.json",
  notes: [
    "Held extract-batch. Not a live fetch. HTML is not extract-batch.",
    "claims.fresh must stay false. charged false.",
  ],
});

writeJson(join(jobs, "control-identical.json"), {
  id: "P03-spdx-mit-html-control-identical",
  title: "Control: identical before/after held MIT extract-batch",
  clock: "2026-09-12T12:00:00.000Z",
  fields: ["title", "headings", "text", "jsonLd"],
  before: "../held/before.json",
  after: "../held/before.json",
});

writeJson(join(jobs, "control-title-headings.json"), {
  id: "P03-spdx-mit-html-control-title-headings",
  title: "Control: title/headings unchanged across publisher builds",
  clock: "2026-09-12T12:00:00.000Z",
  fields: ["title", "headings"],
  before: "../held/before.json",
  after: "../held/after.json",
  notes: ["Generator noise (CrossRef timestamps) is not a selected field. Title/headings stay MIT License."],
});

writeJson(join(jobs, "missing-clock.json"), {
  id: "P03-spdx-mit-html-missing-clock",
  title: "Negative: missing clock",
  fields: ["title", "headings", "text", "jsonLd"],
  before: "../held/before.json",
  after: "../held/after.json",
});

writeJson(join(negative, "quote-only.json"), {
  ok: true,
  product: "samedaydesk-extract-batch",
  schemaVersion: "samedaydesk.extract-batch.v0",
  quote: {
    amountAtomic: "0",
    displayUsdc: "0.00",
    meaning: "Quote is not page-change success.",
  },
  jobId: "quote-not-success",
  jobStatus: "quoted",
  stopReason: null,
  partial: false,
  accounting: { requests: 0, bytes: 0, wallMs: 0, retries: 0, succeeded: 0, partial: 0, failed: 0, unknown: 0, skippedDuplicate: 0 },
  costInputs: { admittedBodyBytes: 0, requests: 0, wallMs: 0, hostingCosts: "none", modelCosts: "none", monetaryMargin: null, note: "quote only" },
  charged: false,
  boundary: {
    guaranteedUrlSuccess: false,
    introductoryPrice: false,
    sourceFetchBeforeAuthorization: false,
    automaticRetries: false,
  },
});

writeJson(join(jobs, "quote-as-success.json"), {
  id: "P03-spdx-mit-html-quote-as-success",
  title: "Negative: quote-as-success",
  clock: "2026-09-12T12:00:00.000Z",
  fields: ["title"],
  before: "../negative/quote-only.json",
  after: "../held/after.json",
});

writeJson(join(jobs, "live-url.json"), {
  id: "P03-spdx-mit-html-live-url",
  title: "Negative: live URL path",
  clock: "2026-09-12T12:00:00.000Z",
  fields: ["title"],
  before: "https://spdx.org/licenses/MIT.html",
  after: "../held/after.json",
});

const files = [
  "fixtures/official/html.MIT.f75839ee25cd.html",
  "fixtures/official/html.MIT.7e10095e0c90.html",
  "fixtures/official/jsonld.MIT.f75839ee25cd.jsonld",
  "fixtures/official/jsonld.MIT.7e10095e0c90.jsonld",
  "fixtures/official/README.md",
  "fixtures/official/NOTICE.md",
  "fixtures/official/commit.before.json",
  "fixtures/official/commit.after.json",
  "fixtures/official/contents.html.before.json",
  "fixtures/official/contents.html.after.json",
  "fixtures/official/contents.jsonld.before.json",
  "fixtures/official/contents.jsonld.after.json",
  "fixtures/held/before.json",
  "fixtures/held/after.json",
];
for (const rel of files) {
  const abs = join(root, rel);
  const buf = readFileSync(abs);
  process.stdout.write(`${rel}\t${buf.length}\t${createHash("sha256").update(buf).digest("hex")}\n`);
}

const dataBefore = beforeBatch.sources[0].data;
const dataAfter = afterBatch.sources[0].data;
process.stdout.write(`title equal ${dataBefore.title === dataAfter.title} (${JSON.stringify(dataBefore.title)})\n`);
process.stdout.write(`headings equal ${JSON.stringify(dataBefore.headings) === JSON.stringify(dataAfter.headings)}\n`);
process.stdout.write(`text equal ${dataBefore.text === dataAfter.text}\n`);
process.stdout.write(`before text has limitation the ${dataBefore.text.includes("limitation the")}\n`);
process.stdout.write(`after text has limitation on ${dataAfter.text.includes("limitation on")}\n`);
process.stdout.write(`before seeAlso ${JSON.stringify(dataBefore.jsonLd.seeAlso)}\n`);
process.stdout.write(`after seeAlso ${JSON.stringify(dataAfter.jsonLd.seeAlso)}\n`);
