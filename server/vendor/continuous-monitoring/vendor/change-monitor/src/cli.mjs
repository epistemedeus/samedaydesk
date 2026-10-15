#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { frozenClock, systemClock } from "./clock.mjs";
import { releaseGateIdentity } from "./consumers/release-gate.mjs";
import { readMaintainedProjection, seedMeaningfulMutation } from "./consumers/source-projection.mjs";
import { MonitorError } from "./errors.mjs";
import { receiversFromConfig } from "./receivers.mjs";
import { createMonitor } from "./service.mjs";
import { openFileStore } from "./store.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new MonitorError(`unexpected argument ${token}`, { code: "bad_args" });
    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) flags[key] = true;
    else {
      flags[key] = value;
      index += 1;
    }
  }
  return { command, flags };
}

async function readJson(file, label) {
  if (!file || file === true) throw new MonitorError(`${label} file is required`, { code: "bad_args" });
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new MonitorError(`${label} file is not readable JSON`, { code: "bad_json" });
  }
}

function exitForObserve(result) {
  if (result.outcome === "paused" || result.outcome === "cancelled" || result.outcome === "expired" || result.outcome === "budget_exhausted") {
    return 3;
  }
  return 0;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === "help") {
    print({
      commands: ["gate", "subscribe", "observe", "fetch", "seed", "correct", "fail", "deliver", "reconcile", "ack", "pause", "resume", "cancel", "revise", "receipt", "show", "run"],
      exits: { ok: 0, rejected: 2, admissionRefused: 3, deliveryUnknown: 4 },
    });
    return 0;
  }
  if (command === "gate") {
    print({ releaseGate: releaseGateIdentity });
    return 0;
  }
  if (!flags.state) throw new MonitorError("--state is required", { code: "bad_args" });
  const clock = flags.now ? frozenClock(flags.now) : systemClock();
  const store = await openFileStore(flags.state);
  const receivers = flags.receivers ? receiversFromConfig(await readJson(flags.receivers, "receivers")) : {};
  const monitor = createMonitor({ store, clock, receivers });

  if (command === "subscribe") {
    const input = await readJson(flags.file, "subscription");
    print(await monitor.subscribe(input));
    return 0;
  }
  if (command === "observe") {
    const document = await readJson(flags.file, "observation");
    const observed = await monitor.observe({ subscriptionId: required(flags, "subscription"), document });
    print(observed);
    return exitForObserve(observed);
  }
  if (command === "fetch") {
    const subscriptionId = required(flags, "subscription");
    const state = await monitor.read();
    const subscription = state.subscriptions[subscriptionId];
    if (!subscription) throw new MonitorError("subscription not found", { code: "unknown_subscription" });
    if (subscription.source.kind !== "source-projection") {
      throw new MonitorError("fetch reads the public observatory snapshot for a source-projection subscription", {
        code: "invalid_subscription",
      });
    }
    const reading = await readMaintainedProjection({ now: () => clock.now() });
    const observed = reading.projection
      ? await monitor.observe({ subscriptionId, document: reading })
      : await monitor.observe({
          subscriptionId,
          document: {
            capture: reading.capture,
            integration: "maintained",
            status: "source_failure",
            failureCode: reading.failureCode,
            reason: reading.reason,
            fetch: reading.fetch,
            projection: null,
            publicSourceChanged: false,
          },
        });
    const publicSourceChanged = reading.capture === "live" && observed.outcome === "content_changed";
    print({
      observed,
      capture: reading.capture,
      integration: reading.integration,
      publicInput: reading.fetch?.url ?? null,
      httpStatus: reading.fetch?.httpStatus ?? null,
      failureKind: reading.fetch?.failureKind ?? null,
      publicSourceChanged,
      marketWideTraffic: null,
      combinedActivity: null,
      crossSourceSum: reading.crossSourceSum,
      projectionCommit: reading.provenance?.commit ?? null,
      projectionSha256: reading.provenance?.sha256 ?? null,
      projection: reading.projection,
    });
    return exitForObserve(observed);
  }
  if (command === "seed") {
    const subscriptionId = required(flags, "subscription");
    const state = await monitor.read();
    const subscription = state.subscriptions[subscriptionId];
    if (!subscription || subscription.source.kind !== "source-projection") {
      throw new MonitorError("seed requires a source-projection subscription", { code: "invalid_subscription" });
    }
    const sourceId = subscription.source.scope.slice("source-projection:".length);
    const live = await readJson(flags.from, "projection");
    const seeded = seedMeaningfulMutation(live, {
      sourceId,
      key: required(flags, "key"),
      now: clock.now(),
    });
    const observed = await monitor.observe({ subscriptionId, document: seeded });
    print({
      observed,
      capture: "seeded",
      publicSourceChanged: false,
      naturalCustomerDemand: false,
      mutation: seeded.mutation,
      marketWideTraffic: null,
      combinedActivity: null,
      projection: seeded.projection,
    });
    return exitForObserve(observed);
  }
  if (command === "correct") {
    const document = await readJson(flags.file, "correction");
    const corrected = await monitor.correct({
      subscriptionId: required(flags, "subscription"),
      correctsEvidenceId: required(flags, "evidence"),
      document,
    });
    print(corrected);
    return exitForObserve(corrected);
  }
  if (command === "run") {
    const document = await readJson(flags.file, "observation");
    const observed = await monitor.observe({ subscriptionId: required(flags, "subscription"), document });
    const deliveries = flags.deliver === true
      ? await monitor.deliver({
          subscriptionId: flags.subscription,
          limit: flags.limit ? Number(flags.limit) : 10,
        })
      : [];
    const usage = await monitor.usage(flags.subscription);
    print({ observed, deliveries, usage });
    if (deliveries.some((row) => row.state === "unknown" || row.outcome === "unknown")) return 4;
    return exitForObserve(observed);
  }
  if (command === "fail") {
    const result = await monitor.observe({
      subscriptionId: required(flags, "subscription"),
      sourceFailure: { code: flags.code || "source_unreachable", message: flags.message || null },
    });
    print(result);
    return exitForObserve(result);
  }
  if (command === "deliver") {
    const deliveries = await monitor.deliver({
      subscriptionId: flags.subscription || null,
      eventId: flags.event && flags.event !== true ? flags.event : null,
      limit: flags.limit ? Number(flags.limit) : 10,
    });
    print({ deliveries });
    return deliveries.some((row) => row.state === "unknown" || row.outcome === "unknown") ? 4 : 0;
  }
  if (command === "reconcile") {
    const reconciled = await monitor.reconcile({
      subscriptionId: flags.subscription || null,
      limit: flags.limit ? Number(flags.limit) : 10,
    });
    print({ reconciled });
    return reconciled.some((row) => row.state === "unknown") ? 4 : 0;
  }
  if (command === "ack") {
    print(await monitor.acknowledge({ eventId: required(flags, "event"), by: required(flags, "by"), note: flags.note || null }));
    return 0;
  }
  if (command === "pause") {
    print(await monitor.pause(required(flags, "subscription")));
    return 0;
  }
  if (command === "resume") {
    print(await monitor.resume(required(flags, "subscription")));
    return 0;
  }
  if (command === "cancel") {
    print(await monitor.cancel(required(flags, "subscription")));
    return 0;
  }
  if (command === "revise") {
    const patch = await readJson(flags.file, "revision");
    print(await monitor.revise(required(flags, "subscription"), patch));
    return 0;
  }
  if (command === "receipt") {
    print(await monitor.usage(required(flags, "subscription")));
    return 0;
  }
  if (command === "show") {
    const state = await monitor.read();
    const event = state.events[required(flags, "event")];
    if (!event) throw new MonitorError("event not found", { code: "unknown_event" });
    print({
      event,
      delivery: state.deliveries[event.eventId] ?? null,
      acknowledgement: state.acknowledgements[event.eventId] ?? null,
    });
    return 0;
  }
  throw new MonitorError(`unknown command ${command}`, { code: "bad_args" });
}

function required(flags, key) {
  if (!flags[key] || flags[key] === true) throw new MonitorError(`--${key} is required`, { code: "bad_args" });
  return flags[key];
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const payload = {
      error: error instanceof Error ? error.message : "failed",
      code: error instanceof MonitorError ? error.code : "failed",
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = error instanceof MonitorError && (error.code === "bad_args" || error.code === "bad_json" || error.code === "url_rejected" || error.code === "invalid_subscription" || error.code === "unknown_receiver" || error.code === "bad_receiver") ? 2 : 1;
  });
