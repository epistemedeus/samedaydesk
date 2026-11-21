import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDeliveryResponse,
  createMemoryStore,
  createMonitor,
  digestJson,
  eventIdFor,
  frozenClock,
  MonitorError,
  releaseReceipt,
} from "../src/index.mjs";
import {
  BINDING,
  handReceipt,
  LATER,
  NOW,
  projectionDocument,
  releaseSubscription,
  routeDecision,
} from "./support.mjs";

function harness(overrides = {}) {
  const clock = frozenClock(NOW);
  const remote = new Map();
  const behaviors = [];
  let reconcileDown = false;
  const store = createMemoryStore();
  const monitor = createMonitor({
    store,
    clock,
    receivers: {
      "local-vm": {
        kind: "injected",
        async send(event) {
          const behavior = behaviors.shift() || "accept";
          if (behavior === "lose") {
            remote.set(event.idempotencyKey, event);
            return { outcome: "unknown", httpStatus: null, error: "send_failed" };
          }
          if (behavior === "drop") return { outcome: "unknown", httpStatus: null, error: "send_failed" };
          if (behavior === "fail") return { outcome: "failed", httpStatus: 422, error: "rejected" };
          const duplicate = remote.has(event.idempotencyKey);
          remote.set(event.idempotencyKey, event);
          return { outcome: duplicate ? "duplicate" : "accepted", httpStatus: 200, error: null };
        },
        async reconcile(key) {
          if (reconcileDown) return { outcome: "unknown", httpStatus: null, error: "reconcile_failed" };
          if (!remote.has(key)) return { outcome: "absent", httpStatus: 404, error: null };
          return { outcome: "accepted", httpStatus: 200, error: null };
        },
      },
      "local-b": {
        kind: "injected",
        async send(event) {
          remote.set(`b:${event.idempotencyKey}`, event);
          return { outcome: "accepted", httpStatus: 200, error: null };
        },
      },
    },
  });
  return {
    clock,
    store,
    monitor,
    remote,
    behaviors,
    setReconcileDown(value) {
      reconcileDown = value;
    },
    ...overrides,
  };
}

async function subscribeRelease(monitor, patch = {}) {
  return monitor.subscribe({ ...releaseSubscription(), ...patch });
}

function eventsOf(state) {
  return Object.values(state.events);
}

test("canonical digest ignores key insertion order", () => {
  assert.equal(digestJson({ b: 1, a: { d: 2, c: 3 } }), digestJson({ a: { c: 3, d: 2 }, b: 1 }));
});

test("classifyDeliveryResponse does not invent success", () => {
  const key = "abc";
  assert.equal(classifyDeliveryResponse(200, { accepted: true, idempotencyKey: key }, key).outcome, "accepted");
  assert.equal(classifyDeliveryResponse(200, { accepted: true, duplicate: true, idempotencyKey: key }, key).outcome, "duplicate");
  assert.equal(classifyDeliveryResponse(200, { accepted: true }, key).outcome, "unknown");
  assert.equal(classifyDeliveryResponse(200, { accepted: true, idempotencyKey: "other" }, key).outcome, "unknown");
  assert.equal(classifyDeliveryResponse(200, null, key).outcome, "unknown");
  assert.equal(classifyDeliveryResponse(422, { accepted: false, idempotencyKey: key, error: "rejected" }, key).outcome, "failed");
  assert.equal(classifyDeliveryResponse(503, { error: "down" }, key).outcome, "unknown");
  assert.equal(classifyDeliveryResponse(404, { found: false }, key).outcome, "failed");
});

test("subscription JSON cannot name an outbound URL", async () => {
  const { monitor } = harness();
  await assert.rejects(
    () => monitor.subscribe({
      ...releaseSubscription(),
      destination: { receiverId: "local-vm", url: "http://203.0.113.10/hook" },
    }),
    (error) => error instanceof MonitorError && error.code === "url_rejected",
  );
  const state = await monitor.read();
  assert.equal(Object.keys(state.subscriptions).length, 0);
});

