#!/usr/bin/env node
// Cold pack of the ordinary readiness caller. Local tarball only.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRICE_PATTERN } from "../lib/readiness-contract.mjs";
import { CALLER_PIN } from "../lib/caller-readiness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(here);
const started = performance.now();

function run(cmd, args, options = {}) {
  const ran = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    cwd: options.cwd,
    env: options.env ?? process.env,
  });
  return {
    status: ran.status ?? 1,
    stdout: ran.stdout ?? "",
    stderr: ran.stderr ?? "",
  };
}

const root = mkdtempSync(join(tmpdir(), "l08-cold-caller-2111013-"));
const loader = join(root, "hide-express-loader.mjs");
const register = join(root, "hide-express-register.mjs");
writeFileSync(loader, [
  "export async function resolve(specifier, context, nextResolve) {",
  "  if (specifier === \"express\" || specifier.startsWith(\"express/\")) {",
  "    const error = new Error(\"Cannot find package 'express'\");",
  "    error.code = \"ERR_MODULE_NOT_FOUND\";",
  "    throw error;",
  "  }",
  "  return nextResolve(specifier, context);",
  "}",
  "",
].join("\n"));
writeFileSync(register, "import { register } from \"node:module\";\nregister(new URL(\"./hide-express-loader.mjs\", import.meta.url));\n");

function hidden(url) {
  return run(process.execPath, [
    "--import", register,
    "--input-type=module",
    "-e", `await import(${JSON.stringify(url)})`,
  ], { timeout: 20_000 });
}

const report = {
  node: process.version,
  children: "spawnSync",
};
try {
  const serverModule = pathToFileURL(join(packageRoot, "lib/task-readiness.mjs")).href;
  const pureModule = pathToFileURL(join(packageRoot, "lib/readiness-contract.mjs")).href;
  const hiddenServer = hidden(serverModule);
  const hiddenPure = hidden(pureModule);
  report.hiddenServer = { status: hiddenServer.status, stderr: hiddenServer.stderr.trim() };
  report.hiddenPure = { status: hiddenPure.status, stderr: hiddenPure.stderr.trim() };
  const packed = run("npm", ["pack", "--ignore-scripts", "--pack-destination", root], {
    cwd: packageRoot,
    timeout: 60_000,
  });
  report.pack = { status: packed.status, stdout: packed.stdout.trim(), stderr: packed.stderr.trim() };
  const tarballName = packed.stdout.trim().split("\n").at(-1);
  const tarball = join(root, tarballName);
  report.tarballBytes = statSync(tarball).size;
  const listed = run("tar", ["-tzf", tarball], { timeout: 20_000 });
  report.tarballEntries = listed.stdout.trim().split("\n");
  const installRoot = join(root, "install");
  mkdirSync(installRoot, { recursive: true });
  writeFileSync(join(installRoot, "package.json"), "{\"private\":true}\n");
  const installStarted = performance.now();
  const installed = run("npm", [
    "install",
    "--offline",
    "--ignore-scripts",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    tarball,
  ], {
    cwd: installRoot,
    timeout: 60_000,
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  });
  report.install = {
    status: installed.status,
    ms: Math.round((performance.now() - installStarted) * 1000) / 1000,
    stderr: installed.stderr.trim(),
  };
  const pkg = join(installRoot, "node_modules/@samedaydesk/task-readiness-caller");
  const bin = join(installRoot, "node_modules/.bin/task-readiness-caller");
  const installedPure = pathToFileURL(join(pkg, "lib/readiness-contract.mjs")).href;
  const hiddenInstalled = hidden(installedPure);
  report.hiddenInstalledPure = { status: hiddenInstalled.status, stderr: hiddenInstalled.stderr.trim() };
  const cases = variableCases();
  report.cases = [];
  const direct = await import(pathToFileURL(join(pkg, "lib/caller-readiness.mjs")).href);
  for (const item of cases) {
    const file = join(root, `${item.name}.json`);
    writeFileSync(file, JSON.stringify(item.body));
    const directStarted = performance.now();
    const directResult = direct.diagnoseCallerContract(item.body, { now: Date.parse("2026-10-12T00:00:00.000Z") });
    const directMs = Math.round((performance.now() - directStarted) * 1000) / 1000;
    const cliStarted = performance.now();
    const cli = run(bin, ["--in", file], { timeout: 10_000 });
    const cliMs = Math.round((performance.now() - cliStarted) * 1000) / 1000;
    report.cases.push({
      name: item.name,
      cliStatus: cli.status,
      cliMs,
      directMs,
      cli: JSON.parse(cli.stdout),
      directNextAction: directResult.nextAction,
      directFit: directResult.fit,
      sameDecision: decisionKey(JSON.parse(cli.stdout)) === decisionKey(directResult),
    });
  }
  report.elapsedMs = Math.round((performance.now() - started) * 1000) / 1000;
  report.ok = report.hiddenServer.status === 1
    && report.hiddenPure.status === 0
    && report.hiddenInstalledPure.status === 0
    && report.pack.status === 0
    && report.install.status === 0
    && report.cases.every((item) => item.sameDecision)
    && report.cases[0].cliStatus === 0
    && report.cases.slice(1).every((item) => item.cliStatus === 1)
    && !report.tarballEntries.some((entry) => /(^|\/)task-readiness\.mjs$|cold-client|express|fixtures/.test(entry));
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);

function decisionKey(result) {
  return JSON.stringify({
    fit: result.fit,
    nextAction: result.nextAction,
    schema: result.schema,
    semantic: result.semantic,
    savingsClaim: result.savingsClaim,
    cost: result.cost,
    quoteGenerated: result.quoteGenerated,
    directPathRetained: result.directPathRetained,
  });
}

function variableCases() {
  const semantic = { pointer: "data.quote", pattern: PRICE_PATTERN.source };
  const common = { pin: CALLER_PIN, deadline: "2099-01-01T00:00:00.000Z", semantic };
  const schema = {
    type: "object",
    properties: {
      data: {
        type: "object",
        required: ["quote"],
        properties: { quote: { type: "string" } },
      },
    },
  };
  return [
    {
      name: "conforming",
      body: { method: "GET", path: "/estimate", schema, value: { data: { quote: "4.50" } }, ...common },
    },
    {
      name: "semantic-wrong",
      body: { method: "POST", path: "/price", schema, value: { data: { quote: "later" } }, ...common },
    },
    {
      name: "irrelevant",
      body: {
        method: "POST",
        path: "/price",
        schema,
        value: { data: { quote: "4.50" } },
        pin: CALLER_PIN,
        deadline: "2099-01-01T00:00:00.000Z",
        semantic: { pointer: "data.currency", pattern: "^[A-Z]{3}$" },
      },
    },
  ];
}
