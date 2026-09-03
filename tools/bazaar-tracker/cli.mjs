#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import {
  DEFAULT_COHORT_PATH,
  DEFAULT_DATA_DIR,
  createFixtureFetch,
  liveFetch,
  loadCohort,
  readSnapshot,
  runTracker,
} from "./lib.mjs";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    from: { type: "string" },
    fixture: { type: "string" },
    cohort: { type: "string" },
    "data-dir": { type: "string" },
    "observed-at": { type: "string" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help || (!values.live && !values.from && !values.fixture)) {
  process.stderr.write(`Bazaar rematerialization tracker (one-shot CLI; no cron, no daemon).

Usage:
  node tools/bazaar-tracker/cli.mjs --live
  node tools/bazaar-tracker/cli.mjs --from <snapshot.json>
  node tools/bazaar-tracker/cli.mjs --fixture <cdp-search-fixture.json>

--live              fetch current CDP Bazaar discovery rows for the repaired-seller cohort
--from <file>       treat an existing snapshot as the new observation (synthetic / replay)
--fixture <file>    offline CDP search responses keyed by query (tests)
--cohort <file>     default tools/bazaar-tracker/cohort.json
--data-dir <dir>    default data/bazaar-tracker
--observed-at <iso> pin the observation timestamp
--pretty            indent JSON output

Pilot one-shot (not a schedule):
  pilot-vm-job --repo epistemedeus/samedaydesk -- \\
    node tools/bazaar-tracker/cli.mjs --live

--live is not part of npm run build or the ordinary test scripts.
`);
  process.exit(values.help ? 0 : 2);
}

const modes = [values.live, Boolean(values.from), Boolean(values.fixture)].filter(Boolean).length;
if (modes !== 1) {
  process.stderr.write("Use exactly one of --live, --from, or --fixture.\n");
  process.exit(2);
}

const cohort = loadCohort(values.cohort || DEFAULT_COHORT_PATH);
const dataDir = values["data-dir"] || DEFAULT_DATA_DIR;
const observedAt = values["observed-at"] || new Date().toISOString();

let incomingSnapshot = null;
let fetchImpl = null;
let source = "live";

if (values.from) {
  incomingSnapshot = readSnapshot(values.from);
  source = "from-file";
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
});

const output = {
  ok: report.ok,
  observedAt: report.observedAt,
  snapshotPath: report.snapshotPath,
  digestPath: report.digestPath,
  previousSnapshotPath: report.previousSnapshotPath,
  changelogPath: report.changelogPath,
  rowCount: report.rowCount,
  sellerCount: report.sellerCount,
  changeCount: report.changeCount,
  changes: report.changes,
};
process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
