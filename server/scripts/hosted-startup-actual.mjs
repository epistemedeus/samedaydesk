import { spawn } from "node:child_process";
import { once } from "node:events";
import { get } from "node:http";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  classifyHostedStartup,
  probeFamily4Health,
  rejectFalseGreen,
} from "../lib/hosted-family4.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/hosted-startup-preload.mjs", import.meta.url));

function killChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 1000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function localJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = get({
      host: "127.0.0.1",
      port,
      path: pathname,
      family: 4,
      autoSelectFamily: false,
      agent: false,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 16384) request.destroy(new Error("Startup response exceeds 16KiB"));
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error("Startup HTTP probe timed out")));
    request.on("error", reject);
  });
}

async function parentHealth(port) {
  try {
    const health = await localJson(port, "/api/health");
    return {
      ok: health.status === 200 && health.body?.service === "samedaydesk",
      status: health.status,
      code: null,
      service: health.body?.service ?? null,
      health,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      code: error?.code || "probe-error",
      service: null,
      health: null,
      error: error?.message || String(error),
    };
  }
}

function spawnEntry(args, extraEnv) {
  const child = spawn(process.execPath, ["--import", preload, ...args], {
    cwd: root,
    env: { PATH: process.env.PATH || "", NODE_ENV: "test", PORT: "0", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => { output = (output + chunk).slice(-2000); });
  }
  const exitPromise = once(child, "exit").then(([code, signal]) => ({ code, signal }));
  return { child, output: () => output, exitPromise };
}

async function waitMessage(child, output) {
  let settled = false;
  let exitResult = null;
  child.once("exit", (code, signal) => { exitResult = { code, signal }; });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("No startup receipt: " + output())), 5000);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    }
    child.once("message", (value) => finish(null, value));
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => finish(new Error("Exited before startup receipt: " + code + " " + output())));
  });
  return { message, exitResult: () => exitResult };
}

function afterExit(started) {
  return started.exitPromise;
}

function reportOf(mode, evidence, classified, extra = {}, ok = null) {
  return {
    ok: ok == null ? classified.accepted === true && classified.cause === "reachable" : ok,
    mode,
    productionActivate: "HOLD",
    ...classified,
    bound: evidence.bound ?? null,
    sameChild: evidence.sameChild ?? null,
    parent: evidence.parent ?? null,
    childExit: evidence.childExit ?? null,
    ...extra,
  };
}

