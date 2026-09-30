import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { probeFamily4Surface, startupGate } from "../lib/hosted-family4.js";
import { ciHealthObligation, rejectUnexecutedHealthPass } from "../lib/hosted-gates.js";
import { executeHostedStartup } from "./hosted-startup-actual.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/hosted-startup-preload.mjs", import.meta.url));
const surfacePromise = probeFamily4Surface();

async function childMessage(t, args) {
  const child = spawn(process.execPath, ["--import", preload, ...args], {
    cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "test", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", b => { output = (output + b).slice(-2000); });
  let releaseCleanup = () => {};
  const probeSettled = new Promise((resolve) => { releaseCleanup = resolve; });
  t.after(async () => {
    await probeSettled;
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
    try { await exited; } finally { clearTimeout(timer); }
  });
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error("No startup receipt: " + output)), 5000);
      function finish(error, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      }
      child.once("message", message => finish(null, { child, message }));
      child.once("error", error => finish(error));
      child.once("exit", code => finish(new Error("Exited before startup receipt: " + code + " " + output)));
    });
  } finally {
    releaseCleanup();
  }
}

for (const [name, args] of [
  ["direct Node entry", ["server/index.js"]],
  ["managed-host ESM loader", ["--input-type=module", "--eval", 'await import("./server/index.js")']],
  ["managed-host CommonJS loader", ["--eval", 'require("./server/index.js")']],
]) {
  test(name + " actually listens and serves health", async () => {
    const surface = await surfacePromise;
    const gate = startupGate(surface);
    const obligation = ciHealthObligation(gate);
    if (obligation.executed !== true) {
      const forged = {
        ...obligation,
        accepted: true,
        passedAsHealth: true,
        runtimeSocketHealth: "pass",
        gateResult: "accepted",
        cause: "reachable",
      };
      assert.equal(rejectUnexecutedHealthPass(forged).ok, false);
      assert.equal(obligation.gate, "ci");
      assert.equal(obligation.accepted, false);
      assert.equal(obligation.passedAsHealth, false);
      assert.equal(obligation.runtimeSocketHealth, "not-executed");
      assert.equal(obligation.productionActivate, "HOLD");
      assert.fail("ci runtime socket health was not executed; not a pass");
    }
    const report = await executeHostedStartup({ args, seed: "healthy" });
    assert.equal(report.accepted, true, JSON.stringify(report));
    assert.equal(report.cause, "reachable");
    assert.equal(report.ipv6DualStackExplains, false);
    assert.equal(report.productionActivate, "HOLD");
    assert.equal(report.gate, "ci");
    assert.equal(report.executed, true);
    assert.equal(report.runtimeSocketHealth, "executed");
    assert.equal(report.gateResult, "accepted");
    assert.equal(report.passedAsHealth, true);
    assert.equal(report.activatesProduction, false);
    assert.equal(report.acceptedReceipt, true);
    assert.equal(report.sameChild.ok, true);
    assert.equal(report.sameChild.status, 200);
    assert.equal(report.parent.ok, true);
    assert.equal(report.parent.status, 200);
    assert.equal(report.parent.service, "samedaydesk");
    assert.equal(report.childExit, null);
    assert.equal(report.bound.family, "IPv4");
    assert.equal(report.bound.address, "0.0.0.0");
    assert.equal(report.disabled.status, 200);
    assert.deepEqual(report.disabled.body, { ok: false, enabled: false, reason: "unconfigured" });
  });
}

test("factory import remains unbound", async t => {
  const { child, message } = await childMessage(t, [
    "--input-type=module", "--eval",
    'const m = await import("./server/app.js"); process.send({ factory: typeof m.createSdsApp }); process.disconnect();',
  ]);
  assert.deepEqual(message, { factory: "function" });
  if (child.exitCode === null) {
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
  } else assert.equal(child.exitCode, 0);
});

test("seeded child exit after accept is not a passing startup", async () => {
  const report = await executeHostedStartup({ seed: "child-exit" });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.accepted, false);
  assert.equal(report.cause, "child-exit");
  assert.equal(report.gate, "ci");
  assert.equal(report.executed, true);
  assert.equal(report.passedAsHealth, false);
  assert.equal(report.activatesProduction, false);
  assert.equal(report.ipv6DualStackExplains, false);
  assert.equal(report.sameChild.ok, true);
  assert.equal(report.parent.code, "ECONNREFUSED");
  assert.equal(report.childExit.code, 0);
  assert.equal(report.bound.family, "IPv4");
  assert.equal(report.bound.address, "0.0.0.0");
});

test("seeded SIGKILL before the parent probe is not a passing startup", async () => {
  const report = await executeHostedStartup({ seed: "sigkill" });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.accepted, false);
  assert.equal(report.cause, "child-exit");
  assert.equal(report.gate, "ci");
  assert.equal(report.executed, true);
  assert.equal(report.passedAsHealth, false);
  assert.equal(report.parent.code, "ECONNREFUSED");
  assert.equal(report.childExit.signal, "SIGKILL");
  assert.equal(report.sameChild.ok, true);
});

test("seeded close before accept is not a passing startup", async () => {
  const report = await executeHostedStartup({ seed: "never-accepted" });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.accepted, false);
  assert.equal(report.cause, "never-accepted");
  assert.equal(report.gate, "ci");
  assert.equal(report.executed, true);
  assert.equal(report.passedAsHealth, false);
  assert.equal(report.ipv6DualStackExplains, false);
  assert.equal(report.acceptedReceipt, false);
  assert.equal(report.sameChild.ok, false);
  assert.equal(report.sameChild.code, "ECONNREFUSED");
  assert.equal(report.parent.code, "ECONNREFUSED");
  assert.equal(report.childExit, null);
});

test("stamped ECONNREFUSED success is rejected", async () => {
  const report = await executeHostedStartup({ seed: "false-green" });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.accepted, false);
  assert.equal(report.cause, "false-green");
  assert.equal(report.gate, "ci");
  assert.equal(report.executed, true);
  assert.equal(report.gateResult, "false-green");
  assert.equal(report.passedAsHealth, false);
  assert.equal(report.activatesProduction, false);
  assert.equal(report.stampRejected, true);
  assert.equal(report.underlying, "child-exit");
  assert.equal(report.parent.code, "ECONNREFUSED");
  assert.equal(report.ipv6DualStackExplains, false);
});
