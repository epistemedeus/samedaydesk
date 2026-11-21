import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { packChangeMonitor, RELEASE_GATE_SHA256 } from "../../../scripts/pack-change-monitor.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

test("official archive unpacks and the journey runs without the repository", { timeout: 240000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "change-monitor-archive-"));
  const outDir = path.join(root, "download");
  const unpack = path.join(root, "unpack");
  const caller = path.join(root, "caller");
  const dest = path.join(root, "journey");
  const gateArchive = path.resolve(packageRoot, "../../public/downloads/release-gate/0.1.4/release-gate-0.1.4.tgz");
  try {
    const packed = packChangeMonitor({ outDir });
    assert.equal(packed.sha256.length, 64);
    await mkdirNeeded(unpack);
    await mkdirNeeded(caller);
    execFileSync("tar", ["-xzf", path.join(outDir, packed.archive), "-C", unpack], { stdio: "ignore" });
    const installed = path.join(unpack, "package");
    assert.equal(existsSync(path.join(installed, "packages/release-gate")), false);
    assert.equal(existsSync(path.join(unpack, "release-gate")), false);
    assert.equal(existsSync(path.join(caller, "package.json")), false);
    const probe = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        path.join(installed, "test/cache-probe.mjs"),
        gateArchive,
      ], {
        cwd: caller,
        env: { ...process.env, NODE_PATH: "" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(probe.code, 0, probe.stderr || probe.stdout);
    const cacheReport = JSON.parse(probe.stdout);
    assert.equal(cacheReport.ok, true);
    assert.equal(cacheReport.seededFailure.rejected, true);
    assert.equal(cacheReport.cases.tampered.executedFlag, null);
    assert.equal(cacheReport.cases.concurrentA.moduleSha256, cacheReport.cases.concurrentB.moduleSha256);
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        path.join(installed, "examples/cold-install.mjs"),
        "--dest",
        dest,
      ], {
        cwd: caller,
        env: { ...process.env, NODE_PATH: "" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.publicSourceChanged, false);
    assert.equal(report.naturalCustomerDemand, false);
    assert.equal(report.deliveredBeforeAccept, false);
    assert.equal(report.seededDelivered, true);
    assert.equal(report.unacceptedDelivered, false);
    assert.equal(report.irrelevantNotified, false);
    assert.equal(report.staleMaterial, null);
    assert.equal(report.unavailableMaterial, null);
    assert.equal(report.unavailableIsZero, false);
    assert.equal(report.isolatedFromPrivateSibling, true);
    assert.equal(report.releaseGate.sha256, RELEASE_GATE_SHA256);
    assert.equal(report.releaseGate.httpStatus, 200);
    assert.equal(report.releaseGate.acquiredFrom, "public-get");
    assert.equal(report.captures.includes("seeded"), true);
    assert.equal(report.captures.includes("live"), true);
    assert.equal(report.cost.billable, false);
    assert.equal(report.cost.price, null);
    assert.equal(path.resolve(report.installed).startsWith(path.resolve(packageRoot)), false);
    const status = JSON.parse(await readFile(path.join(outDir, "release-status.json"), "utf8"));
    assert.equal(status.publicationStatus, "candidate");
    assert.equal(status.hostedAcquisitionVerified, false);
    assert.equal(status.launched, false);
    assert.equal(status.archiveOriginUrl, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function mkdirNeeded(directory) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(directory, { recursive: true });
}
