import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { createMonitor, frozenClock, openFileStore } from "../src/index.mjs";
import { projectionIntegration, releaseReceipt } from "../src/index.mjs";
import {
  acceptedRelease,
  BINDING,
  cliPath,
  heldRelease,
  LATER,
  NOW,
  packageRoot,
  releaseSubscription,
  routeDecision,
  routeLockDescriptor,
  startLocalReceiver,
  tempDir,
} from "./support.mjs";

function runNode(args, cwd = packageRoot) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd });
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

test("real release-gate receipts move through delivery, ack, restart, and cancel", async () => {
  const dir = await tempDir("change-monitor-scenario-");
  const receiver = await startLocalReceiver();
  const clock = frozenClock(NOW);
  try {
    const held = heldRelease(NOW);
    const heldLater = heldRelease("2026-09-30T12:05:00.000Z");
    const accepted = acceptedRelease("2026-09-30T12:30:00.000Z");
    assert.equal(held.schema, "release-gate.receipt.v1");
    assert.equal(held.verdict, "held");
    assert.equal(accepted.verdict, "accepted");
    assert.notEqual(held.generatedAt, heldLater.generatedAt);
    assert.equal(projectionIntegration.status, "maintained");
    assert.equal(projectionIntegration.tipIncludesS12Writer, false);
    assert.equal(projectionIntegration.publicInput, "https://samedaydesk.com/api/observatory/snapshot");

    const open = async () => createMonitor({
      store: await openFileStore(dir.file),
      clock,
      receivers: { "local-vm": { kind: "local-http", baseUrl: receiver.baseUrl } },
    });
    const monitor = await open();
    await monitor.subscribe(releaseSubscription());
    const baseline = await monitor.observe({ subscriptionId: "rg-route-lock", document: held });
    assert.equal(baseline.outcome, "baseline_established");
    const unchanged = await monitor.observe({ subscriptionId: "rg-route-lock", document: heldLater });
    assert.equal(unchanged.outcome, "unchanged");
    const changed = await monitor.observe({ subscriptionId: "rg-route-lock", document: accepted });
    assert.equal(changed.outcome, "content_changed");
    assert.equal(changed.admitted, true);
    const delivered = await monitor.deliver();
    assert.equal(delivered[0].state, "accepted");
    assert.equal(receiver.events.size, 1);
    const stored = receiver.events.get(changed.eventId);
    assert.equal(stored.idempotencyKey, changed.eventId);
    assert.equal(stored.transition, "content_changed");
    assert.equal(stored.material.verdict, "accepted");
    assert.equal(stored.task.rerun, true);
    const ack = await monitor.acknowledge({ eventId: changed.eventId, by: "remote-vm" });
    assert.equal(ack.acknowledgement.provenance.transition, "content_changed");

    const restarted = await open();
    const afterRestart = await restarted.read();
    assert.equal(afterRestart.events[changed.eventId].material.verdict, "accepted");
    assert.equal(afterRestart.deliveries[changed.eventId].state, "accepted");
    assert.equal(afterRestart.acknowledgements[changed.eventId].acknowledgedBy, "remote-vm");
    await restarted.cancel("rg-route-lock");
    const again = await open();
    const refused = await again.observe({ subscriptionId: "rg-route-lock", document: held });
    assert.equal(refused.outcome, "cancelled");
    const finalState = await again.read();
    assert.equal(finalState.subscriptions["rg-route-lock"].status, "cancelled");
    assert.equal(finalState.events[changed.eventId].idempotencyKey, changed.eventId);
    assert.equal(Object.keys(finalState.events).length, 1);
    const usage = await again.usage("rg-route-lock");
    assert.equal(usage.unchanged >= 1, true);
    assert.equal(usage.usefulEvents, 1);
    assert.equal(usage.cost.billable, false);
    assert.equal(usage.cost.price, null);
    const cold = await runNode([
      path.join(packageRoot, "examples/cold-consumer.mjs"),
      "--state",
      dir.file,
      "--subscription",
      "rg-route-lock",
      "--now",
      NOW,
    ]);
    assert.equal(cold.code, 0, cold.stderr);
    const coldBody = JSON.parse(cold.stdout);
    assert.equal(coldBody.events[0].eventId, changed.eventId);
    assert.equal(coldBody.events[0].delivery, "accepted");
    assert.equal(coldBody.usage.cost.paidSubscriptionActivated, false);
    assert.equal(releaseReceipt({
      descriptor: { ...routeLockDescriptor, revocation: { revokedAt: NOW } },
      evidence: { observations: {} },
      generatedAt: NOW,
    }).verdict, "revoked");
  } finally {
    await receiver.close();
    await dir.cleanup();
  }
});

