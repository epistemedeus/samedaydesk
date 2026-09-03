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
  readbackReport,
  runTracker,
} from "./lib.mjs";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    from: { type: "string" },
    fixture: { type: "string" },
    readback: { type: "boolean", default: false },
    cohort: { type: "string" },
    "data-dir": { type: "string" },
    "observed-at": { type: "string" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help || (!values.live && !values.from && !values.fixture && !values.readback)) {
  process.stderr.write(`Bazaar rematerialization tracker (one-shot CLI; no cron, no daemon).

Usage:
  node tools/bazaar-tracker/cli.mjs --live
  node tools/bazaar-tracker/cli.mjs --from <snapshot-or-observations.json>
  node tools/bazaar-tracker/cli.mjs --fixture <cdp-search-fixture.json>
  node tools/bazaar-tracker/cli.mjs --readback

--live              fetch current CDP Bazaar discovery rows for the repaired-seller cohort
--from <file>       treat an existing snapshot or compact observation as the new observation
--fixture <file>    offline CDP search responses keyed by query (tests)
--readback          print the committed compact observation and changelog (no network)
--cohort <file>     default tools/bazaar-tracker/cohort.json
--data-dir <dir>    default data/bazaar-tracker
--observed-at <iso> pin the observation timestamp
--pretty            indent JSON output

Pilot one-shot (not a schedule):
  pilot-vm-job --repo epistemedeus/samedaydesk -- \\
    node tools/bazaar-tracker/cli.mjs --live

--live is not part of npm run build or the ordinary test scripts.
Full snapshots stay under data/bazaar-tracker/snapshots/ and are gitignored.
Git tracks data/bazaar-tracker/observations.json and CHANGELOG.md.
`);
  process.exit(values.help ? 0 : 2);
}

const modes = [values.live, Boolean(values.from), Boolean(values.fixture), values.readback].filter(Boolean).length;
if (modes !== 1) {
  process.stderr.write("Use exactly one of --live, --from, --fixture, or --readback.\n");
  process.exit(2);
}

const dataDir = values["data-dir"] || DEFAULT_DATA_DIR;

if (values.readback) {
  const report = readbackReport(dataDir);
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
