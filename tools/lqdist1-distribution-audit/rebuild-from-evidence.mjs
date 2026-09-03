#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  loadEvidence,
  rebuildFromEvidence,
  writeRebuiltArtifacts,
  TABLE_PATH,
  SUMMARY_PATH,
  PROJECTION_PATH,
} from "./lib.mjs";

const { values } = parseArgs({
  options: {
    write: { type: "boolean", default: false },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  process.stderr.write(`Rebuild the unpaid distribution table from committed evidence.

Usage:
  node tools/lqdist1-distribution-audit/rebuild-from-evidence.mjs
  node tools/lqdist1-distribution-audit/rebuild-from-evidence.mjs --write

Reads docs/lqdist1-distribution-audit/evidence/*.json and emits
per-route-table.json, evidence/summary.json, and catalog-projection.json.
Does not call live buyer surfaces.
`);
  process.exit(0);
}

const rebuilt = rebuildFromEvidence(loadEvidence());
if (values.write) {
  writeRebuiltArtifacts(rebuilt);
}

const output = {
  ok: true,
  wrote: Boolean(values.write),
  tablePath: TABLE_PATH,
  summaryPath: SUMMARY_PATH,
  projectionPath: PROJECTION_PATH,
  paidOperationCount: rebuilt.table.paidOperationCount,
  canonicalProductCount: rebuilt.table.canonicalProductCount,
  holds: rebuilt.summary.holds,
  coverage: rebuilt.coverage,
};
process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