test("baseline, unchanged prose, content change, and oscillation", async () => {
  const { monitor } = harness();
  await subscribeRelease(monitor);
  const baseline = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW, { reason: "one" }) });
  assert.equal(baseline.outcome, "baseline_established");
  const same = await monitor.observe({
    subscriptionId: "rg-route-lock",
    document: handReceipt("held", "2026-09-30T12:05:00.000Z", { reason: "two", awaiting: "different prose", surfaceReason: "other prose" }),
  });
  assert.equal(same.outcome, "unchanged");
  const changed = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", "2026-09-30T12:06:00.000Z") });
  assert.equal(changed.outcome, "content_changed");
  assert.equal(changed.admitted, true);
  const replay = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", "2026-09-30T12:07:00.000Z") });
  assert.equal(replay.outcome, "unchanged");
  const back = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", "2026-09-30T12:08:00.000Z") });
  const again = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", "2026-09-30T12:09:00.000Z") });
  const state = await monitor.read();
  const events = eventsOf(state);
  assert.equal(events.length, 3);
  assert.equal(new Set(events.map((event) => event.eventId)).size, 3);
  assert.equal(state.usage["rg-route-lock"].unchanged >= 2, true);
  assert.equal(state.usage["rg-route-lock"].usefulEvents, 3);
  assert.equal(state.usage["rg-route-lock"].baselinesEstablished, 1);
  for (const event of events) {
    assert.equal(event.eventId, event.idempotencyKey);
    assert.equal(event.eventId, eventIdFor(event.identity));
  }
  assert.equal(back.admitted, true);
  assert.equal(again.admitted, true);
  const usage = await monitor.usage("rg-route-lock");
  assert.equal(usage.cost.billable, false);
  assert.equal(usage.cost.price, null);
  assert.equal(usage.cost.sku, null);
  assert.equal(usage.cost.paidSubscriptionActivated, false);
  assert.equal(usage.cost.quantity, 3);
});

test("stale and missing route-lock evidence are not content changes", async () => {
  const { monitor } = harness();
  await monitor.subscribe({
    ...releaseSubscription("route-1"),
    source: { kind: "route-lock", scope: `route-lock:decision:${BINDING}` },
  });
  const baseline = await monitor.observe({ subscriptionId: "route-1", document: routeDecision() });
  assert.equal(baseline.outcome, "baseline_established");
  const clockOnly = await monitor.observe({
    subscriptionId: "route-1",
    document: routeDecision({ at: "2026-09-30T12:04:00.000Z", observedAt: "2026-09-30T12:01:00.000Z" }),
  });
  assert.equal(clockOnly.outcome, "unchanged");
  const stale = await monitor.observe({
    subscriptionId: "route-1",
    document: routeDecision({ fresh: false, decision: "skip", at: "2026-09-30T12:10:00.000Z" }),
  });
  assert.equal(stale.outcome, "evidence_unavailable");
  assert.equal(stale.evidenceClass, "stale");
  const missing = await monitor.observe({
    subscriptionId: "route-1",
    document: routeDecision({ present: false, decision: "skip" }),
  });
  assert.equal(missing.evidenceClass, "missing");
  const state = await monitor.read();
  assert.equal(eventsOf(state).every((event) => event.transition !== "content_changed"), true);
  assert.equal(state.evidence[stale.evidenceId].material, null);
  assert.equal(state.subscriptions["route-1"].baseline.materialDigest, state.evidence[baseline.evidenceId].materialDigest);
  const restoredDifferent = await monitor.observe({
    subscriptionId: "route-1",
    document: routeDecision({ decision: "skip", digest: "digest-b" }),
  });
  assert.equal(restoredDifferent.outcome, "content_changed");
  const restoredEvent = (await monitor.read()).events[restoredDifferent.eventId];
  assert.equal(restoredEvent.serviceRestored, true);
  assert.equal(restoredEvent.material.decision, "skip");
});

test("source failure, repeat, and service restoration", async () => {
  const { monitor } = harness();
  await subscribeRelease(monitor);
  const baseline = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
  const failed = await monitor.observe({ subscriptionId: "rg-route-lock", sourceFailure: { code: "source_unreachable", message: "socket reset" } });
  assert.equal(failed.outcome, "evidence_unavailable");
  assert.equal(failed.evidenceClass, "source_failure");
  const again = await monitor.observe({ subscriptionId: "rg-route-lock", sourceFailure: { code: "source_unreachable", message: "different text" } });
  assert.equal(again.outcome, "unchanged");
  const restored = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", "2026-09-30T12:20:00.000Z") });
  assert.equal(restored.outcome, "service_restored");
  const state = await monitor.read();
  assert.equal(state.subscriptions["rg-route-lock"].baseline.materialDigest, state.evidence[baseline.evidenceId].materialDigest);
  assert.equal(state.events[restored.eventId].task.rerun, true);
  assert.equal(state.events[failed.eventId].task.rerun, false);
  assert.equal(state.events[failed.eventId].material, null);
});

