import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createMonitor, frozenClock, openFileStore } from "../src/index.mjs";
import { handReceipt, NOW, releaseSubscription, routeDecision, tempDir } from "./support.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function subscribed(dir, receivers, extra = {}) {
  const monitor = createMonitor({
    store: await openFileStore(dir.file),
    clock: frozenClock(NOW),
    receivers,
    ...extra,
  });
  await monitor.subscribe({
    ...releaseSubscription("route-1"),
    source: { kind: "route-lock", scope: `route-lock:decision:${"a".repeat(64)}` },
  });
  await monitor.observe({ subscriptionId: "route-1", document: routeDecision() });
  const changed = await monitor.observe({
    subscriptionId: "route-1",
    document: routeDecision({ decision: "skip", digest: "digest-b" }),
  });
  return { monitor, changed };
}

test("redirect, timeout, duplicate, and lost reply stay on the registered origin", async () => {
  const posts = { origin: 0, foreign: 0 };
  const foreign = createServer((_request, response) => {
    posts.foreign += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accepted: true, idempotencyKey: "stolen" }));
  });
  const foreignPort = await listen(foreign);
  const sockets = new Set();
  foreign.on("connection", (socket) => sockets.add(socket));
  let mode = "ok";
  const stored = new Map();
  const origin = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname.startsWith("/events/")) {
      const key = decodeURIComponent(url.pathname.slice("/events/".length));
      const found = stored.get(key);
      response.writeHead(found ? 200 : 404, { "content-type": "application/json" });
      response.end(JSON.stringify(found ? { found: true, idempotencyKey: key, event: found } : { found: false }));
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(404);
      response.end();
      return;
    }
    posts.origin += 1;
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const key = body.idempotencyKey;
      if (mode === "redirect") {
        response.writeHead(302, { location: `http://127.0.0.1:${foreignPort}/deliver` });
        response.end();
        return;
      }
      if (mode === "timeout") return;
      if (mode === "lose") {
        stored.set(key, body.event);
        request.socket.destroy();
        return;
      }
      const duplicate = mode === "duplicate" || stored.has(key);
      stored.set(key, body.event);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: true, duplicate, idempotencyKey: key }));
    });
  });
  origin.on("connection", (socket) => sockets.add(socket));
  const port = await listen(origin);
  const dir = await tempDir("change-monitor-receiver-");
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const receivers = { "local-vm": { kind: "local-http", baseUrl } };
    mode = "redirect";
    const redirected = await subscribed(dir, receivers);
    const refused = await redirected.monitor.deliver({ eventId: redirected.changed.eventId });
    assert.equal(refused[0].state, "failed");
    assert.equal(refused[0].outcome, "failed");
    assert.equal((await redirected.monitor.read()).deliveries[redirected.changed.eventId].attempts.at(-1).error, "redirect_refused");
    assert.equal(posts.foreign, 0);
    const again = await redirected.monitor.deliver({ eventId: redirected.changed.eventId });
    assert.equal(again.length, 0);

    mode = "duplicate";
    const duplicateDir = await tempDir("change-monitor-duplicate-");
    const duplicateRun = await subscribed(duplicateDir, receivers);
    const duplicated = await duplicateRun.monitor.deliver({ eventId: duplicateRun.changed.eventId });
    assert.equal(duplicated[0].state, "accepted");
    assert.equal(duplicated[0].outcome, "duplicate");
    const originAfterDuplicate = posts.origin;
    assert.equal((await duplicateRun.monitor.deliver()).length, 0);
    assert.equal(posts.origin, originAfterDuplicate);

    mode = "lose";
    const lostDir = await tempDir("change-monitor-lost-");
    const lostRun = await subscribed(lostDir, receivers);
    const lost = await lostRun.monitor.deliver({ eventId: lostRun.changed.eventId });
    assert.equal(lost[0].state, "unknown");
    const postsAfterLoss = posts.origin;
    assert.equal((await lostRun.monitor.deliver({ eventId: lostRun.changed.eventId })).length, 0);
    assert.equal(posts.origin, postsAfterLoss);
    const reconciled = await lostRun.monitor.reconcile();
    assert.equal(reconciled[0].state, "accepted");
    assert.equal(posts.origin, postsAfterLoss);

    mode = "timeout";
    const timeoutDir = await tempDir("change-monitor-timeout-");
    const timeoutRun = await subscribed(timeoutDir, receivers, { deliveryTimeoutMs: 200 });
    const timed = await timeoutRun.monitor.deliver({ eventId: timeoutRun.changed.eventId });
    assert.equal(timed[0].state, "unknown");
    assert.equal(timed[0].outcome, "unknown");
    const postsAfterTimeout = posts.origin;
    assert.equal((await timeoutRun.monitor.deliver({ eventId: timeoutRun.changed.eventId })).length, 0);
    assert.equal(posts.origin, postsAfterTimeout);
    await duplicateDir.cleanup();
    await lostDir.cleanup();
    await timeoutDir.cleanup();
  } finally {
    await dir.cleanup();
    for (const socket of sockets) socket.destroy();
    await close(origin);
    await close(foreign);
  }
});

