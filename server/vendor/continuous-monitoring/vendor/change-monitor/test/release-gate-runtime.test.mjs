import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acquireReleaseGate,
  assertReleaseGateArchive,
  createMemoryStore,
  createMonitor,
  frozenClock,
  MonitorError,
  releaseGateIdentity,
  releaseReceipt,
  RELEASE_GATE_PIN,
} from "../src/index.mjs";
import { NOW, releaseSubscription, routeDecision, routeLockDescriptor } from "./support.mjs";

test("the loaded runtime is public Release Gate 0.1.4, and a bad archive is refused", async () => {
  assert.equal(releaseGateIdentity.version, "0.1.4");
  assert.equal(releaseGateIdentity.sha256, RELEASE_GATE_PIN.sha256);
  assert.equal(releaseGateIdentity.receiptSchema, "release-gate.receipt.v1");
  assert.equal(releaseGateIdentity.moduleResolved, true);
  assert.equal(releaseGateIdentity.sourceCommits["samedaydesk-catalog-release-gate"], "142d0c15647d5992d339a21d4071159679f686fd");
  assert.throws(
    () => assertReleaseGateArchive(Buffer.from("not-the-archive")),
    (error) => error instanceof MonitorError && error.code === "release_gate_rejected",
  );
  const cacheDir = await mkdtemp(path.join(tmpdir(), "change-monitor-bad-gate-"));
  try {
    await assert.rejects(
      () => acquireReleaseGate({
        cacheDir,
        bytes: Buffer.from("seeded-wrong-archive"),
      }),
      (error) => error instanceof MonitorError && error.code === "release_gate_rejected",
    );
    await assert.rejects(
      () => acquireReleaseGate({
        cacheDir,
        fetchImpl: async () => ({
          status: 302,
          headers: { get: () => "https://example.invalid/release-gate.tgz" },
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      }),
      (error) => error instanceof MonitorError && error.code === "release_gate_redirect",
    );
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("denied, revoked, and wrong-source release evidence do not become an accepted launch", async () => {
  assert.throws(
    () => releaseReceipt({ descriptor: routeDecision(), evidence: {}, generatedAt: NOW }),
    (error) => error.name === "DomainError",
  );
  const wrongA = releaseReceipt({
    descriptor: routeLockDescriptor,
    evidence: {
      observations: {
        source: { status: "mismatch", evidence: { commit: "a".repeat(40) } },
        origin: { status: "absent" },
      },
    },
    generatedAt: NOW,
  });
  const wrongB = releaseReceipt({
    descriptor: routeLockDescriptor,
    evidence: {
      observations: {
        source: { status: "mismatch", evidence: { commit: "b".repeat(40) } },
        origin: { status: "absent" },
      },
    },
    generatedAt: "2026-09-30T12:05:00.000Z",
  });
  const revoked = releaseReceipt({
    descriptor: { ...routeLockDescriptor, revocation: { revokedAt: NOW } },
    evidence: { observations: {} },
    generatedAt: NOW,
  });
  assert.equal(wrongA.verdict, "held");
  assert.equal(wrongA.accepted, false);
  assert.equal(wrongA.launched, false);
  assert.equal(wrongA.ownerPayment, false);
  assert.equal(revoked.verdict, "revoked");
  assert.equal(revoked.launched, false);
  assert.equal(revoked.ownerPayment, false);

  const monitor = createMonitor({
    store: createMemoryStore(),
    clock: frozenClock(NOW),
    receivers: {
      "local-vm": {
        kind: "injected",
        async send() {
          return { outcome: "accepted", httpStatus: 200, error: null };
        },
      },
    },
  });
  await monitor.subscribe(releaseSubscription());
  const baseline = await monitor.observe({ subscriptionId: "rg-route-lock", document: wrongA });
  assert.equal(baseline.outcome, "baseline_established");
  const prose = await monitor.observe({ subscriptionId: "rg-route-lock", document: { ...wrongA, reason: "different prose" } });
  assert.equal(prose.outcome, "unchanged");
  const otherCommit = await monitor.observe({ subscriptionId: "rg-route-lock", document: wrongB });
  assert.equal(otherCommit.outcome, "unchanged");
  const denied = await monitor.observe({
    subscriptionId: "rg-route-lock",
    document: { ...wrongA, verdict: "denied", accepted: false, code: "denied" },
  });
  assert.equal(denied.evidenceClass, "incomparable");
  assert.notEqual(denied.outcome, "content_changed");
  assert.equal((await monitor.read()).evidence[denied.evidenceId].material, null);
  const changed = await monitor.observe({ subscriptionId: "rg-route-lock", document: revoked });
  assert.equal(changed.outcome, "content_changed");
  const material = (await monitor.read()).events[changed.eventId].material;
  assert.equal(material.verdict, "revoked");
  assert.equal(material.launched, false);
  assert.equal(material.ownerPayment, false);
  assert.equal(material.accepted, false);
});
