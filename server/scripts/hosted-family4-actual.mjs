import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  classifyFamily4,
  compareBuildSandboxToProd,
  probeFamily4Health,
  probeFamily4Surface,
} from "../lib/hosted-family4.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/hosted-family4-preload.mjs", import.meta.url));
const loopback = fileURLToPath(new URL("./fixtures/hosted-lo.mjs", import.meta.url));
const argv = process.argv.slice(2);
const requireAccept = argv.includes("--require-accept");
const seedFlag = argv.indexOf("--seed");
const seed = seedFlag >= 0 ? argv[seedFlag + 1] : "";
const compare = argv.includes("--compare-surfaces");

function childEnv(extra = {}) {
  return { PATH: process.env.PATH || "", NODE_ENV: "test", PORT: "0", ...extra };
}

function killChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.kill("SIGTERM");
  });
}

async function spawnEntry(extraEnv) {
  const child = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: root,
    env: childEnv(extraEnv),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => { output = (output + chunk).slice(-1500); });
  }
  const exitPromise = once(child, "exit");
  try {
    const [message] = await once(child, "message", { signal: AbortSignal.timeout(20000) });
    return { child, message, exitPromise, output: () => output };
  } catch (error) {
    await killChild(child);
    throw new Error("No family-4 receipt: " + (error?.message || error) + " " + output);
  }
}

async function sharedEvidence() {
  const surface = await probeFamily4Surface();
  const started = await spawnEntry();
  try {
    const parent = await probeFamily4Health(started.message?.bound?.port);
    const alive = started.child.exitCode === null && started.child.signalCode === null;
    const evidence = {
      probed: { host: "127.0.0.1", family: 4 },
      surfaceCapable: surface.capable === true,
      sameNetns: true,
      bound: started.message?.bound ?? null,
      sameChild: started.message?.sameChild ?? null,
      parent,
      childExit: alive ? null : { code: started.child.exitCode, signal: started.child.signalCode },
    };
    return {
      surface,
      evidence,
      classified: classifyFamily4(evidence),
      before: started.message?.before ?? null,
      syncAfter: started.message?.syncAfter ?? null,
      output: started.output(),
    };
  } finally {
    await killChild(started.child);
  }
}

async function childExitEvidence() {
  const surface = await probeFamily4Surface();
  const started = await spawnEntry({ HOSTED_FAMILY4_EXIT_AFTER_SEND: "1" });
  started.child.send("exit-now");
  const [code, signal] = await started.exitPromise;
  const parent = await probeFamily4Health(started.message?.bound?.port);
  const evidence = {
    probed: { host: "127.0.0.1", family: 4 },
    surfaceCapable: surface.capable === true,
    sameNetns: true,
    bound: started.message?.bound ?? null,
    sameChild: started.message?.sameChild ?? null,
    parent,
    childExit: { code, signal },
  };
  return { surface, evidence, before: started.message?.before ?? null, syncAfter: started.message?.syncAfter ?? null };
}

function readJsonLine(stream, child) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const signal = AbortSignal.timeout(20000);
    const onData = (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      cleanup();
      try { resolve(JSON.parse(buf.slice(0, nl))); }
      catch (error) { reject(error); }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error("surface child exited " + code + " before report " + buf.slice(0, 400)));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("surface child deadline " + buf.slice(0, 400)));
    };
    function cleanup() {
      stream.off("data", onData);
      child.off("exit", onExit);
      signal.removeEventListener("abort", onAbort);
    }
    signal.addEventListener("abort", onAbort, { once: true });
    stream.on("data", onData);
    child.on("exit", onExit);
  });
}

async function runSandbox(lo) {
  const child = spawn("unshare", [
    "--net", "--map-root-user", process.execPath,
    "--import", loopback,
    "--import", preload,
    "server/index.js",
  ], {
    cwd: root,
    env: {
      PATH: process.env.PATH || "",
      NODE_ENV: "test",
      PORT: "0",
      HOSTED_LO: lo,
      HOSTED_FAMILY4_FD3: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-800); });
  try {
    const reported = await readJsonLine(child.stdio[3], child);
    if (!reported?.bound) {
      throw new Error("sandbox report failed " + JSON.stringify(reported) + " " + stderr);
    }
    const parent = await probeFamily4Health(reported.bound.port);
    const alive = child.exitCode === null && child.signalCode === null;
    const evidence = {
      probed: { host: "127.0.0.1", family: 4 },
      surfaceCapable: reported.sameChild?.ok === true,
      sameNetns: false,
      bound: reported.bound,
      sameChild: reported.sameChild,
      parent,
      childExit: alive ? null : { code: child.exitCode, signal: child.signalCode },
    };
    return {
      lo,
      evidence,
      classified: classifyFamily4(evidence),
      before: reported.before ?? null,
      syncAfter: reported.syncAfter ?? null,
    };
  } finally {
    await killChild(child);
  }
}

