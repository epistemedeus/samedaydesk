#!/usr/bin/env node
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHIVE_SHA256, D24_ROOT, EXECUTION_CONTRACT, PINS } from "../lib/pins.mjs";
import { installCleanPrefix, prefixLayout, pythonCli, d01Cli, d07Cli } from "../lib/install.mjs";
import { runD01Cli, runD07Cli, runPythonCli } from "../lib/invoke.mjs";
import { assertCleanPrefix } from "../lib/isolation.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `w5-d24-clean-env — install D01/D07/Co14 into a clean prefix and run them

Commands:
  install --prefix DIR
  python --prefix DIR -- [cli args…]
  d01 --prefix DIR -- [cli args…]
  d07 --prefix DIR -- [cli args…]
  accept --prefix DIR

accept installs, runs vendor-budget-impact on caller files, exports, and imports.
Live settlement, production deploy, and spend are out of scope.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";
if (cmd === "help" || args.help) {
  process.stdout.write(usage());
  process.exit(0);
}

const prefix = args.prefix ? resolve(String(args.prefix)) : null;
if (cmd !== "help" && !prefix) {
  process.stderr.write("missing --prefix\n");
  process.stdout.write(usage());
  process.exit(2);
}

if (cmd === "install") {
  const layout = installCleanPrefix(prefix);
  const isolation = assertCleanPrefix(prefix);
  process.stdout.write(`${JSON.stringify({ ok: isolation.ok, layout, isolation, tested: PINS.tested }, null, 2)}\n`);
  process.exit(isolation.ok ? 0 : 2);
}

const passthrough = args._.slice(1);
if (cmd === "python") {
  const result = runPythonCli(prefix, passthrough);
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status === 0 ? 0 : result.status ?? 2);
}
if (cmd === "d01") {
  const result = runD01Cli(prefix, passthrough);
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status === 0 ? 0 : result.status ?? 2);
}
if (cmd === "d07") {
  const result = runD07Cli(prefix, passthrough);
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status === 0 ? 0 : result.status ?? 2);
}

if (cmd !== "accept") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

const layout = installCleanPrefix(prefix);
const isolation = assertCleanPrefix(prefix);
if (!isolation.ok) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "install-not-isolated", isolation }, null, 2)}\n`);
  process.exit(2);
}

const before = resolve(D24_ROOT, "fixtures/caller/vendor-budget-impact/before.json");
const after = resolve(D24_ROOT, "fixtures/caller/vendor-budget-impact/after.json");
mkdirSync(layout.caller, { recursive: true });
cpSync(before, resolve(layout.caller, "before.json"));
cpSync(after, resolve(layout.caller, "after.json"));
const archive = resolve(layout.assets, "useful-jobs-1.0.0.tar.gz");
const outDir = resolve(layout.work, "budget-out");
const python = runPythonCli(prefix, [
  "run",
  "vendor-budget-impact",
  "--archive",
  archive,
  "--before",
  resolve(layout.caller, "before.json"),
  "--after",
  resolve(layout.caller, "after.json"),
  "--out-dir",
  outDir,
]);
const d01 = runD01Cli(prefix, [
  "run",
  "vendor-budget-impact",
  "--before",
  resolve(layout.caller, "before.json"),
  "--after",
  resolve(layout.caller, "after.json"),
  "--out-dir",
  resolve(layout.work, "d01-out"),
]);
const exportDir = resolve(layout.work, "export");
const exported = runD07Cli(prefix, ["export", "--in-dir", outDir, "--out", exportDir]);
const imported = exported.json?.ok
  ? runD07Cli(prefix, ["import", "--zip", resolve(exportDir, "job-artifacts.zip"), "--out", resolve(layout.work, "import")])
  : { json: null, status: exported.status, stdout: "", stderr: "" };

const payload = {
  ok: Boolean(python.json?.ok && d01.json?.ok && exported.json?.ok && imported.json?.ok && isolation.ok),
  command: "accept",
  tested: PINS.tested,
  contract: EXECUTION_CONTRACT,
  archiveSha256: ARCHIVE_SHA256,
  isolation,
  python: python.json,
  d01: d01.json,
  export: exported.json,
  import: imported.json,
  clis: {
    python: pythonCli(prefix),
    d01: d01Cli(prefix),
    d07: d07Cli(prefix),
  },
};
mkdirSync(layout.work, { recursive: true });
writeFileSync(resolve(layout.work, "accept.json"), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
process.exit(payload.ok ? 0 : 2);
