import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = join(here, "..");
export const REPO_ROOT = join(KIT_ROOT, "../../..");

export const KIT_SCHEMA = "samedaydesk.wave5.d28.journey-release.v1";
export const RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";
export const D01_CONTRACT = "samedaydesk.paid-useful-jobs.execution.v1";

export const SDS52 = Object.freeze({
  repo: "epistemedeus/samedaydesk",
  ref: "fable/f08-paid-wrappers",
  sha: "aeef964fa188443078958d9d6d393afae1d542ee",
  pr: 52,
  cliRel: "server/paid-useful-jobs/bin/cli.mjs",
  libraryRel: "server/paid-useful-jobs/index.mjs",
  historical: true,
});

export const D01_OBSERVED = Object.freeze({
  id: "W5-D01",
  sha: "in-repo",
  pr: 74,
  contract: D01_CONTRACT,
  onThisBranch: true,
});

export const CO03 = Object.freeze({
  id: "W4-commerce-03",
  sha: "7c55738cc5730985b709282af6c24e10f0a8442f",
  pr: 62,
  path: "tools/repeat-job-binder/",
  onThisBranch: false,
});

export const CO17 = Object.freeze({
  id: "W4-commerce-17",
  sha: "in-repo",
  pr: 112,
  path: "tools/job-output-atomicity/",
  onThisBranch: true,
});

export const WRAPPER_CLI = join(REPO_ROOT, SDS52.cliRel);
export const ARCHIVE_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";
export const ARCHIVE_PATH = join(REPO_ROOT, ARCHIVE_REL);
export const ARCHIVE_SHA256 = "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
export const ARCHIVE_BYTES = 2522418;
export const CATALOG_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");

export const DEFAULT_JOB_ID = "vendor-budget-impact";
export const DEFAULT_OUTPUTS = Object.freeze(["budget-impact.json", "budget-impact.md"]);

export const SDS52_CALLER = Object.freeze({
  before: join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json"),
  after: join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json"),
  payment: join(REPO_ROOT, "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json"),
});

export const LIVE_EXTRACT_PRICE_USDC = "0.005";
export const LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC = "0.01";
export const FIXTURE_PRICE_USDC = "0.02";

export function catalogJobs() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  return catalog.jobs.map((j) => j.id);
}

export function expectedOutputsFor(jobId) {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const job = catalog.jobs.find((j) => j.id === jobId);
  return job ? [...job.outputs] : [...DEFAULT_OUTPUTS];
}
