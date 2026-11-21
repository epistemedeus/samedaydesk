import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { acceptedRelease, cliPath, heldRelease, NOW, packageRoot, projectionDocument, startLocalReceiver, tempDir } from "./support.mjs";

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd: packageRoot });
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

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("cli rejects a subscription URL and a non-loopback receiver", async () => {
  const dir = await tempDir("change-monitor-cli-reject-");
  try {
    const receivers = path.join(dir.dir, "receivers.json");
    await writeJson(receivers, { "local-vm": { kind: "local-http", baseUrl: "http://127.0.0.1:9" } });
    const rejected = await runCli([
      "subscribe",
      "--state",
      dir.file,
      "--file",
      path.join(packageRoot, "examples/rejected-url-subscription.json"),
      "--receivers",
      receivers,
      "--now",
      NOW,
    ]);
    assert.equal(rejected.code, 2, rejected.stderr);
    assert.equal(JSON.parse(rejected.stderr).code, "url_rejected");
    await assert.rejects(() => access(dir.file));
    const remote = path.join(dir.dir, "remote-receivers.json");
    await writeJson(remote, { "local-vm": { kind: "local-http", baseUrl: "https://example.com/hook" } });
    const outbound = await runCli([
      "subscribe",
      "--state",
      dir.file,
      "--file",
      path.join(packageRoot, "examples/subscription.release-gate.json"),
      "--receivers",
      remote,
      "--now",
      NOW,
    ]);
    assert.equal(outbound.code, 2, outbound.stderr);
    assert.equal(JSON.parse(outbound.stderr).code, "bad_receiver");
  } finally {
    await dir.cleanup();
  }
});

