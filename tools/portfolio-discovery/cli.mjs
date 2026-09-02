#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createFixtureFetch,
  liveFetch,
  loadCatalog,
  runPortfolioDiscovery,
} from "./lib.mjs";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    fixture: { type: "string" },
    catalog: { type: "string" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help || (!values.live && !values.fixture)) {
  const usage = `Portfolio discovery acceptance (offline fixtures or explicit live).

Usage:
  node tools/portfolio-discovery/cli.mjs --fixture <file.json>
  node tools/portfolio-discovery/cli.mjs --live

--live is not part of npm run build or the ordinary test scripts.
`;
  process.stderr.write(usage);
  process.exit(values.help ? 0 : 2);
}

if (values.live && values.fixture) {
  process.stderr.write("Use either --live or --fixture, not both.\n");
  process.exit(2);
}

const catalog = loadCatalog(values.catalog);
const fetchImpl = values.live
  ? (url) => liveFetch(url, { timeoutMs: catalog.timeoutMs, userAgent: catalog.userAgent })
  : createFixtureFetch(JSON.parse(readFileSync(values.fixture, "utf8")));

const report = await runPortfolioDiscovery(catalog, fetchImpl);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);
