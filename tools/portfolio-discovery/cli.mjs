#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createFixtureFetch,
  liveFetch,
  loadCatalog,
  runPortfolioDiscovery,
} from "./lib.mjs";
import { runSearchReadiness } from "./search-readiness.mjs";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    fixture: { type: "string" },
    catalog: { type: "string" },
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

--mode discovery|search-readiness   default discovery
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

if (mode !== "discovery" && mode !== "search-readiness") {
  process.stderr.write("Unknown --mode. Use discovery or search-readiness.\n");
  process.exit(2);
}

const catalog = loadCatalog(values.catalog);
const fetchImpl = values.live
  ? (url) => liveFetch(url, { timeoutMs: catalog.timeoutMs, userAgent: catalog.userAgent })
  : createFixtureFetch(JSON.parse(readFileSync(values.fixture, "utf8")));

const report = mode === "search-readiness"
  ? await runSearchReadiness(catalog, fetchImpl)
  : await runPortfolioDiscovery(catalog, fetchImpl);
process.stdout.write(`${values.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
process.exit(report.ok ? 0 : 1);
