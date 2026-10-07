#!/usr/bin/env node
// Equally equipped caller-operated alternative. Same pinned change-monitor
// archive, same source-projection scope, same material-fields predicate.
// The caller keeps the state file, the lock, the cadence sleep, and recovery.
// This is not a five-GET transport check.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPinnedMonitor } from "./runtime.mjs";

function run(cmd, args) {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => {
      resolve({
        argv: [cmd, ...args],
        exit: code,
        runtimeMs: Math.round(performance.now() - started),
        stdout: stdout.slice(0, 500),
        stderr: stderr.slice(0, 300),
      });
    });
  });
}

function metric(key, value, population) {
  return { key, value, state: "ok", unit: "count", population, window: "point" };
}

function covered(marketplaceCompleted) {
  return {
    sourceId: "moltjobs",
    sourceKind: "work_market",
    availability: "ok",
    fetchedAt: "2026-10-07T00:00:00.000Z",
    providerTimestamp: "2026-10-07T00:00:00.000Z",
    providerTimestampState: "ok",
    metrics: [
      metric("jobCount", 122, "moltjobs_work_market"),
      metric("marketplaceCompleted", marketplaceCompleted, "moltjobs_marketplace_ordinary_third_party"),
      metric("marketplaceEmployers", 4, "moltjobs_marketplace_employers"),
      metric("liquidityRegisteredAgents", 434, "moltjobs_registered_agents"),
      metric("liquidityAgentsEverPaid", 3, "moltjobs_agents_ever_paid"),
      metric("liquidityAgentsBidding30d", 2, "moltjobs_agents_bidding_30d"),
      metric("platformProgramJobs", 1, "moltjobs_platform_programs"),
    ],
  };
}

export async function runDirectAlternative() {
  const started = performance.now();
  const { monitor, projection, root, pin, pins } = await loadPinnedMonitor();
  const dir = await mkdtemp(path.join(tmpdir(), "l12-direct-"));
  const cli = path.join(root, "package", "src", "cli.mjs");
  const state = path.join(dir, "state.json");
  const receivers = path.join(dir, "receivers.json");
  const subscription = path.join(dir, "subscription.json");
  const baseline = path.join(dir, "baseline.json");
  const changed = path.join(dir, "changed.json");
  await writeFile(receivers, JSON.stringify({ "local-vm": { kind: "local-http", baseUrl: "http://127.0.0.1:9" } }));
  const subscriptionBody = JSON.parse(await readFile(path.join(root, "package", "examples", "subscription.source-projection.json"), "utf8"));
  subscriptionBody.expiresAt = "2026-11-01T00:00:00.000Z";
  await writeFile(subscription, JSON.stringify(subscriptionBody));
  const baseProjection = projection.applySourceUpdate(
    projection.emptyProjection({ observedAt: "2026-10-07T00:00:00.000Z" }),
    covered(15),
    { observedAt: "2026-10-07T00:00:00.000Z" },
  ).projection;
  const nextProjection = projection.applySourceUpdate(
    baseProjection,
    covered(16),
    { observedAt: "2026-10-07T01:00:00.000Z" },
  ).projection;
  const asDocument = (value, capture) => ({ capture, integration: "maintained", projection: value, publicSourceChanged: false });
  await writeFile(baseline, JSON.stringify(asDocument(baseProjection, "injected")));
  await writeFile(changed, JSON.stringify(asDocument(nextProjection, "injected")));
  const node = process.execPath;
  const steps = [];
  steps.push(await run(node, [cli, "subscribe", "--state", state, "--file", subscription, "--receivers", receivers, "--now", "2026-10-07T00:00:00.000Z"]));
  steps.push(await run(node, [cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", baseline, "--now", "2026-10-07T00:00:00.000Z"]));
  steps.push(await run(node, [cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", baseline, "--now", "2026-10-07T01:00:00.000Z"]));
  steps.push(await run(node, [cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", changed, "--now", "2026-10-07T02:00:00.000Z"]));
  steps.push(await run(node, [cli, "pause", "--state", state, "--subscription", "moltjobs-maintained", "--now", "2026-10-07T02:10:00.000Z"]));
  const restarted = await run(node, [cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", changed, "--now", "2026-10-07T03:00:00.000Z"]);
  steps.push(restarted);
  const stateBytes = (await readFile(state)).length;
  const report = {
    schema: "sds.managed-watch.direct-alternative.v1",
    equallyEquipped: true,
    fiveGetStrawman: false,
    archive: { version: pin.version, sha256: pin.sha256, bytes: pin.bytes },
    predicate: "material-fields",
    source: "source-projection:moltjobs",
    callerOperates: ["state file", "file lock", "cadence sleep", "process restart", "unknown-delivery reconcile", "pause and cancel"],
    cadenceSleepNotElapsed: "caller duty is one sleep of the enrolled cadence; this receipt does not pretend that sleep is a network GET",
    hostedLibraryNotUsedAsScheduler: {
      maintainedUsefulDelivery: pins.maintainedUsefulDelivery,
      maintainedOperations: pins.maintainedOperations,
    },
    steps: steps.map((step) => ({ argv: step.argv.slice(1), exit: step.exit, runtimeMs: step.runtimeMs })),
    outcomes: steps.slice(1, 5).map((step) => {
      try { return JSON.parse(step.stdout).outcome; } catch { return null; }
    }),
    pausedSecondProcessExit: restarted.exit,
    storageBytes: stateBytes,
    runtimeMs: Math.round(performance.now() - started),
    providerMarginalCost: "unknown",
    modelTokens: "unknown",
    savings: "unknown",
    profit: null,
    paidServiceLaunch: false,
    subscriptionOffered: false,
    proposedManagedPrice: null,
  };
  await rm(dir, { recursive: true, force: true });
  void monitor;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runDirectAlternative();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const failed = report.steps.some((step, index) => (index === report.steps.length - 1 ? step.exit !== 3 : step.exit !== 0));
  process.exit(failed ? 1 : 0);
}
