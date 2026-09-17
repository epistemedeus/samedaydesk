#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import {
  DEFAULT_COHORT_PATH,
  DEFAULT_DATA_DIR,
  createFixtureFetch,
  liveFetch,
  loadCohort,
  readIncomingDocument,
  readObservation,
  readbackReport,
  runTracker,
} from "./lib.mjs";
import {
  DEFAULT_EVIDENCE_FIXTURE,
  runEightVsTwentySix,
} from "./sds-evidence-diff.mjs";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    from: { type: "string" },
    fixture: { type: "string" },
    readback: { type: "boolean", default: false },
    "eight-vs-26": { type: "boolean", default: false },
    evidence: { type: "string" },
    claim: { type: "string" },
    cohort: { type: "string" },
    "data-dir": { type: "string" },
    "observed-at": { type: "string" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values["eight-vs-26"] && values.live) {
  process.stderr.write("8-vs-26 refuses --live (no owner CDP, no bazaar-tracker --live).\n");
  process.exit(2);
}

if (values.help || (!values.live && !values.from && !values.fixture && !values.readback && !values["eight-vs-26"])) {
  process.stderr.write(`Bazaar rematerialization tracker (one-shot CLI; no cron, no daemon).

Usage:
  node tools/bazaar-tracker/cli.mjs --live
  node tools/bazaar-tracker/cli.mjs --from <snapshot-or-observations.json>
  node tools/bazaar-tracker/cli.mjs --fixture <cdp-search-fixture.json>
  node tools/bazaar-tracker/cli.mjs --readback
  node tools/bazaar-tracker/cli.mjs --eight-vs-26
  node tools/bazaar-tracker/cli.mjs --eight-vs-26 --claim <claims.json>

--live              fetch current CDP Bazaar discovery rows for the repaired-seller cohort
--from <file>       treat an existing snapshot or compact observation as the new observation
--fixture <file>    offline CDP search responses keyed by query (tests)
--readback          print the committed compact observation and changelog (no network)
--eight-vs-26       diff committed SDS routes vs pinned well-known evidence ops (no CDP)
--evidence <file>   evidence ops JSON (default fixtures/evidence-ops-1.23.49.json)
--claim <file>      extra claims; treating catalog absence as demand exits 1
--cohort <file>     default tools/bazaar-tracker/cohort.json
--data-dir <dir>    default data/bazaar-tracker
--observed-at <iso> pin the observation timestamp
--pretty            indent JSON output

Pilot one-shot (not a schedule):
  pilot-vm-job --repo epistemedeus/samedaydesk -- \\
    node tools/bazaar-tracker/cli.mjs --live

--live is not part of npm run build, --eight-vs-26, or the ordinary test scripts.
Full snapshots stay under data/bazaar-tracker/snapshots/ and are gitignored.
Git tracks a URL+hash observations.json plus CHANGELOG.md and changelog.jsonl.
`);
  process.exit(values.help ? 0 : 2);
}

const modes = [
  values.live,
  Boolean(values.from),
  Boolean(values.fixture),
  values.readback,
  values["eight-vs-26"],
].filter(Boolean).length;
if (modes !== 1) {
  process.stderr.write("Use exactly one of --live, --from, --fixture, --readback, or --eight-vs-26.\n");
  process.exit(2);
}

const dataDir = values["data-dir"] || DEFAULT_DATA_DIR;

if (values.readback) {
  const report = readbackReport(dataDir);
  process.stdout.write(`${values.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : 1);
}

if (values["eight-vs-26"]) {
  const observation = readObservation(dataDir);
  if (!observation) {
    process.stderr.write("8-vs-26 needs a committed observations.json (read-only; no --live).\n");
    process.exit(1);
  }
  const evidencePath = values.evidence || DEFAULT_EVIDENCE_FIXTURE;
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const claims = values.claim ? JSON.parse(readFileSync(values.claim, "utf8")) : null;
  const report = runEightVsTwentySix({ observation, evidence, claims });
  process.stdout.write(`${values.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : 1);
}

const cohort = loadCohort(values.cohort || DEFAULT_COHORT_PATH);
const observedAt = values["observed-at"] || new Date().toISOString();

let incomingSnapshot = null;
let incomingObservation = null;
let fetchImpl = null;
let source = "live";

if (values.from) {
  const incoming = readIncomingDocument(values.from);
  if (incoming.kind === "observation") {
    incomingObservation = incoming.observation;
    source = incoming.observation.captureSource ?? "from-file";
  } else {
    incomingSnapshot = incoming.snapshot;
    source = "from-file";
  }
} else if (values.fixture) {
  fetchImpl = createFixtureFetch(JSON.parse(readFileSync(values.fixture, "utf8")));
  source = "fixture";
} else {
  fetchImpl = (url) => liveFetch(url, { timeoutMs: cohort.timeoutMs, userAgent: cohort.userAgent });
  source = "live";
}

const report = await runTracker({
  cohort,
  dataDir,
  fetchImpl,
  observedAt,
  source,
  incomingSnapshot,
  incomingObservation,
});

const output = {
  ok: report.ok,
  observedAt: report.observedAt,
  snapshotPath: report.snapshotPath,
  previousSnapshotPath: report.previousSnapshotPath,
  observationPath: report.observationPath,
  changelogPath: report.changelogPath,
  humanChangelogPath: report.humanChangelogPath,
  rowCount: report.rowCount,
  sellerCount: report.sellerCount,
  changeCount: report.changeCount,
  changes: report.changes,
};
process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
