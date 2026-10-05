/**
 * Imported SDS contracts for W3-09 E03. Do not rewrite F08 wrappers,
 * W2-06 cold-start-assessment, or Pilot F11 verify/cold-start.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const SCHEMA = "samedaydesk.cross-runtime-commission.v1";
export const FIXTURE_SCHEMA = "samedaydesk.cross-runtime-commission.fixture.v1";

/** SDS PR51 published archive — free jobs as subjects. */
export const ENGINE_PIN = Object.freeze({
  pr: 51,
  merge: "5b97d1b02e786acd1895cfa1508087ae3f7a1545",
  package: kit.packageId,
  version: kit.version,
  rootName: kit.rootName,
  cli: kit.cli,
  sha256: kit.sha256,
  bytes: kit.bytes,
  purchaseAuthority: kit.purchaseAuthority,
  archiveRel: String(kit.archive).replace(/^\//, ""),
  sourceRepo: kit.sourceRepo,
  sourceCommit: kit.sourceCommit,
  archiveFreeze: kit.archiveFreeze,
});

export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, "client/public", ENGINE_PIN.archiveRel);
export const USEFUL_JOBS_CLI = ENGINE_PIN.cli;
export const USEFUL_JOBS_ROOT_NAME = ENGINE_PIN.rootName;
export const USEFUL_JOBS_ARCHIVE_SHA256 = ENGINE_PIN.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = ENGINE_PIN.bytes;
export const JOURNEY_JOB_ID = "listing-repair-packet";

/** Existing live catalog amounts this scaffold must not change. */
export const LIVE_EXTRACT = Object.freeze({
  amount: "5000",
  display: "0.005 USDC",
  usdc: "0.005",
  route: "/extract",
  mcpPrice: "$0.005",
});
export const LIVE_SELLER_INTEGRITY_AUDIT = Object.freeze({
  amount: "10000",
  display: "0.01 USDC",
  usdc: "0.01",
  route: "/commerce/seller-integrity-audit",
  mcpPrice: "$0.01",
});

export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";

/**
 * Sibling owners. Import their contracts; do not rewrite their trees.
 * W2-06 / F08 / F11 live on other branches or repos and are out of scope here.
 */
export const SIBLINGS = Object.freeze({
  F11: Object.freeze({
    id: "F11",
    owner: "Pilot",
    dir: "tools/verify/cold-start/",
    repo: "epistemedeus/pilot",
    note: "Pilot cold-start evidence verifier. Exact package/environment/commands/results; demo labelled. Not rewritten here.",
  }),
  W206: Object.freeze({
    id: "W2-06",
    owner: "W2-06 E01",
    dir: "tools/cold-start-assessment/",
    repo: "epistemedeus/samedaydesk",
    note: "SDS proposed cold-start assessment. Import honesty/price pins; do not rewrite.",
  }),
  F08: Object.freeze({
    id: "F08",
    owner: "F08",
    dir: "server/paid-useful-jobs/",
    repo: "epistemedeus/samedaydesk",
    note: "Paid wrappers of existing useful jobs. Import engine pins only; do not rewrite wrappers.",
  }),
});

export const STRIP_CHILD_ENV = Object.freeze([
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_PAT",
  "CURSOR_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_SECRET",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AUTHORIZATION",
]);

export const DEFAULT_RUNTIMES = Object.freeze([
  Object.freeze({ label: "node22-local", kind: "local" }),
  Object.freeze({ label: "node22-container-fixture", kind: "container-fixture" }),
]);
