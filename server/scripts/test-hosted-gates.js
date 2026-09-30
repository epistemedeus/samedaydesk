import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { startupGate } from "../lib/hosted-family4.js";
import {
  buildScriptRunsSocketProbe,
  ciHealthObligation,
  rejectUnexecutedHealthPass,
} from "../lib/hosted-gates.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const gateCli = fileURLToPath(new URL("./hosted-build-sandbox-gate.mjs", import.meta.url));
const acceptCli = fileURLToPath(new URL("./hosted-post-deploy-acceptance.mjs", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/hosted-startup-preload.mjs", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { PATH: process.env.PATH || "", NODE_ENV: "test" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout\n${stdout}\n${stderr}`));
    }, 15000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const line = stdout.trim().split("\n").filter(Boolean).at(-1);
      let report = null;
      try { report = JSON.parse(line); }
      catch { report = null; }
      resolve({ code, report, stdout, stderr });
    });
  });
}

function closedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

test("build script does not run a runtime socket probe", () => {
  const build = pkg.scripts.build;
  assert.equal(build.startsWith("node server/scripts/hosted-build-sandbox-gate.mjs &&"), true);
  assert.equal(buildScriptRunsSocketProbe(build), false);
  assert.equal(build.includes("--seed"), false);
  assert.equal(pkg.scripts["test:hosted-startup"].includes("test-hosted-startup.js"), true);
  assert.equal(pkg.scripts["test:hosted-startup"].includes("test-hosted-gates.js"), true);
  assert.equal(pkg.scripts["accept:post-deploy"], "node server/scripts/hosted-post-deploy-acceptance.mjs");
  const source = readFileSync(gateCli, "utf8");
  assert.equal(source.includes("node:net"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(source.includes("hosted-family4"), false);
  assert.equal(source.includes("createServer"), false);
  assert.equal(buildScriptRunsSocketProbe("npm run test:hosted-startup"), true);
  assert.equal(buildScriptRunsSocketProbe("npm run accept:post-deploy"), true);
});

test("build-sandbox gate records runtime socket health as not-executed", async () => {
  const result = await runNode([gateCli]);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(result.report.gate, "build-sandbox");
  assert.equal(result.report.executed, false);
  assert.equal(result.report.runtimeSocketHealth, "not-executed");
  assert.equal(result.report.gateResult, "not-executed");
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.passedAsHealth, false);
  assert.equal(result.report.buildMayContinue, true);
  assert.equal(result.report.activatesProduction, false);
  assert.equal(result.report.productionActivate, "HOLD");
  assert.equal(result.report.deploy, "not-run");
  assert.equal(result.report.coldCall, "not-run");
  assert.equal(result.report.recommendedOwner, "root");
  assert.equal(result.report.listen.host, "0.0.0.0");
  assert.equal(result.report.listen.family, "IPv4");
  assert.deepEqual(result.report.nextGates, ["ci", "post-deploy-acceptance"]);
  assert.equal(result.report.authority.errno, "ECONNREFUSED");
  assert.equal(result.report.authority.host, "127.0.0.1");
  assert.equal(result.report.authority.family, 4);
  assert.equal(result.report.authority.build, "01a0f343-e6f7-7002-8677-f50183838d83");
  assert.equal(rejectUnexecutedHealthPass(result.report).cause, "not-executed");
  assert.match(result.stderr, /not-executed/);
  assert.match(result.stderr, /not a pass/);
  assert.match(result.stderr, /HOLD/);
});

test("build-sandbox gate rejects a stamped health pass", async () => {
  const result = await runNode([gateCli, "--seed", "false-green"]);
  assert.equal(result.code, 1, result.stderr + result.stdout);
  assert.equal(result.report.gate, "build-sandbox");
  assert.equal(result.report.gateResult, "false-green");
  assert.equal(result.report.cause, "false-green");
  assert.equal(result.report.stampRejected, true);
  assert.equal(result.report.executed, false);
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.passedAsHealth, false);
  assert.equal(result.report.runtimeSocketHealth, "not-executed");
  assert.equal(result.report.buildMayContinue, false);
  assert.equal(result.report.productionActivate, "HOLD");
  assert.equal(result.report.activatesProduction, false);
  const forged = {
    ...result.report,
    accepted: true,
    passedAsHealth: true,
    runtimeSocketHealth: "pass",
    gateResult: "accepted",
    cause: "reachable",
  };
  assert.equal(rejectUnexecutedHealthPass(forged).ok, false);
  assert.equal(rejectUnexecutedHealthPass(forged).cause, "false-green");
});