export async function executeHostedStartup({ args = ["server/index.js"], seed = "healthy" } = {}) {
  const extra = {};
  if (seed === "child-exit" || seed === "false-green") extra.HOSTED_STARTUP_EXIT_AFTER_SEND = "1";
  if (seed === "never-accepted") extra.HOSTED_STARTUP_CLOSE_BEFORE_ACCEPT = "1";
  const started = spawnEntry(args, extra);
  try {
    const waited = await waitMessage(started.child, started.output);
    const message = waited.message;
    if (seed === "sigkill") {
      const childExit = await (async () => {
        if (started.child.exitCode !== null || started.child.signalCode !== null) {
          return { code: started.child.exitCode, signal: started.child.signalCode };
        }
        const pending = once(started.child, "exit");
        started.child.kill("SIGKILL");
        const [code, signal] = await pending;
        return { code, signal };
      })();
      const parent = message?.port ? await probeFamily4Health(message.port) : { ok: false, code: "address-null", status: null, service: null };
      const evidence = {
        probed: { host: "127.0.0.1", family: 4 },
        bound: message?.bound ?? null,
        sameChild: message?.sameChild ?? null,
        parent,
        childExit,
      };
      const classified = classifyHostedStartup(evidence);
      const ok = classified.cause === "child-exit"
        && classified.accepted === false
        && evidence.parent?.code === "ECONNREFUSED"
        && evidence.childExit?.signal === "SIGKILL"
        && evidence.sameChild?.ok === true;
      return reportOf("seed-sigkill", evidence, classified, {}, ok);
    }
    if (seed === "child-exit" || seed === "false-green") {
      started.child.send("exit-now");
      const childExit = await afterExit(started);
      const parent = message?.port ? await probeFamily4Health(message.port) : { ok: false, code: "address-null", status: null, service: null };
      const evidence = {
        probed: { host: "127.0.0.1", family: 4 },
        bound: message?.bound ?? null,
        sameChild: message?.sameChild ?? null,
        parent,
        childExit,
      };
      const classified = classifyHostedStartup(evidence);
      const matched = classified.cause === "child-exit"
        && classified.accepted === false
        && evidence.sameChild?.ok === true
        && evidence.parent?.code === "ECONNREFUSED"
        && evidence.childExit?.code === 0
        && evidence.bound?.family === "IPv4"
        && evidence.bound?.address === "0.0.0.0";
      if (seed === "false-green") {
        const stamped = { ...classified, accepted: true, cause: "reachable", parent, childExit, sameChild: evidence.sameChild };
        const verdict = rejectFalseGreen(stamped);
        return {
          ok: matched && verdict.ok === false && classified.accepted === false && parent.code === "ECONNREFUSED",
          mode: "seed-false-green",
          productionActivate: "HOLD",
          accepted: false,
          cause: "false-green",
          ipv6DualStackExplains: false,
          underlying: classified.cause,
          stampRejected: verdict.ok === false,
          bound: evidence.bound,
          sameChild: evidence.sameChild,
          parent,
          childExit,
        };
      }
      return reportOf("seed-child-exit", evidence, classified, {}, matched);
    }
    const parent = message?.port
      ? await parentHealth(message.port)
      : { ok: false, code: message?.sameChild?.code || "address-null", status: null, service: null, health: null };
    let disabled = null;
    if (parent.ok) disabled = await localJson(message.port, "/api/correspondence/healthz");
    const seenExit = waited.exitResult()
      || ((started.child.exitCode !== null || started.child.signalCode !== null)
        ? { code: started.child.exitCode, signal: started.child.signalCode }
        : null);
    const evidence = {
      probed: { host: "127.0.0.1", family: 4 },
      bound: message?.bound ?? null,
      sameChild: message?.sameChild ?? null,
      parent: { ok: parent.ok === true, code: parent.code ?? null, status: parent.status ?? null, service: parent.service ?? null },
      childExit: seenExit,
    };
    const classified = classifyHostedStartup(evidence);
    const mode = seed === "never-accepted" ? "seed-never-accepted" : "healthy";
    const matched = mode === "seed-never-accepted"
      ? classified.cause === "never-accepted"
        && classified.accepted === false
        && message?.accepted === false
        && evidence.sameChild?.ok === false
        && evidence.sameChild?.code === "ECONNREFUSED"
        && evidence.parent?.code === "ECONNREFUSED"
        && evidence.childExit == null
      : classified.accepted === true
        && classified.cause === "reachable"
        && disabled?.status === 200
        && disabled?.body?.reason === "unconfigured";
    return reportOf(mode, evidence, classified, {
      disabled,
      health: parent.health ?? null,
      acceptedReceipt: message?.accepted === true,
    }, matched);
  } finally {
    if (seed !== "sigkill") await killChild(started.child);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const requireAccept = argv.includes("--require-accept");
  const seedFlag = argv.indexOf("--seed");
  const seed = seedFlag >= 0 ? argv[seedFlag + 1] : "healthy";
  const report = await executeHostedStartup({ seed });
  process.stdout.write(JSON.stringify(report) + "\n");
  if (seed === "false-green") process.exit(report.stampRejected === true && report.accepted === false ? 1 : 0);
  if (requireAccept) process.exit(report.accepted === true ? 0 : 1);
  process.exit(report.ok === true ? 0 : 1);
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(String(error?.stack || error) + "\n");
    process.exit(1);
  });
}
