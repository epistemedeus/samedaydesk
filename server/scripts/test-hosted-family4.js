import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyFamily4, startupGate } from "../lib/hosted-family4.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("./hosted-family4-actual.mjs", import.meta.url));

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
  });
  const lines = (result.stdout || "").trim().split("\n").filter(Boolean);
  let report = null;
  try { report = JSON.parse(lines.at(-1)); }
  catch { report = null; }
  return { status: result.status, report, stderr: result.stderr || "", stdout: result.stdout || "" };
}

test("shared-netns family-4 reachability of server/index.js", { timeout: 60000 }, () => {
  const result = run([]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.report.ok, true);
  assert.equal(result.report.accepted, true);
  assert.equal(result.report.cause, "reachable");
  assert.equal(result.report.ipv6DualStackExplains, false);
  assert.equal(result.report.productionActivate, "HOLD");
  assert.equal(result.report.bound.family, "IPv4");
  assert.equal(result.report.bound.address, "0.0.0.0");
  assert.equal(result.report.before, null);
  assert.equal(result.report.syncAfter, null);
  assert.equal(result.report.sameChild.ok, true);
  assert.equal(result.report.sameChild.status, 200);
  assert.equal(result.report.parent.ok, true);
  assert.equal(result.report.parent.status, 200);
  assert.equal(result.report.childExit, null);
  assert.equal(result.report.surface.capable, true);
});

test("seeded child exit after listen is rejected", { timeout: 60000 }, () => {
  const result = run(["--seed", "child-exit", "--require-accept"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.report.ok, true);
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.cause, "child-exit");
  assert.equal(result.report.ipv6DualStackExplains, false);
  assert.equal(result.report.sameChild.ok, true);
  assert.equal(result.report.parent.code, "ECONNREFUSED");
  assert.equal(result.report.bound.family, "IPv4");
  assert.equal(result.report.childExit.code, 0);
});

test("seeded ipv6 dual-stack claim for a family-4 miss is rejected", { timeout: 60000 }, () => {
  const result = run(["--seed", "ipv6-claim", "--require-accept"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.report.ok, true);
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.cause, "rejected-ipv6-claim");
  assert.equal(result.report.underlying, "child-exit");
  assert.equal(result.report.ipv6DualStackExplains, false);
  assert.equal(result.report.parent.code, "ECONNREFUSED");
});

test("build sandbox netns differs from the shared surface", { timeout: 90000 }, () => {
  const result = run(["--compare-surfaces"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.report.ok, true);
  assert.equal(result.report.differs, true);
  assert.equal(result.report.ipv6DualStackExplains, false);
  assert.equal(result.report.accepted, false);
  assert.equal(result.report.productionActivate, "HOLD");
  assert.equal(result.report.shared.cause, "reachable");
  assert.equal(result.report.shared.accepted, true);
  assert.equal(result.report.sandboxLoDown.cause, "surface-incapable");
  assert.equal(result.report.sandboxLoDown.accepted, false);
  assert.equal(result.report.sandboxLoDown.sameChild.code, "ENETUNREACH");
  assert.equal(result.report.sandboxLoDown.parent.code, "ECONNREFUSED");
  assert.equal(result.report.sandboxLoDown.bound.address, "0.0.0.0");
  assert.equal(result.report.sandboxLoUp.cause, "cross-process");
  assert.equal(result.report.sandboxLoUp.sameChild.ok, true);
  assert.equal(result.report.sandboxLoUp.parent.code, "ECONNREFUSED");
});

test("classifier rejects an address-null probe and an incapable startup gate", () => {
  const missing = classifyFamily4({
    probed: { host: "127.0.0.1", family: 4 },
    surfaceCapable: true,
    sameNetns: true,
    bound: null,
    sameChild: { ok: false, code: "ECONNREFUSED", status: null },
    parent: { ok: false, code: "ECONNREFUSED", status: null },
    childExit: null,
  });
  assert.equal(missing.accepted, false);
  assert.equal(missing.cause, "address-null");
  assert.equal(missing.ipv6DualStackExplains, false);
  const gate = startupGate({
    capable: false,
    host: "127.0.0.1",
    family: 4,
    stage: "connect",
    code: "ENETUNREACH",
    address: { address: "0.0.0.0", family: "IPv4", port: 1 },
  });
  assert.equal(gate.runHealth, false);
  assert.equal(gate.cause, "surface-incapable");
  assert.equal(gate.ipv6DualStackExplains, false);
  const refused = startupGate({
    capable: false,
    host: "127.0.0.1",
    family: 4,
    stage: "connect",
    code: "ECONNREFUSED",
    address: { address: "0.0.0.0", family: "IPv4", port: 9 },
  });
  assert.equal(refused.runHealth, true);
  assert.equal(refused.cause, "econnrefused");
  assert.equal(refused.ipv6DualStackExplains, false);
  const bindFailed = startupGate({ capable: false, host: "127.0.0.1", family: 4, stage: "bind", code: "EADDRINUSE", address: null });
  assert.equal(bindFailed.runHealth, true);
  assert.equal(bindFailed.cause, "probe-inconclusive");
  const capable = startupGate({ capable: true, host: "127.0.0.1", family: 4, code: null });
  assert.equal(capable.runHealth, true);
});
