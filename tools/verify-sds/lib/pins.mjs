/** Current SameDayDesk lab-verify pins. Edit here; jobs.json must match JOB_IDS. */

export const WANTED_NODE = "22.x";
export const REPO_NAME = "samedaydesk";
export const START_SCRIPT = "node server/index.js";

export const JOB_IDS = Object.freeze(["useful-jobs", "packs", "mcp"]);

export const USEFUL_JOBS = Object.freeze({
  version: "1.4.7",
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  bytes: 5255824,
  rootName: "useful-jobs-1.4.7",
  cli: "bin/useful-jobs.mjs",
  kitArchive: "client/public/kit/useful-jobs-1.4.7.tar.gz",
  publicArchive: "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  kitMeta: "client/src/data/usefulJobsKit.json",
  discovery: "client/public/discovery/useful-jobs.json",
  catalog: "client/public/for-agents/useful-jobs/catalog.json",
  jobIds: Object.freeze([
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
  ]),
});

export const USEFUL_JOBS_NEGATIVE = Object.freeze({
  version: "1.1.0",
  sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
  bytes: 2577606,
  kitArchive: "client/public/kit/useful-jobs-1.1.0.tar.gz",
  publicArchive: "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
});

export const PACKS = Object.freeze({
  recordRepeat: Object.freeze({
    id: "record-repeat-job",
    kitArchive: "client/public/kit/record-repeat-job-ab84d79b0272.tar.gz",
    discovery: "client/public/discovery/record-repeat.json",
    sha256: "9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea",
    bytes: 1253570,
    inTreeBin: "experiments/s176-record-repeat-package/bin/record-repeat.mjs",
    pinFile: "experiments/s176-record-repeat-package/PIN.json",
    parserPin: "65ce1867f1b4339cc708bfb72a7d9a5942785632",
    recipePin: "a022eb6352156dcdcdf2f8730931f5891bd01436",
  }),
  distributionRepair: Object.freeze({
    id: "distribution-repair",
    kitArchive: "client/public/kit/distribution-repair-ab84d79b0272.tar.gz",
    discovery: "client/public/discovery/distribution-repair.json",
    sha256: "64a97dab335aa82d80d9e4384ef8ec89d0bc0920aa844a19b4c2534ad5be5c13",
    bytes: 76599,
    inTreeBin: "experiments/s185-distribution-repair-package/bin/distribution-repair.mjs",
    sampleArgv: Object.freeze(["sample", "--positive"]),
  }),
  consumerRepeat: Object.freeze({
    id: "s178-consumer-repeat-kit",
    kitArchive: "client/public/kit/s178-consumer-repeat-kit.tgz",
    discovery: "client/public/discovery/consumer-repeat.json",
    sha256: "04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d",
    bytes: 718948,
  }),
});

export const MCP = Object.freeze({
  inventoryRel: "server/lib/mcp-tool-inventory.js",
  routeRel: "server/routes/mcp.js",
  tools: Object.freeze([
    "check_ai_readiness",
    "generate_complete_fix_pack",
    "plan_taskmarket_delegation",
    "browse_taskmarket_tasks",
    "track_taskmarket_task",
  ]),
});

export const HORIZON_HOURS_DEFAULT = 24;

export const RECEIPT_SCHEMA = "samedaydesk.lab-verify.receipt.v1";
export const ENVELOPE_SCHEMA = "samedaydesk.lab-verify.envelope.v1";
export const JOBS_SCHEMA = "samedaydesk.lab-verify.jobs.v1";

export const SEEDED_IDS = Object.freeze(["stale-output", "stale-clock", "stale-pin"]);
export const SEEDED_DEFAULT = "stale-output";
