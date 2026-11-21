#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) flags[key] = true;
    else {
      flags[key] = value;
      index += 1;
    }
  }
  return flags;
}

function run(args, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, env });
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
}

function firstLine(stream) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        stream.off("data", onData);
        resolve(buffer.slice(0, newline));
      }
    };
    stream.on("data", onData);
    stream.on("error", reject);
    stream.on("end", () => reject(new Error("receiver exited before it announced a loopback URL")));
  });
}

function outsidePackage(dest) {
  const root = packageRoot.endsWith(path.sep) ? packageRoot : `${packageRoot}${path.sep}`;
  return dest !== packageRoot && !dest.startsWith(root);
}

async function readState(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function moltjobsSlot(reading) {
  const sources = reading?.projection?.sources;
  if (!Array.isArray(sources)) throw new Error("live projection has no sources");
  const slot = sources.find((entry) => entry && entry.sourceId === "moltjobs");
  if (!slot?.freshness || typeof slot.freshness.fetchedAt !== "string") {
    throw new Error("live projection has no moltjobs fetchedAt");
  }
  return slot;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const dest = flags.dest && flags.dest !== true
    ? path.resolve(flags.dest)
    : await mkdtemp(path.join(tmpdir(), "change-monitor-cold-"));
  if (!outsidePackage(dest)) throw new Error("cold install destination must be a second directory");
  const installed = path.join(dest, "change-monitor");
  const cacheDir = path.join(dest, "deps", "release-gate-0.1.4");
  await rm(installed, { recursive: true, force: true });
  await rm(cacheDir, { recursive: true, force: true });
  await mkdir(path.dirname(installed), { recursive: true });
  await cp(packageRoot, installed, {
    recursive: true,
    filter(source) {
      const base = path.basename(source);
      return base !== "node_modules" && base !== ".cache";
    },
  });
  const sibling = path.resolve(installed, "../release-gate/package.json");
  if (existsSync(sibling)) throw new Error("install can see a private release-gate sibling");
  const consumer = await readFile(path.join(installed, "src/consumers/release-gate.mjs"), "utf8");
  if (consumer.includes("../release-gate") || consumer.includes("packages/release-gate")) {
    throw new Error("install still imports a private release-gate tree");
  }
  const page = path.join(installed, "vendor/s12-observatory/page.js");
  if (existsSync(page)) throw new Error("cold install copied the observatory UI");

  const acquireStarted = Date.now();
  const { acquireReleaseGate } = await import(pathToFileURL(path.join(installed, "src/runtime/acquire-release-gate.mjs")).href);
  const acquired = await acquireReleaseGate({ cacheDir, refresh: true });
  const releaseGateMs = Date.now() - acquireStarted;
  if (acquired.identity.version !== "0.1.4" || acquired.identity.sha256 !== "f14eac0c4c10bba3f3d8b2e89d6eed1a87f47077bb06a7c70f96409ced9d7bef") {
    throw new Error("acquired Release Gate is not the pinned public archive");
  }
  if (acquired.identity.httpStatus !== 200 || acquired.identity.acquiredFrom !== "public-get") {
    throw new Error("clean install did not GET the public Release Gate archive");
  }
  if (acquired.identity.moduleResolved !== true) throw new Error("Release Gate module was not loaded from the unpacked archive");

  const childEnv = { ...process.env, CHANGE_MONITOR_RELEASE_GATE_CACHE: cacheDir };
  delete childEnv.NODE_PATH;

  const varDir = path.join(installed, "var");
  await mkdir(varDir, { recursive: true });
  const state = path.join(varDir, "state.json");
  const subscription = path.join(installed, "examples/subscription.source-projection.json");
  const receiver = spawn(process.execPath, [path.join(installed, "examples/loopback-receiver.mjs")], {
    cwd: installed,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let receiverError = "";
  receiver.stderr.on("data", (chunk) => {
    receiverError += chunk.toString("utf8");
  });
  const announced = JSON.parse(await firstLine(receiver.stdout));
  const receivers = path.join(varDir, "receivers.json");
  await writeFile(receivers, `${JSON.stringify({ "local-vm": { kind: "local-http", baseUrl: announced.baseUrl } }, null, 2)}\n`);
  const cli = path.join(installed, "src/cli.mjs");
  const steps = [];
  const record = (name, result) => {
    let body = null;
    try {
      body = JSON.parse(result.stdout);
    } catch {
      body = null;
    }
    steps.push({ name, code: result.code, body, stderr: result.stderr });
    return body;
  };
  try {
    const gate = record("gate", await run([cli, "gate"], installed, childEnv));
    if (steps.at(-1).code !== 0 || gate.releaseGate?.sha256 !== acquired.identity.sha256) {
      throw new Error(`gate identity failed: ${steps.at(-1).stderr}`);
    }
    const subscribed = record("subscribe", await run([
      cli, "subscribe", "--state", state, "--file", subscription, "--receivers", receivers,
    ], installed, childEnv));
    if (steps.at(-1).code !== 0) throw new Error(`subscribe failed: ${steps.at(-1).stderr}`);
    const fetchStarted = Date.now();
    const fetched = record("fetch", await run([
      cli, "fetch", "--state", state, "--subscription", "moltjobs-maintained", "--receivers", receivers,
    ], installed, childEnv));
    const publicSnapshotMs = Date.now() - fetchStarted;
    if (steps.at(-1).code !== 0) throw new Error(`fetch failed: ${steps.at(-1).stderr}`);
    const fetchFile = path.join(varDir, "live-fetch.json");
    await writeFile(fetchFile, JSON.stringify(fetched, null, 2));
    if (fetched.capture !== "live" || fetched.publicSourceChanged !== false || fetched.httpStatus !== 200) {
      throw new Error("public fetch was not a live baseline without a natural change");
    }
    if (fetched.marketWideTraffic !== null || fetched.crossSourceSum?.total != null) {
      throw new Error("public fetch emitted summed traffic");
    }
    if (fetched.observed?.outcome !== "baseline_established") {
      throw new Error(`public baseline outcome ${fetched.observed?.outcome} evidence ${fetched.observed?.evidenceClass}`);
    }

    const irrelevantBody = structuredClone(fetched);
    const irrelevantSlot = moltjobsSlot(irrelevantBody);
    irrelevantSlot.freshness.fetchedAt = "2026-09-30T12:11:11.000Z";
    irrelevantBody.capture = "fixture";
    irrelevantBody.publicSourceChanged = false;
    const irrelevantFile = path.join(varDir, "irrelevant-fetched-at.json");
    await writeFile(irrelevantFile, JSON.stringify(irrelevantBody, null, 2));
    const beforeIrrelevant = Object.keys((await readState(state)).events).length;
    const irrelevant = record("irrelevant", await run([
      cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", irrelevantFile,
    ], installed, childEnv));
    if (irrelevant?.outcome !== "unchanged" || Object.keys((await readState(state)).events).length !== beforeIrrelevant) {
      throw new Error("a changed fetchedAt notified");
    }

    const staleBody = structuredClone(fetched);
    moltjobsSlot(staleBody).freshness.state = "stale";
    staleBody.capture = "fixture";
    staleBody.publicSourceChanged = false;
    const staleFile = path.join(varDir, "stale.json");
    await writeFile(staleFile, JSON.stringify(staleBody, null, 2));
    const stale = record("stale", await run([
      cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", staleFile,
    ], installed, childEnv));
    const staleEvidence = (await readState(state)).evidence[stale?.evidenceId];
    if (stale?.evidenceClass !== "stale" || stale?.outcome === "content_changed" || staleEvidence?.material !== null) {
      throw new Error("stale evidence was treated as a zero or a content change");
    }

    const unavailable = record("unavailable", await run([
      cli, "observe", "--state", state, "--subscription", "moltjobs-maintained",
      "--file", path.join(installed, "examples/unavailable-not-zero.json"),
    ], installed, childEnv));
    const unavailableEvidence = (await readState(state)).evidence[unavailable?.evidenceId];
    if (unavailable?.outcome === "content_changed" || unavailableEvidence?.material !== null) {
      throw new Error("unavailable evidence was treated as content");
    }
    if (JSON.stringify(unavailableEvidence).includes('"value":0')) {
      throw new Error("unavailable fixture stored a zero metric");
    }

    const seeded = record("seed", await run([
      cli, "seed", "--state", state, "--subscription", "moltjobs-maintained",
      "--from", fetchFile, "--key", "marketplaceCompleted",
    ], installed, childEnv));
    if (steps.at(-1).code !== 0) throw new Error(`seed failed: ${steps.at(-1).stderr}`);
    if (seeded.capture !== "seeded" || seeded.publicSourceChanged !== false || seeded.naturalCustomerDemand !== false || seeded.observed?.outcome !== "content_changed") {
      throw new Error("seeded mutation was not one labelled content change");
    }
    if (seeded.mutation.after !== seeded.mutation.before + 1) {
      throw new Error("seeded mutation did not change the captured metric by one");
    }
    const pending = record("pending-show", await run([
      cli, "show", "--state", state, "--event", seeded.observed.eventId,
    ], installed, childEnv));
    if (pending?.delivery?.state !== "pending" || pending?.delivery?.delivered !== false) {
      throw new Error("seeded event was marked delivered before the receiver accepted it");
    }
    const delivered = record("deliver", await run([
      cli, "deliver", "--state", state, "--subscription", "moltjobs-maintained",
      "--event", seeded.observed.eventId, "--receivers", receivers,
    ], installed, childEnv));
    if (steps.at(-1).code !== 0 || delivered.deliveries?.length !== 1 || delivered.deliveries[0]?.state !== "accepted" || delivered.deliveries[0]?.delivered !== true) {
      throw new Error(`delivery failed: ${steps.at(-1).stderr}`);
    }
    const shown = record("restart-show", await run([
      cli, "show", "--state", state, "--event", seeded.observed.eventId,
    ], installed, childEnv));
    if (steps.at(-1).code !== 0 || shown.event?.capture !== "seeded" || shown.event?.transition !== "content_changed") {
      throw new Error("durable seeded event was not readable after a new process");
    }
    const corrected = record("correct", await run([
      cli, "correct", "--state", state, "--subscription", "moltjobs-maintained",
      "--evidence", seeded.observed.evidenceId, "--file", fetchFile,
    ], installed, childEnv));
    if (steps.at(-1).code !== 0 || corrected.outcome !== "content_changed" || corrected.eventId == null) {
      throw new Error(`correction failed: ${steps.at(-1).stderr}`);
    }
    const correction = record("restart-correction", await run([
      cli, "show", "--state", state, "--event", corrected.eventId,
    ], installed, childEnv));
    if (correction.event?.correctsEvidenceId !== seeded.observed.evidenceId || correction.event?.capture !== "live") {
      throw new Error("correction did not name the seeded evidence as a live capture");
    }
    const paused = record("pause", await run([
      cli, "pause", "--state", state, "--subscription", "moltjobs-maintained",
    ], installed, childEnv));
    if (paused?.outcome !== "paused") throw new Error("pause failed");
    const pausedObserve = record("paused-observe", await run([
      cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", fetchFile,
    ], installed, childEnv));
    if (steps.at(-1).code !== 3 || pausedObserve?.outcome !== "paused") {
      throw new Error("paused subscription still admitted an observation");
    }
    const cancelled = record("cancel", await run([
      cli, "cancel", "--state", state, "--subscription", "moltjobs-maintained",
    ], installed, childEnv));
    if (steps.at(-1).code !== 0 || cancelled.outcome !== "cancelled") {
      throw new Error("cancel failed");
    }
    const refused = record("after-cancel", await run([
      cli, "observe", "--state", state, "--subscription", "moltjobs-maintained", "--file", fetchFile,
    ], installed, childEnv));
    if (steps.at(-1).code !== 3 || refused.outcome !== "cancelled") {
      throw new Error("cancelled subscription still admitted an observation");
    }
    const consumerReport = record("cold-consumer", await run([
      path.join(installed, "examples/cold-consumer.mjs"),
      "--state", state, "--subscription", "moltjobs-maintained",
    ], installed, childEnv));
    const captures = (consumerReport.events || []).map((event) => event.capture);
    if (!captures.includes("seeded") || !captures.includes("live")) {
      throw new Error("cold consumer could not tell the seeded event from the live correction");
    }
    const unaccepted = (consumerReport.events || []).filter((event) => event.delivery !== "accepted");
    if (unaccepted.length === 0 || unaccepted.some((event) => event.delivered !== false)) {
      throw new Error("an event the receiver had not accepted was marked delivered");
    }
    const seededRow = (consumerReport.events || []).find((event) => event.eventId === seeded.observed.eventId);
    if (!seededRow || seededRow.capture !== "seeded" || seededRow.delivered !== true) {
      throw new Error("the accepted seeded event was not marked delivered");
    }
    const report = {
      ok: true,
      dest,
      installed,
      receiver: announced.baseUrl,
      subscribed: subscribed.subscription?.subscriptionId ?? null,
      publicSourceChanged: false,
      naturalCustomerDemand: false,
      deliveredBeforeAccept: false,
      seededDelivered: true,
      unacceptedDelivered: false,
      irrelevantNotified: false,
      staleMaterial: staleEvidence.material,
      unavailableMaterial: unavailableEvidence.material,
      unavailableIsZero: false,
      seededEventId: seeded.observed.eventId,
      correctsEvidenceId: correction.event.correctsEvidenceId,
      captures,
      usefulEvents: consumerReport.usage?.usefulEvents ?? null,
      cost: consumerReport.usage?.cost ?? null,
      isolatedFromPrivateSibling: true,
      releaseGate: {
        version: acquired.identity.version,
        sha256: acquired.identity.sha256,
        bytes: acquired.identity.bytes,
        url: acquired.identity.url,
        httpStatus: acquired.identity.httpStatus,
        acquiredFrom: acquired.identity.acquiredFrom,
        receiptSchema: acquired.identity.receiptSchema,
        sourceCommits: acquired.identity.sourceCommits,
      },
      timingsMs: {
        releaseGate: releaseGateMs,
        publicSnapshot: publicSnapshotMs,
        total: Date.now() - started,
      },
    };
    await writeFile(path.join(dest, "JOURNEY.json"), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    receiver.kill();
    if (receiverError.trim()) process.stderr.write(receiverError);
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : "cold install failed"}\n`);
  process.exitCode = 1;
});