test("incomparable schema and unavailable zero are not content changes", async () => {
  const { monitor } = harness();
  await monitor.subscribe({
    ...releaseSubscription("projection-moltjobs"),
    source: { kind: "source-projection", scope: "source-projection:moltjobs" },
  });
  const baseline = await monitor.observe({ subscriptionId: "projection-moltjobs", document: projectionDocument({ value: 4 }) });
  assert.equal(baseline.outcome, "baseline_established");
  const zero = await monitor.observe({
    subscriptionId: "projection-moltjobs",
    document: projectionDocument({ value: 0, availability: "unavailable", coverage: null, fetchedAt: "2026-09-30T12:10:00.000Z" }),
  });
  assert.equal(zero.outcome, "evidence_unavailable");
  assert.equal(zero.evidenceClass, "missing");
  const pending = await monitor.observe({
    subscriptionId: "projection-moltjobs",
    document: { integration: "pending", schemaVersion: "pilot.external-observatory.v1", reason: "not published" },
  });
  assert.equal(pending.evidenceClass, "missing");
  const partial = await monitor.observe({
    subscriptionId: "projection-moltjobs",
    document: projectionDocument({ availability: "partial", coverage: { status: "partial", comparable: false } }),
  });
  assert.equal(partial.evidenceClass, "incomparable");
  const wrong = await monitor.observe({
    subscriptionId: "projection-moltjobs",
    document: { schemaVersion: "other.v9", sourceId: "moltjobs", availability: "ok" },
  });
  assert.equal(wrong.evidenceClass, "incomparable");
  const state = await monitor.read();
  assert.equal(eventsOf(state).some((event) => event.transition === "content_changed"), false);
  assert.equal(state.evidence[zero.evidenceId].material, null);
  assert.equal(JSON.stringify(state.evidence[zero.evidenceId]).includes('"value":0'), false);
  const realZero = await monitor.observe({
    subscriptionId: "projection-moltjobs",
    document: projectionDocument({ value: 0, fetchedAt: "2026-09-30T12:40:00.000Z" }),
  });
  assert.equal(realZero.outcome, "content_changed");
  assert.equal((await monitor.read()).events[realZero.eventId].material.metrics[0].value, 0);
});

test("fetchedAt and provider timestamp do not mint a projection event", async () => {
  const { monitor } = harness();
  await monitor.subscribe({
    ...releaseSubscription("projection-moltjobs"),
    source: { kind: "source-projection", scope: "source-projection:moltjobs" },
  });
  await monitor.observe({ subscriptionId: "projection-moltjobs", document: projectionDocument({ value: 4 }) });
  const clockOnly = await monitor.observe({
    subscriptionId: "projection-moltjobs",
    document: projectionDocument({
      value: 4,
      fetchedAt: "2026-09-30T18:00:00.000Z",
      providerTimestamp: "2026-09-30T17:00:00.000Z",
    }),
  });
  assert.equal(clockOnly.outcome, "unchanged");
  const changed = await monitor.observe({
    subscriptionId: "projection-moltjobs",
    document: projectionDocument({ value: 9, fetchedAt: "2026-09-30T18:05:00.000Z" }),
  });
  assert.equal(changed.outcome, "content_changed");
  const material = (await monitor.read()).events[changed.eventId].material;
  assert.equal(material.metrics[0].value, 9);
  assert.equal(material.totalAgentEconomy, undefined);
});

test("budget suppresses the next useful event without recording it", async () => {
  const { monitor } = harness();
  await subscribeRelease(monitor, { budget: { maxUsefulEvents: 1 } });
  await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
  const first = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", NOW) });
  assert.equal(first.admitted, true);
  const blocked = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("gated", NOW) });
  assert.equal(blocked.outcome, "budget_exhausted");
  const state = await monitor.read();
  assert.equal(eventsOf(state).length, 1);
  assert.equal(state.subscriptions["rg-route-lock"].baseline.evidenceId, first.evidenceId);
});

