#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeLocalJob } from "../src/local-job.mjs";

const prefixFlag = process.argv.indexOf("--prefix");
const prefix = prefixFlag === -1 ? "" : process.argv[prefixFlag + 1];
if (!prefix || prefix.startsWith("--")) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    executionDeclaration: "unsupported_execution",
    message: "local entry requires --prefix",
    published: false,
  })}\n`);
  process.exit(0);
}

let source;
try {
  source = JSON.parse(readFileSync(resolve(prefix, "SOURCE.json"), "utf8"));
} catch {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    executionDeclaration: "unsupported_execution",
    message: "installed source pin is missing",
    published: false,
    pid: process.pid,
  })}\n`);
  process.exit(0);
}

let job;
try {
  job = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    executionDeclaration: "unsupported_execution",
    message: "job stdin must be JSON",
    published: false,
    pid: process.pid,
  })}\n`);
  process.exit(1);
}

if (source.consumer === "mcp") {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    executionDeclaration: "unsupported_execution",
    message: "MCP/CLI path runs through runtime/mcp-stdio.mjs",
    published: false,
    pid: process.pid,
    selectedRuntime: { name: "mcp", ran: false, pid: null },
  })}\n`);
  process.exit(0);
}

const result = executeLocalJob({ source, job, prefix: resolve(prefix) });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(exitCode(result));

function exitCode(result) {
  if (result.executionDeclaration === "unsupported_execution" && result.fallback === true) return 0;
  if (result.ok === false) return 1;
  return 0;
}