test("cli one-shot delivers a real release-gate change and refuses cancel resurrection", async () => {
  const dir = await tempDir("change-monitor-cli-run-");
  const receiver = await startLocalReceiver();
  try {
    const receivers = path.join(dir.dir, "receivers.json");
    const subscription = path.join(dir.dir, "subscription.json");
    const held = path.join(dir.dir, "held.json");
    const accepted = path.join(dir.dir, "accepted.json");
    await writeJson(receivers, { "local-vm": { kind: "local-http", baseUrl: receiver.baseUrl } });
    await writeJson(subscription, {
      subscriptionId: "rg-route-lock",
      owner: "example-owner",
      source: { kind: "release-gate", scope: "release-gate:route-lock@0.1.0" },
      comparison: { policy: "material-fields" },
      destination: { receiverId: "local-vm" },
      budget: { maxUsefulEvents: 5 },
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    await writeJson(held, heldRelease(NOW));
    await writeJson(accepted, acceptedRelease());
    const subscribed = await runCli(["subscribe", "--state", dir.file, "--file", subscription, "--receivers", receivers, "--now", NOW]);
    assert.equal(subscribed.code, 0, subscribed.stderr);
    const baseline = await runCli(["observe", "--state", dir.file, "--subscription", "rg-route-lock", "--file", held, "--receivers", receivers, "--now", NOW]);
    assert.equal(baseline.code, 0, baseline.stderr);
    assert.equal(JSON.parse(baseline.stdout).outcome, "baseline_established");
    const run = await runCli([
      "run",
      "--state",
      dir.file,
      "--subscription",
      "rg-route-lock",
      "--file",
      accepted,
      "--receivers",
      receivers,
      "--deliver",
      "--now",
      NOW,
    ]);
    assert.equal(run.code, 0, run.stderr);
    const body = JSON.parse(run.stdout);
    assert.equal(body.observed.outcome, "content_changed");
    assert.equal(body.deliveries[0].state, "accepted");
    assert.equal(body.deliveries[0].delivered, true);
    assert.equal(body.usage.usefulEvents, 1);
    assert.equal(body.usage.unchanged, 0);
    assert.equal(body.usage.cost.billable, false);
    assert.equal(body.usage.cost.price, null);
    assert.equal(receiver.events.size, 1);
    const eventId = body.observed.eventId;
    const ack = await runCli(["ack", "--state", dir.file, "--event", eventId, "--by", "remote-vm", "--now", NOW]);
    assert.equal(ack.code, 0, ack.stderr);
    const cancelled = await runCli(["cancel", "--state", dir.file, "--subscription", "rg-route-lock", "--now", NOW]);
    assert.equal(cancelled.code, 0, cancelled.stderr);
    const again = await runCli(["observe", "--state", dir.file, "--subscription", "rg-route-lock", "--file", held, "--receivers", receivers, "--now", "2026-09-30T13:00:00.000Z"]);
    assert.equal(again.code, 3, again.stdout);
    assert.equal(JSON.parse(again.stdout).outcome, "cancelled");
    const shown = await runCli(["show", "--state", dir.file, "--event", eventId, "--now", NOW]);
    const shownBody = JSON.parse(shown.stdout);
    assert.equal(shownBody.event.idempotencyKey, eventId);
    assert.equal(shownBody.delivery.state, "accepted");
    assert.equal(shownBody.acknowledgement.acknowledgedBy, "remote-vm");
    const resumed = await runCli(["resume", "--state", dir.file, "--subscription", "rg-route-lock", "--now", NOW]);
    assert.notEqual(resumed.code, 0);
    const still = JSON.parse(await readFile(dir.file, "utf8"));
    assert.equal(still.subscriptions["rg-route-lock"].status, "cancelled");
    assert.equal(Object.keys(still.events).length, 1);
  } finally {
    await receiver.close();
    await dir.cleanup();
  }
});

test("two cli consumers racing share one event", async () => {
  const dir = await tempDir("change-monitor-cli-race-");
  try {
    const receivers = path.join(dir.dir, "receivers.json");
    const subscription = path.join(dir.dir, "subscription.json");
    const held = path.join(dir.dir, "held.json");
    const accepted = path.join(dir.dir, "accepted.json");
    await writeJson(receivers, { "local-vm": { kind: "local-http", baseUrl: "http://127.0.0.1:9" } });
    await writeJson(subscription, {
      subscriptionId: "rg-route-lock",
      owner: "example-owner",
      source: { kind: "release-gate", scope: "release-gate:route-lock@0.1.0" },
      comparison: { policy: "material-fields" },
      destination: { receiverId: "local-vm" },
      budget: { maxUsefulEvents: 5 },
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    await writeJson(held, heldRelease());
    await writeJson(accepted, acceptedRelease());
    assert.equal((await runCli(["subscribe", "--state", dir.file, "--file", subscription, "--receivers", receivers, "--now", NOW])).code, 0);
    assert.equal((await runCli(["observe", "--state", dir.file, "--subscription", "rg-route-lock", "--file", held, "--now", NOW])).code, 0);
    const [left, right] = await Promise.all([
      runCli(["observe", "--state", dir.file, "--subscription", "rg-route-lock", "--file", accepted, "--now", NOW]),
      runCli(["observe", "--state", dir.file, "--subscription", "rg-route-lock", "--file", accepted, "--now", NOW]),
    ]);
    assert.equal(left.code, 0, left.stderr);
    assert.equal(right.code, 0, right.stderr);
    const outcomes = [JSON.parse(left.stdout).outcome, JSON.parse(right.stdout).outcome].sort();
    assert.deepEqual(outcomes, ["content_changed", "unchanged"]);
    const state = JSON.parse(await readFile(dir.file, "utf8"));
    assert.equal(Object.keys(state.events).length, 1);
  } finally {
    await dir.cleanup();
  }
});

test("cli treats an unavailable zero as missing evidence", async () => {
  const dir = await tempDir("change-monitor-cli-zero-");
  try {
    const receivers = path.join(dir.dir, "receivers.json");
    const subscription = path.join(dir.dir, "subscription.json");
    const baseline = path.join(dir.dir, "baseline.json");
    await writeJson(receivers, { "local-vm": { kind: "local-http", baseUrl: "http://127.0.0.1:9" } });
    await writeJson(subscription, {
      subscriptionId: "projection-moltjobs",
      owner: "example-owner",
      source: { kind: "source-projection", scope: "source-projection:moltjobs" },
      comparison: { policy: "material-fields" },
      destination: { receiverId: "local-vm" },
      budget: { maxUsefulEvents: 5 },
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    await writeJson(baseline, projectionDocument({ value: 4 }));
    assert.equal((await runCli(["subscribe", "--state", dir.file, "--file", subscription, "--receivers", receivers, "--now", NOW])).code, 0);
    const established = await runCli(["observe", "--state", dir.file, "--subscription", "projection-moltjobs", "--file", baseline, "--now", NOW]);
    assert.equal(JSON.parse(established.stdout).outcome, "baseline_established");
    const zero = await runCli([
      "observe",
      "--state",
      dir.file,
      "--subscription",
      "projection-moltjobs",
      "--file",
      path.join(packageRoot, "examples/unavailable-not-zero.json"),
      "--now",
      NOW,
    ]);
    assert.equal(zero.code, 0, zero.stderr);
    const body = JSON.parse(zero.stdout);
    assert.equal(body.outcome, "evidence_unavailable");
    assert.equal(body.evidenceClass, "missing");
    const state = JSON.parse(await readFile(dir.file, "utf8"));
    assert.equal(Object.values(state.events).some((event) => event.transition === "content_changed"), false);
    assert.equal(state.evidence[body.evidenceId].material, null);
    const receipt = await runCli(["receipt", "--state", dir.file, "--subscription", "projection-moltjobs", "--now", NOW]);
    const usage = JSON.parse(receipt.stdout);
    assert.equal(usage.contentChanged, 0);
    assert.equal(usage.cost.price, null);
    assert.equal(usage.cost.paidSubscriptionActivated, false);
  } finally {
    await dir.cleanup();
  }
});

test("cli source has no resident scheduler", async () => {
  const source = await readFile(cliPath, "utf8");
  assert.equal(source.includes("setInterval"), false);
  assert.equal(source.includes("setTimeout"), false);
});
