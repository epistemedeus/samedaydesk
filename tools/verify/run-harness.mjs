#!/usr/bin/env node
// Runs the apex MCP verify commands and checks their exit codes. No gateway client.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(dirname(fileURLToPath(import.meta.url)), "cli.mjs");

const cases = [
  { name: "mcp tools/list", args: ["mcp", "tools/list", "--json"], expect: 0 },
  { name: "seeded absent-tool-not-32602", args: ["--seeded-failure", "absent-tool-not-32602", "--json"], expect: 1 },
  { name: "seeded absent-tool-32601", args: ["--seeded-failure", "absent-tool-32601", "--json"], expect: 1 },
  { name: "seeded gateway-24-tool-list", args: ["--seeded-failure", "gateway-24-tool-list", "--json"], expect: 1 },
  { name: "cite-pilot refuse", args: ["mcp", "cite-pilot", "--json"], expect: 1 },
  { name: "gateway origin refuse", args: ["mcp", "tools/list", "--origin", "https://agents.samedaydesk.com/mcp", "--json"], expect: 1 },
  { name: "named tools/call refuse", args: ["mcp", "tools/call", "generate_complete_fix_pack", "--json"], expect: 1 },
];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG || "C",
        TMPDIR: process.env.TMPDIR || "/tmp",
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout ${args.join(" ")}`));
    }, 30_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

let failed = 0;
for (const item of cases) {
  const result = await run(item.args);
  const ok = result.code === item.expect;
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? "pass" : "fail"} ${item.name} exit ${result.code} expected ${item.expect}\n`);
  if (!ok) process.stderr.write(result.stderr || result.stdout);
}

process.exit(failed === 0 ? 0 : 1);