function seedReport(mode, evidence, phases, expect) {
  const classified = classifyFamily4(evidence);
  const matched = expect(classified, evidence);
  return {
    ok: matched,
    mode,
    productionActivate: "HOLD",
    ...classified,
    before: phases.before,
    syncAfter: phases.syncAfter,
    bound: evidence.bound,
    sameChild: evidence.sameChild,
    parent: evidence.parent,
    childExit: evidence.childExit,
    surfaceCapable: evidence.surfaceCapable,
  };
}

async function main() {
  if (seed === "child-exit") {
    const exit = await childExitEvidence();
    return seedReport("seed-child-exit", exit.evidence, exit, (classified, evidence) => (
      classified.cause === "child-exit"
      && classified.accepted === false
      && classified.ipv6DualStackExplains === false
      && evidence.sameChild?.ok === true
      && evidence.parent?.code === "ECONNREFUSED"
      && evidence.bound?.family === "IPv4"
    ));
  }
  if (seed === "ipv6-claim") {
    const exit = await childExitEvidence();
    const evidence = { ...exit.evidence, claimedCause: "ipv6-dual-stack" };
    return seedReport("seed-ipv6-claim", evidence, exit, (classified) => (
      classified.cause === "rejected-ipv6-claim"
      && classified.accepted === false
      && classified.ipv6DualStackExplains === false
      && classified.underlying === "child-exit"
    ));
  }
  if (compare) {
    const [sandboxLoDown, sandboxLoUp, shared] = await Promise.all([
      runSandbox("down"),
      runSandbox("up"),
      sharedEvidence(),
    ]);
    const loDown = compareBuildSandboxToProd(sandboxLoDown.evidence, shared.evidence);
    const loUp = compareBuildSandboxToProd(sandboxLoUp.evidence, shared.evidence);
    const ok = shared.classified.cause === "reachable"
      && shared.classified.accepted === true
      && shared.classified.ipv6DualStackExplains === false
      && sandboxLoDown.classified.cause === "surface-incapable"
      && sandboxLoDown.evidence.sameChild?.code === "ENETUNREACH"
      && sandboxLoDown.evidence.parent?.code === "ECONNREFUSED"
      && sandboxLoDown.evidence.bound?.address === "0.0.0.0"
      && sandboxLoDown.evidence.bound?.family === "IPv4"
      && sandboxLoUp.classified.cause === "cross-process"
      && sandboxLoUp.evidence.sameChild?.ok === true
      && sandboxLoUp.evidence.parent?.code === "ECONNREFUSED"
      && loDown.differs === true
      && loUp.differs === true
      && loDown.ipv6DualStackExplains === false
      && loUp.ipv6DualStackExplains === false;
    return {
      ok,
      mode: "compare-surfaces",
      differs: loDown.differs === true && loUp.differs === true,
      ipv6DualStackExplains: false,
      productionActivate: "HOLD",
      accepted: false,
      shared: {
        ...shared.classified,
        surface: shared.surface,
        before: shared.before,
        syncAfter: shared.syncAfter,
        bound: shared.evidence.bound,
        sameChild: shared.evidence.sameChild,
        parent: shared.evidence.parent,
        childExit: shared.evidence.childExit,
      },
      sandboxLoDown: {
        ...sandboxLoDown.classified,
        entry: "server/index.js",
        before: sandboxLoDown.before,
        syncAfter: sandboxLoDown.syncAfter,
        bound: sandboxLoDown.evidence.bound,
        sameChild: sandboxLoDown.evidence.sameChild,
        parent: sandboxLoDown.evidence.parent,
        childExit: sandboxLoDown.evidence.childExit,
      },
      sandboxLoUp: {
        ...sandboxLoUp.classified,
        entry: "server/index.js",
        before: sandboxLoUp.before,
        syncAfter: sandboxLoUp.syncAfter,
        bound: sandboxLoUp.evidence.bound,
        sameChild: sandboxLoUp.evidence.sameChild,
        parent: sandboxLoUp.evidence.parent,
        childExit: sandboxLoUp.evidence.childExit,
      },
    };
  }
  const shared = await sharedEvidence();
  return {
    ok: shared.classified.accepted === true && shared.classified.cause === "reachable",
    mode: "actual",
    productionActivate: "HOLD",
    ...shared.classified,
    surface: shared.surface,
    before: shared.before,
    syncAfter: shared.syncAfter,
    bound: shared.evidence.bound,
    sameChild: shared.evidence.sameChild,
    parent: shared.evidence.parent,
    childExit: shared.evidence.childExit,
  };
}

const report = await main();
process.stdout.write(JSON.stringify(report) + "\n");
if (requireAccept) process.exit(report.accepted === true ? 0 : 1);
process.exit(report.ok === true ? 0 : 1);