test("revision rebinds later events and keeps the earlier receipt", async () => {
  const { monitor } = harness();
  await subscribeRelease(monitor);
  await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
  const first = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", NOW) });
  const before = structuredClone((await monitor.read()).events[first.eventId]);
  const revised = await monitor.revise("rg-route-lock", { comparison: { policy: "material-fields", materialFields: ["verdict"] } });
  assert.equal(revised.baselineReset, true);
  assert.equal(revised.subscription.revision, 2);
  assert.equal(revised.subscription.baseline, null);
  const rebaseline = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", "2026-09-30T12:11:00.000Z", { summary: { pass: 9, hold: 0, gate: 0, wait: 0, unavailable_ok: 0 } }) });
  assert.equal(rebaseline.outcome, "baseline_established");
  const summaryOnly = await monitor.observe({
    subscriptionId: "rg-route-lock",
    document: handReceipt("accepted", "2026-09-30T12:12:00.000Z", { summary: { pass: 1, hold: 4, gate: 0, wait: 0, unavailable_ok: 0 } }),
  });
  assert.equal(summaryOnly.outcome, "unchanged");
  const next = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", "2026-09-30T12:13:00.000Z") });
  const state = await monitor.read();
  assert.deepEqual(state.events[first.eventId], before);
  assert.equal(state.events[first.eventId].subscriptionRevision, 1);
  assert.equal(state.events[next.eventId].subscriptionRevision, 2);
  assert.equal(state.events[next.eventId].material.surfaces, undefined);
  assert.notEqual(first.eventId, next.eventId);
  await assert.rejects(
    () => monitor.revise("rg-route-lock", { comparison: { policy: "material-fields", materialFields: ["generatedAt"] } }),
    (error) => error.code === "invalid_subscription",
  );
  await assert.rejects(
    () => monitor.revise("rg-route-lock", { budget: { maxUsefulEvents: 1 } }),
    (error) => error.code === "budget_decrease",
  );
});

test("pause, cancel, and expiry stop admission and keep admitted events", async () => {
  const { monitor, clock } = harness();
  await subscribeRelease(monitor, { expiresAt: "2026-09-30T13:00:00.000Z" });
  await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
  const changed = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", NOW) });
  const snapshot = structuredClone((await monitor.read()).events[changed.eventId]);
  await monitor.pause("rg-route-lock");
  const paused = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("gated", NOW) });
  assert.equal(paused.outcome, "paused");
  await monitor.resume("rg-route-lock");
  await monitor.cancel("rg-route-lock");
  const cancelled = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("gated", NOW) });
  assert.equal(cancelled.outcome, "cancelled");
  await assert.rejects(() => monitor.resume("rg-route-lock"), (error) => error.code === "terminal");
  const state = await monitor.read();
  assert.deepEqual(state.events[changed.eventId], snapshot);
  assert.equal(state.deliveries[changed.eventId].state, "pending");
  assert.equal(state.deliveries[changed.eventId].delivered, false);
  assert.equal(state.subscriptions["rg-route-lock"].status, "cancelled");

  const second = harness();
  await subscribeRelease(second.monitor, { subscriptionId: "expiring", expiresAt: "2026-09-30T13:00:00.000Z" });
  await second.monitor.observe({ subscriptionId: "expiring", document: handReceipt("held", NOW) });
  const live = await second.monitor.observe({ subscriptionId: "expiring", document: handReceipt("accepted", NOW) });
  second.clock.advance(60 * 60 * 1000);
  const expired = await second.monitor.observe({ subscriptionId: "expiring", document: handReceipt("gated", NOW) });
  assert.equal(expired.outcome, "expired");
  const after = await second.monitor.read();
  assert.equal(after.subscriptions.expiring.status, "expired");
  assert.ok(after.events[live.eventId]);
  const delivered = await second.monitor.deliver({ subscriptionId: "expiring" });
  assert.equal(delivered[0].state, "accepted");
  assert.equal(clock.now(), NOW);
});

