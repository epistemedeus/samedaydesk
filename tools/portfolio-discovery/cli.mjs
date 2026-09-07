#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createFixtureFetch,
  liveFetch,
  loadCatalog,
  runPortfolioDiscovery,
} from "./lib.mjs";
import { mergeHandoffOverlay, runAgentHandoff } from "./handoff.mjs";
import { runSearchReadiness } from "./search-readiness.mjs";

const MODES = new Set(["discovery", "search-readiness", "agent-handoff"]);

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    fixture: { type: "string" },
    catalog: { type: "string" },
    handoff: { type: "string" },
    mode: { type: "string", default: "discovery" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const mode = values.mode || "discovery";

if (values.help || (!values.live && !values.fixture)) {
  const usage = `Portfolio discovery acceptance (offline fixtures or explicit live).

Usage:
  node tools/portfolio-discovery/cli.mjs --fixture <file.json>
  node tools/portfolio-discovery/cli.mjs --live
  node tools/portfolio-discovery/cli.mjs --mode search-readiness --fixture <file.json>
  node tools/portfolio-discovery/cli.mjs --mode search-readiness --live
  node tools/portfolio-discovery/cli.mjs --mode agent-handoff --fixture <file.json>
  node tools/portfolio-discovery/cli.mjs --mode agent-handoff --live
  node tools/portfolio-discovery/cli.mjs --mode agent-handoff --fixture <file.json> --handoff <overlay.json>

--mode discovery|search-readiness|agent-handoff   default discovery
--handoff <file.json>               optional per-site declared handoff overlay; requires agent-handoff
--pretty                            indent JSON; default output is compact JSON
--live is not part of npm run build or the ordinary test scripts.
`;
  process.stderr.write(usage);
  process.exit(values.help ? 0 : 2);
}

if (values.live && values.fixture) {
  process.stderr.write("Use either --live or --fixture, not both.\n");
  process.exit(2);
}

if (!MODES.has(mode)) {
  process.stderr.write("Unknown --mode. Use discovery, search-readiness, or agent-handoff.\n");
  process.exit(2);
}

if (values.handoff && mode !== "agent-handoff") {
  process.stderr.write("--handoff requires --mode agent-handoff.\n");
  process.exit(2);
}

let catalog = loadCatalog(values.catalog);
if (values.handoff) {
  catalog = mergeHandoffOverlay(catalog, JSON.parse(readFileSync(values.handoff, "utf8")));
}
const fetchImpl = values.live
  ? (url) => liveFetch(url, {
    timeoutMs: catalog.timeoutMs,
    userAgent: catalog.userAgent,
    redirect: mode === "agent-handoff" ? "manual" : "follow",
  })
  : createFixtureFetch(JSON.parse(readFileSync(values.fixture, "utf8")));

const report = mode === "search-readiness"
  ? await runSearchReadiness(catalog, fetchImpl)
  : mode === "agent-handoff"
    ? await runAgentHandoff(catalog, fetchImpl)
    : await runPortfolioDiscovery(catalog, fetchImpl);
process.stdout.write(`${values.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
process.exit(report.ok ? 0 : 1);
