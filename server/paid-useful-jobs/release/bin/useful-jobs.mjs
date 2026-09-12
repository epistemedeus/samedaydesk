#!/usr/bin/env node
/**
 * useful-jobs - standalone offline entry for ten useful-job wrappers.
 * Invokes existing app CLIs without forking their semantics.
 * Owned children run in a process group and are reaped on timeout or SIGTERM.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnOwned, DEFAULT_OWNED_TIMEOUT_MS } from "../lib/owned-spawn.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog.json"), "utf8"));

const APPS = Object.fromEntries(
  CATALOG.jobs.map((j) => [
    j.id,
    {
      ...j,
      script: path.join(ROOT, "apps", j.id, "cli.mjs"),
    },
  ]),
);

const ISOLATE_PUBLISH_JOBS = new Set([
  "lockfile-pin-delta",
  "json-schema-webhook-drift",
  "route-table-diff",
  "page-change-offline-job",
]);

function usage() {
  return `useful-jobs - offline useful-job wrappers (Node >= 22)

Commands:
  list                         List the ten jobs (machine-readable with --json)
  help [job]                   Show this help or one job's caller contract
  run <job> [--example|args…]  Invoke an existing app CLI without semantic fork
  catalog                      Print catalog.json
  version                      Print package version

Examples:
  node bin/useful-jobs.mjs list --json
  node bin/useful-jobs.mjs help api-upgrade-brief
  node bin/useful-jobs.mjs run api-upgrade-brief --example
  node bin/useful-jobs.mjs run lockfile-pin-delta --before a-lock.json --after b-lock.json --out-dir ./out/lock
  node bin/useful-jobs.mjs run vendor-budget-impact --before a.json --after b.json --out-dir ./out/budget

Notes:
  Missing required caller inputs refuse closed. Samples require explicit --example.
  No purchase, network, or scheduler authority is granted by this package.
`;
}

function printList(asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ok: true, jobs: CATALOG.jobs }, null, 2)}\n`);
    return;
  }
  for (const j of CATALOG.jobs) {
    process.stdout.write(`${j.id}\t${j.title}\trequired=${j.requiredInputs.join(" ")}\n`);
  }
}

function printHelp(jobId) {
  if (!jobId) {
    process.stdout.write(usage());
    return;
  }
  const j = APPS[jobId];
  if (!j) {
    process.stderr.write(JSON.stringify({ ok: false, error: `unknown job ${jobId}` }) + "\n");
    process.exit(2);
  }
  const guidePath = path.join(ROOT, "apps", jobId, "CALLER.md");
  const guide = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, "utf8") : "";
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        job: {
          id: j.id,
          title: j.title,
          summary: j.summary,
          requiredInputs: j.requiredInputs,
          optionalInputs: j.optionalInputs || [],
          outputs: j.outputs,
          exampleFlag: j.exampleFlag,
          notes: j.notes,
        },
        callerGuidePath: fs.existsSync(guidePath) ? path.relative(ROOT, guidePath) : null,
      },
      null,
      2,
    ) + "\n",
  );
  if (guide) process.stdout.write(`\n--- CALLER.md ---\n${guide}`);
}

function parseOutDir(argv) {
  const index = argv.indexOf("--out-dir");
  if (index >= 0 && argv[index + 1] && !String(argv[index + 1]).startsWith("--")) {
    return { index, value: argv[index + 1] };
  }
  return null;
}

function promisedComplete(dir, names) {
  if (!dir || !names?.length) return false;
  return names.every((name) => {
    const p = path.join(dir, name);
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function publishOutputs(fromDir, toDir, names) {
  if (!fromDir || !toDir || fromDir === toDir) return;
  fs.mkdirSync(toDir, { recursive: true });
  for (const name of names) {
    const src = path.join(fromDir, name);
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(toDir, name));
    }
  }
}

function rewriteOutDir(text, fromDir, toDir) {
  if (!text || !fromDir || !toDir || fromDir === toDir) return text;
  return text.split(fromDir).join(toDir);
}

async function runJob(jobId, argv) {
  const j = APPS[jobId];
  if (!j) {
    process.stderr.write(JSON.stringify({ ok: false, error: `unknown job ${jobId}` }) + "\n");
    process.exit(2);
  }
  if (!fs.existsSync(j.script)) {
    process.stderr.write(JSON.stringify({ ok: false, error: `missing app script ${j.script}` }) + "\n");
    process.exit(2);
  }

  const callerOut = parseOutDir(argv);
  let childArgv = argv;
  let isolated = null;
  if (ISOLATE_PUBLISH_JOBS.has(jobId)) {
    isolated = fs.mkdtempSync(path.join(os.tmpdir(), `uj-${jobId}-`));
    childArgv = [...argv];
    if (callerOut) childArgv[callerOut.index + 1] = isolated;
    else childArgv.push("--out-dir", isolated);
  }

  const r = await spawnOwned(process.execPath, [j.script, ...childArgv], {
    cwd: ROOT,
    timeoutMs: DEFAULT_OWNED_TIMEOUT_MS,
  });

  const promised = j.outputs || [];
  if (isolated && r.status === 0 && promisedComplete(isolated, promised) && callerOut?.value) {
    publishOutputs(isolated, callerOut.value, promised);
  }

  const stdout =
    isolated && callerOut?.value ? rewriteOutDir(r.stdout || "", isolated, callerOut.value) : r.stdout || "";
  const stderr =
    isolated && callerOut?.value ? rewriteOutDir(r.stderr || "", isolated, callerOut.value) : r.stderr || "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (r.timedOut) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, refused: true, code: "engine-timeout", error: "owned process group timed out" })}\n`,
    );
    process.exit(1);
  }
  process.exit(r.status == null ? 1 : r.status);
}

const argv = process.argv.slice(2);
const cmd = argv[0] || "help";
const rest = argv.slice(1);
const json = rest.includes("--json") || argv.includes("--json");

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  printHelp(rest.find((a) => !a.startsWith("--")) || null);
  process.exit(0);
}
if (cmd === "list") {
  printList(json);
  process.exit(0);
}
if (cmd === "catalog") {
  process.stdout.write(`${JSON.stringify(CATALOG, null, 2)}\n`);
  process.exit(0);
}
if (cmd === "version") {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  process.stdout.write(`${pkg.name} ${pkg.version}\n`);
  process.exit(0);
}
if (cmd === "run") {
  const jobId = rest[0];
  if (!jobId) {
    process.stderr.write(JSON.stringify({ ok: false, error: "run requires <job>" }) + "\n");
    process.stdout.write(usage());
    process.exit(2);
  }
  await runJob(jobId, rest.slice(1));
}

process.stderr.write(JSON.stringify({ ok: false, error: `unknown command ${cmd}` }) + "\n");
process.stdout.write(usage());
process.exit(2);