test("loopback receiver preserves lost replies and source recovery", async () => {
  const dir = await tempDir("change-monitor-loss-");
  const receiver = await startLocalReceiver();
  const clock = frozenClock(NOW);
  try {
    const monitor = createMonitor({
      store: await openFileStore(dir.file),
      clock,
      receivers: { "local-vm": { kind: "local-http", baseUrl: receiver.baseUrl } },
    });
    await monitor.subscribe({
      ...releaseSubscription("route-1"),
      source: { kind: "route-lock", scope: `route-lock:decision:${BINDING}` },
    });
    await monitor.observe({ subscriptionId: "route-1", document: routeDecision() });
    const changed = await monitor.observe({
      subscriptionId: "route-1",
      document: routeDecision({ decision: "skip", digest: "digest-b", at: "2026-09-30T12:10:00.000Z" }),
    });
    receiver.setMode("lose");
    const lost = await monitor.deliver();
    assert.equal(lost[0].state, "unknown");
    assert.equal(lost[0].outcome, "unknown");
    assert.equal(lost[0].delivered, false);
    assert.equal(receiver.events.size, 1);
    const reconciled = await monitor.reconcile();
    assert.equal(reconciled[0].state, "accepted");
    assert.equal(Object.keys((await monitor.read()).events).length, 1);

    receiver.setMode("drop");
    const second = await monitor.observe({
      subscriptionId: "route-1",
      document: routeDecision({ decision: "review", digest: "digest-c", status: 200 }),
    });
    const dropped = await monitor.deliver();
    assert.equal(dropped[0].state, "unknown");
    assert.equal(dropped[0].delivered, false);
    const absent = await monitor.reconcile();
    assert.equal(absent[0].state, "pending");
    assert.notEqual((await monitor.read()).deliveries[second.eventId].state, "accepted");
    const retried = await monitor.deliver();
    assert.equal(retried[0].state, "accepted");
    assert.equal(retried[0].delivered, true);

    const failed = await monitor.observe({ subscriptionId: "route-1", sourceFailure: { code: "source_unreachable" } });
    assert.equal(failed.evidenceClass, "source_failure");
    const repeated = await monitor.observe({ subscriptionId: "route-1", sourceFailure: { code: "source_unreachable" } });
    assert.equal(repeated.outcome, "unchanged");
    const restored = await monitor.observe({
      subscriptionId: "route-1",
      document: routeDecision({ decision: "review", digest: "digest-c", status: 200, at: "2026-09-30T12:40:00.000Z" }),
    });
    assert.equal(restored.outcome, "service_restored");
    receiver.setMode("fail");
    const before = structuredClone((await monitor.read()).events[second.eventId]);
    const rejected = await monitor.deliver({ subscriptionId: "route-1" });
    const rejectedRow = rejected.find((row) => row.eventId === failed.eventId);
    assert.equal(rejectedRow.state, "failed");
    assert.equal(rejectedRow.delivered, false);
    const corrected = await monitor.correct({
      subscriptionId: "route-1",
      correctsEvidenceId: failed.evidenceId,
      document: routeDecision({ decision: "lockable", digest: "digest-d" }),
    });
    const after = await monitor.read();
    assert.equal(after.deliveries[failed.eventId].state, "failed");
    assert.deepEqual(after.events[second.eventId], before);
    assert.equal(after.events[corrected.eventId].correctsEvidenceId, failed.evidenceId);
    assert.notEqual(after.deliveries[corrected.eventId].state, "accepted");
    assert.equal(after.deliveries[corrected.eventId].delivered, false);
    assert.equal(after.deliveries[failed.eventId].delivered, false);
  } finally {
    await receiver.close();
    await dir.cleanup();
  }
});

test("two file-store consumers and a changed destination keep one obligation", async () => {
  const dir = await tempDir("change-monitor-race-");
  const primary = await startLocalReceiver();
  const secondary = await startLocalReceiver();
  const clock = frozenClock(NOW);
  try {
    const receivers = {
      "local-vm": { kind: "local-http", baseUrl: primary.baseUrl },
      "local-b": { kind: "local-http", baseUrl: secondary.baseUrl },
    };
    const first = createMonitor({ store: await openFileStore(dir.file), clock, receivers });
    const second = createMonitor({ store: await openFileStore(dir.file), clock, receivers });
    await first.subscribe(releaseSubscription());
    await first.observe({ subscriptionId: "rg-route-lock", document: heldRelease() });
    const [left, right] = await Promise.all([
      first.observe({ subscriptionId: "rg-route-lock", document: acceptedRelease() }),
      second.observe({ subscriptionId: "rg-route-lock", document: acceptedRelease("2026-09-30T12:31:00.000Z") }),
    ]);
    assert.deepEqual([left.outcome, right.outcome].sort(), ["content_changed", "unchanged"]);
    const state = await first.read();
    const [event] = Object.values(state.events);
    assert.equal(event.destination.receiverId, "local-vm");
    await first.revise("rg-route-lock", { destination: { receiverId: "local-b" } });
    await first.deliver();
    assert.equal(primary.events.size, 1);
    assert.equal(secondary.events.size, 0);
    assert.equal(primary.events.get(event.eventId).subscriptionRevision, 1);
    const usage = await first.usage("rg-route-lock");
    assert.equal(usage.budget.remaining, 19);
    assert.equal(usage.cost.sku, null);
    assert.ok(LATER);
  } finally {
    await primary.close();
    await secondary.close();
    await dir.cleanup();
  }
});

