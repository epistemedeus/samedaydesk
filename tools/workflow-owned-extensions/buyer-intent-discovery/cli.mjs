#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { acquire, buildReport, digest, DEFAULT_QUERY } from "./src/index.mjs";

try {
  const { values } = parseArgs({ options: {
    out: { type: "string" }, input: { type: "string" }, query: { type: "string", default: DEFAULT_QUERY },
    "query-file": { type: "string" }, "per-page": { type: "string", default: "20" },
  } });
  if (!values.out) throw new Error("--out directory is required");
  const querySpec = values["query-file"] ? JSON.parse(await readFile(values["query-file"], "utf8")) : null;
  const query = querySpec?.query ?? values.query;
  const perPage = querySpec?.perPage ?? Number(values["per-page"]);
  const out = resolve(values.out);
  await mkdir(out, { recursive: true });
  // Retain the exact manual fallback before attempting network access.
  await writeFile(join(out, "query.json"), JSON.stringify({ query, perPage }, null, 2) + "\n");
  const response = values.input ? JSON.parse(await readFile(values.input, "utf8")) : await acquire({ query, perPage, token: process.env.GH_TOKEN });
  const report = buildReport(response, { query, perPage, mode: values.input ? "recorded" : "live_public_api" });
  await writeFile(join(out, "discovery.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(out, "digest.md"), digest(report));
  console.log(JSON.stringify({ outcome: report.outcome, counts: report.counts, out }));
} catch (error) {
  // Never serialize request headers, environment, or upstream response bodies.
  console.error(`E07: ${error.message}`);
  process.exitCode = 1;
}