test("ci gate does not pass an unexecuted health probe", () => {
  const refused = startupGate({
    capable: false,
    host: "127.0.0.1",
    family: 4,
    stage: "connect",
    code: "ECONNREFUSED",
    address: { address: "0.0.0.0", family: "IPv4", port: 9 },
  });
  const required = ciHealthObligation(refused);
  assert.equal(refused.runHealth, true);
  assert.equal(required.gate, "ci");
  assert.equal(required.executed, true);
  assert.equal(required.runtimeSocketHealth, "required");
  assert.equal(required.accepted, false);
  assert.equal(required.passedAsHealth, false);
  const skipped = ciHealthObligation(startupGate({
    capable: false,
    host: "127.0.0.1",
    family: 4,
    stage: "connect",
    code: "ENETUNREACH",
    address: { address: "0.0.0.0", family: "IPv4", port: 1 },
  }));
  assert.equal(skipped.executed, false);
  assert.equal(skipped.gate, "ci");
  assert.equal(skipped.runtimeSocketHealth, "not-executed");
  assert.equal(skipped.accepted, false);
  assert.equal(skipped.passedAsHealth, false);
  assert.equal(skipped.productionActivate, "HOLD");
  const forged = {
    ...skipped,
    accepted: true,
    passedAsHealth: true,
    runtimeSocketHealth: "pass",
    gateResult: "accepted",
    cause: "reachable",
  };
  assert.equal(rejectUnexecutedHealthPass(forged).ok, false);
  assert.equal(rejectUnexecutedHealthPass(skipped).ok, true);
});

test("post-deploy acceptance without a cold call is not a pass", async () => {
  const result = await runNode([acceptCli]);
  assert.equal(result.code, 2, result.stderr + result.stdout);
  assert.equal(result.report.gate, "post-deploy-acceptance");
  assert.equal(result.report.executed, false);
  assert.equal(result.report.runtimeSocketHealth, "not-executed");
  assert.equal(result.report.gateResult, "not-executed");
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.passedAsHealth, false);
  assert.equal(result.report.coldCall, "not-run");
  assert.equal(result.report.deploy, "not-run");
  assert.equal(result.report.productionActivate, "HOLD");
  assert.equal(result.report.activatesProduction, false);
  assert.equal(result.report.recommendedOwner, "root");
  assert.match(result.stderr, /not-executed/);
  assert.match(result.stderr, /not a pass/);
  assert.equal(rejectUnexecutedHealthPass(result.report).cause, "not-executed");
});

test("post-deploy acceptance rejects a stamped pass", async () => {
  const result = await runNode([
    acceptCli,
    "--seed",
    "false-green",
    "--url",
    "http://127.0.0.1:9/api/health",
  ]);
  assert.equal(result.code, 1, result.stderr + result.stdout);
  assert.equal(result.report.cause, "false-green");
  assert.equal(result.report.gateResult, "false-green");
  assert.equal(result.report.stampRejected, true);
  assert.equal(result.report.executed, false);
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.passedAsHealth, false);
  assert.equal(result.report.runtimeSocketHealth, "not-executed");
  assert.equal(result.report.coldCall, "not-run");
  assert.equal(result.report.parent, undefined);
  assert.equal(result.report.productionActivate, "HOLD");
});

test("post-deploy acceptance rejects a refused managed port", async () => {
  const port = await closedPort();
  const result = await runNode([acceptCli, "--url", `http://127.0.0.1:${port}/api/health`]);
  assert.equal(result.code, 1, result.stderr + result.stdout);
  assert.equal(result.report.gate, "post-deploy-acceptance");
  assert.equal(result.report.executed, true);
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.passedAsHealth, false);
  assert.equal(result.report.gateResult, "unaccepted");
  assert.equal(result.report.cause, "ECONNREFUSED");
  assert.equal(result.report.parent.code, "ECONNREFUSED");
  assert.equal(result.report.probedFamily, 4);
  assert.equal(result.report.productionActivate, "HOLD");
  assert.equal(result.report.activatesProduction, false);
  assert.equal(result.report.deploy, "not-run");
});

test("post-deploy acceptance reaches the managed entrypoint and stays HOLD", { timeout: 20000 }, async (t) => {
  const child = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: root,
    env: { PATH: process.env.PATH || "", NODE_ENV: "test", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => { output = (output + chunk).slice(-2000); });
  }
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
    try { await exited; }
    finally { clearTimeout(timer); }
  });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No startup receipt: ${output}`)), 5000);
    child.once("message", (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`exited ${code} ${output}`));
    });
  });
  assert.equal(message.accepted, true);
  assert.equal(message.bound.address, "0.0.0.0");
  assert.equal(message.bound.family, "IPv4");
  const result = await runNode([acceptCli, "--url", `http://127.0.0.1:${message.port}/api/health`]);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(result.report.gate, "post-deploy-acceptance");
  assert.equal(result.report.executed, true);
  assert.equal(result.report.runtimeSocketHealth, "executed");
  assert.equal(result.report.gateResult, "accepted");
  assert.equal(result.report.accepted, true);
  assert.equal(result.report.passedAsHealth, true);
  assert.equal(result.report.cause, "reachable");
  assert.equal(result.report.productionActivate, "HOLD");
  assert.equal(result.report.activatesProduction, false);
  assert.equal(result.report.deploy, "not-run");
  assert.equal(result.report.coldCall, "ran");
  assert.equal(result.report.probedFamily, 4);
  assert.equal(result.report.urlHost, "127.0.0.1");
  assert.equal(result.report.urlPath, "/api/health");
  assert.equal(result.report.parent.status, 200);
  assert.equal(result.report.parent.service, "samedaydesk");
  assert.equal(result.report.listen.host, "0.0.0.0");
  assert.equal(result.report.listen.family, "IPv4");
  assert.equal(rejectUnexecutedHealthPass(result.report).ok, true);
  assert.equal(rejectUnexecutedHealthPass(result.report).cause, "reachable");
});