test("unknown delivery is reconciled, failed delivery stays failed, correction keeps provenance", async () => {
  const { monitor, behaviors, remote, setReconcileDown } = harness();
  await subscribeRelease(monitor);
  await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
  const changed = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", NOW) });
  behaviors.push("lose");
  const lost = await monitor.deliver();
  assert.equal(lost[0].state, "unknown");
  assert.equal(remote.has(changed.eventId), true);
  setReconcileDown(true);
  const stillUnknown = await monitor.reconcile();
  assert.equal(stillUnknown[0].state, "unknown");
  setReconcileDown(false);
  const found = await monitor.reconcile();
  assert.equal(found[0].state, "accepted");
  const ack = await monitor.acknowledge({ eventId: changed.eventId, by: "cold-consumer", note: "reran" });
  assert.equal(ack.acknowledgement.provenance.evidenceId, changed.evidenceId);
  const ackAgain = await monitor.acknowledge({ eventId: changed.eventId, by: "other" });
  assert.equal(ackAgain.replay, true);
  assert.equal(ackAgain.acknowledgement.acknowledgedBy, "cold-consumer");

  behaviors.push("drop");
  const next = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("gated", NOW) });
  await monitor.deliver();
  assert.equal((await monitor.read()).deliveries[next.eventId].state, "unknown");
  const absent = await monitor.reconcile();
  assert.equal(absent[0].state, "pending");
  await monitor.deliver();
  assert.equal((await monitor.read()).deliveries[next.eventId].state, "accepted");

  behaviors.push("fail");
  const third = await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("revoked", NOW) });
  await monitor.deliver();
  const before = structuredClone((await monitor.read()).events[third.eventId]);
  await assert.rejects(
    () => monitor.acknowledge({ eventId: third.eventId, by: "cold-consumer" }),
    (error) => error.code === "ack_not_accepted",
  );
  const corrected = await monitor.correct({
    subscriptionId: "rg-route-lock",
    correctsEvidenceId: third.evidenceId,
    document: handReceipt("held", "2026-09-30T12:30:00.000Z"),
  });
  const after = await monitor.read();
  assert.deepEqual(after.events[third.eventId], before);
  assert.equal(after.deliveries[third.eventId].state, "failed");
  assert.equal(after.evidence[third.evidenceId].material.verdict, "revoked");
  assert.notEqual(corrected.eventId, third.eventId);
  assert.equal(after.events[corrected.eventId].correctsEvidenceId, third.evidenceId);
  assert.equal(after.corrections.length, 1);
});

test("concurrent observers mint one logical event", async () => {
  const { monitor } = harness();
  await subscribeRelease(monitor);
  await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
  const [left, right] = await Promise.all([
    monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", NOW) }),
    monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("accepted", "2026-09-30T12:02:00.000Z") }),
  ]);
  const outcomes = [left.outcome, right.outcome].sort();
  assert.deepEqual(outcomes, ["content_changed", "unchanged"]);
  const state = await monitor.read();
  assert.equal(eventsOf(state).length, 1);
  assert.equal(state.deliveries[eventsOf(state)[0].eventId].state, "pending");
});

test("concurrent cancel does not erase an admitted event or resurrect the subscription", async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { monitor } = harness();
    await subscribeRelease(monitor, { subscriptionId: `race-${attempt}` });
    await monitor.observe({ subscriptionId: `race-${attempt}`, document: handReceipt("held", NOW) });
    await Promise.all([
      monitor.observe({ subscriptionId: `race-${attempt}`, document: handReceipt("accepted", NOW) }),
      monitor.cancel(`race-${attempt}`),
    ]);
    const state = await monitor.read();
    assert.equal(state.subscriptions[`race-${attempt}`].status, "cancelled");
    assert.ok(eventsOf(state).length <= 1);
    const again = await monitor.observe({ subscriptionId: `race-${attempt}`, document: handReceipt("gated", NOW) });
    assert.equal(again.outcome, "cancelled");
    assert.equal(eventsOf(await monitor.read()).length, eventsOf(state).length);
  }
});

test("a purchase decision is not a release-gate content change", async () => {
  const { monitor } = harness();
  await subscribeRelease(monitor);
  await monitor.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
  const foreign = await monitor.observe({ subscriptionId: "rg-route-lock", document: routeDecision() });
  assert.equal(foreign.evidenceClass, "incomparable");
  assert.equal(eventsOf(await monitor.read()).some((event) => event.transition === "content_changed"), false);
  assert.throws(
    () => releaseReceipt({ descriptor: routeDecision(), evidence: {}, generatedAt: NOW }),
    (error) => error.name === "DomainError",
  );
});

test("expiry constant is after the fixture clock", () => {
  assert.ok(Date.parse(LATER) > Date.parse(NOW));
});
