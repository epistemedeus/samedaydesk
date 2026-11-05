#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { acquire, buildReport, digest, DEFAULT_QUERY, PROBLEM_FIRST_QUERY } from "./src/index.mjs";

try {
  const { values } = parseArgs({ options: {
    out: { type: "string" },
    input: { type: "string" },
    query: { type: "string" },
    "query-file": { type: "string" },
    "per-page": { type: "string", default: "20" },
    "problem-first": { type: "boolean", default: false },
  } });
  if (!values.out) throw new Error("--out directory is required");
  const querySpec = values["query-file"] ? JSON.parse(await readFile(values["query-file"], "utf8")) : null;
  const perPageDefault = querySpec?.perPage ?? Number(values["per-page"]);
  let query;
  let perPage;
  let queryRole;
  if (values["problem-first"]) {
    query = querySpec?.problemFirst?.query ?? PROBLEM_FIRST_QUERY;
    perPage = querySpec?.problemFirst?.perPage ?? perPageDefault;
    queryRole = "problem-first";
  } else {
    query = querySpec?.query ?? values.query ?? DEFAULT_QUERY;
    perPage = perPageDefault;
    queryRole = query === DEFAULT_QUERY ? "vocabulary" : "explicit";
  }
  const out = resolve(values.out);
  await mkdir(out, { recursive: true });
  // Retain the exact manual fallback before attempting network access.
  await writeFile(join(out, "query.json"), JSON.stringify({ query, perPage, queryRole }, null, 2) + "\n");
  const response = values.input
    ? JSON.parse(await readFile(values.input, "utf8"))
    : await acquire({ query, perPage, token: process.env.GH_TOKEN });
  const report = buildReport(response, {
    query, perPage, queryRole, mode: values.input ? "recorded" : "live_public_api",
  });
  await writeFile(join(out, "discovery.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(out, "digest.md"), digest(report));
  console.log(JSON.stringify({ outcome: report.outcome, counts: report.counts, queryRole, out }));
} catch (error) {
  // Never serialize request headers, environment, or upstream response bodies.
  console.error(`E07: ${error.message}`);
  process.exitCode = 1;
}