test("a crash before send and a crash after send do not replay an ambiguous post", async () => {
  const seen = [];
  const remote = new Map();
  const dir = await tempDir("change-monitor-crash-");
  const receivers = {
    "local-vm": {
      kind: "injected",
      async send(event) {
        seen.push(event.eventId);
        remote.set(event.idempotencyKey, event);
        return { outcome: "accepted", httpStatus: 200, error: null };
      },
      async reconcile(key) {
        if (!remote.has(key)) return { outcome: "absent", httpStatus: 404, error: null };
        return { outcome: "accepted", httpStatus: 200, error: null };
      },
    },
  };
  try {
    const before = createMonitor({
      store: await openFileStore(dir.file),
      clock: frozenClock(NOW),
      receivers,
      afterClaim() {
        throw new Error("crash-before-send");
      },
    });
    await before.subscribe(releaseSubscription());
    await before.observe({ subscriptionId: "rg-route-lock", document: handReceipt("held", NOW) });
    const changed = await before.observe({
      subscriptionId: "rg-route-lock",
      document: handReceipt("accepted", NOW),
    });
    assert.equal(changed.outcome, "content_changed");
    await assert.rejects(() => before.deliver({ eventId: changed.eventId }), /crash-before-send/);
    assert.equal(seen.length, 0);
    assert.equal((await before.read()).deliveries[changed.eventId].state, "unknown");
    assert.equal((await before.read()).deliveries[changed.eventId].delivered, false);
    const restarted = createMonitor({
      store: await openFileStore(dir.file),
      clock: frozenClock(NOW),
      receivers,
    });
    assert.equal((await restarted.deliver({ eventId: changed.eventId })).length, 0);
    assert.equal(seen.length, 0);
    remote.clear();
    const absent = await restarted.reconcile();
    assert.equal(absent[0].state, "pending");
    const sent = await restarted.deliver({ eventId: changed.eventId });
    assert.equal(sent[0].state, "accepted");
    assert.equal(sent[0].delivered, true);
    assert.equal(seen.length, 1);

    const afterDir = await tempDir("change-monitor-crash-after-");
    const after = createMonitor({
      store: await openFileStore(afterDir.file),
      clock: frozenClock(NOW),
      receivers,
      afterSend() {
        throw new Error("crash-after-send");
      },
    });
    await after.subscribe(releaseSubscription("after-send"));
    await after.observe({ subscriptionId: "after-send", document: handReceipt("held", NOW) });
    const second = await after.observe({
      subscriptionId: "after-send",
      document: handReceipt("gated", NOW),
    });
    assert.equal(second.outcome, "content_changed");
    const beforePosts = seen.length;
    await assert.rejects(() => after.deliver({ eventId: second.eventId }), /crash-after-send/);
    assert.equal(seen.length, beforePosts + 1);
    assert.equal((await after.read()).deliveries[second.eventId].state, "unknown");
    assert.equal((await after.read()).deliveries[second.eventId].delivered, false);
    const resumed = createMonitor({
      store: await openFileStore(afterDir.file),
      clock: frozenClock(NOW),
      receivers: {
        "local-vm": {
          kind: "injected",
          async send() {
            seen.push("replayed");
            return { outcome: "accepted", httpStatus: 200, error: null };
          },
          async reconcile(key) {
            if (!remote.has(key)) return { outcome: "absent", httpStatus: 404, error: null };
            return { outcome: "accepted", httpStatus: 200, error: null };
          },
        },
      },
    });
    assert.equal((await resumed.deliver({ eventId: second.eventId })).length, 0);
    assert.equal(seen.includes("replayed"), false);
    const found = await resumed.reconcile();
    assert.equal(found[0].state, "accepted");
    assert.equal(found[0].delivered, true);
    assert.equal(seen.includes("replayed"), false);
    await afterDir.cleanup();
  } finally {
    await dir.cleanup();
  }
});

test("receiver config still rejects arbitrary URLs", async () => {
  const { receiversFromConfig } = await import("../src/receivers.mjs");
  assert.throws(
    () => receiversFromConfig({ "https://example.invalid/hook": { kind: "local-http", baseUrl: "http://127.0.0.1:9" } }),
    (error) => error.code === "bad_receiver",
  );
  assert.throws(
    () => receiversFromConfig({ "local-vm": { kind: "local-http", baseUrl: "http://example.invalid:80" } }),
    (error) => error.code === "bad_receiver",
  );
  assert.throws(
    () => receiversFromConfig({ "local-vm": { kind: "local-http", baseUrl: "https://127.0.0.1:9" } }),
    (error) => error.code === "bad_receiver",
  );
});
