#!/usr/bin/env node
// npm run release:check [-- --all] [-- --only name,name] [-- --from name]
//
// Runs the cheap release gates listed in release/gates.json, in order, and stops at the first
// failure unless --all is given. Each gate's output goes to release/out/logs/<name>.log; the summary
// (commit, every gate's result and duration) goes to release/out/check.json. Exit code 0 only when
// every gate that ran passed and none was skipped by a failure.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const all = args.includes("--all");
const pick = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const only = pick("--only")?.split(",") ?? null;
const from = pick("--from");

const { gates } = JSON.parse(readFileSync(join(root, "release/gates.json"), "utf8"));
const out = join(root, "release/out");
mkdirSync(join(out, "logs"), { recursive: true });
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const sha = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";

let selected = gates;
if (from) selected = selected.slice(Math.max(0, gates.findIndex((g) => g.name === from)));
if (only) selected = selected.filter((g) => only.includes(g.name));

function runGate(gate) {
  return new Promise((resolve) => {
    const log = createWriteStream(join(out, "logs", `${gate.name}.log`));
    const started = Date.now();
    const child = spawn("bash", ["-o", "pipefail", "-c", gate.run], {
      cwd: join(root, gate.cwd ?? "."),
      env: { ...process.env, ...(gate.env ?? {}), FORCE_COLOR: "0", CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), (gate.timeoutMinutes ?? 20) * 60_000);
    let tail = "";
    const keep = (chunk) => { log.write(chunk); tail = (tail + chunk).slice(-2000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      log.end();
      resolve({ name: gate.name, run: gate.run, state: code === 0 ? "passed" : "failed", exit: code, signal, seconds: Math.round((Date.now() - started) / 1000), log: `release/out/logs/${gate.name}.log`, tail: code === 0 ? undefined : tail.split("\n").slice(-15).join("\n") });
    });
  });
}

const results = [];
let stopped = false;
for (const gate of selected) {
  if (stopped) { results.push({ name: gate.name, run: gate.run, state: "not run" }); continue; }
  process.stdout.write(`${gate.name} ... `);
  const r = await runGate(gate);
  results.push(r);
  console.log(`${r.state} (${r.seconds}s)`);
  if (r.state !== "passed") {
    console.log(r.tail);
    if (!all) stopped = true;
  }
}

const finishedCommit = git("rev-parse", "HEAD");
const dirtyAtFinish = git("status", "--porcelain", "--untracked-files=no") !== "";
const passed = results.length > 0 && results.every((r) => r.state === "passed");
const summary = {
  repository: JSON.parse(readFileSync(join(root, "release/key-pages.json"), "utf8")).site,
  commit: sha,
  dirty,
  dirtyAtFinish,
  finishedCommit,
  state: passed && !dirty && !dirtyAtFinish && finishedCommit === sha ? "passed" : "failed",
  finishedAt: new Date().toISOString(),
  node: process.version,
  host: os.hostname(),
  loadAverage: os.loadavg().map((x) => Math.round(x * 100) / 100),
  selection: only || from ? { only, from } : "all gates",
  gates: results,
};
writeFileSync(join(out, "check.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\n${summary.state} on ${sha.slice(0, 8)}${dirty ? " (working tree has uncommitted changes, so this cannot pass)" : ""}: ${results.filter((r) => r.state === "passed").length}/${results.length} gates passed. Summary in release/out/check.json`);
process.exit(summary.state === "passed" ? 0 : 1);
