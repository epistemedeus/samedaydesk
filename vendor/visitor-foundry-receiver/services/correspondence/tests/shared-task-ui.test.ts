import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store/memory.js";
import { CorrespondenceClient, createIdempotencyKey } from "../../../scripts/correspondence/client.mjs";

// Only the DOM controls are adapters. All project/grant/event requests reach
// the real Express app over loopback HTTP with the explicitly volatile store.
const ADMIN = "s39r-ui-disposable-admin-only-20260909";
function node() {
  return {
    textContent: "", value: "", hidden: false, disabled: false, dataset: {}, children: [], listeners: {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    fire(name) { return this.listeners[name]?.({ preventDefault() {} }); },
  };
}
async function harness(t) {
  const store = new MemoryStore();
  const server = createServer(createApp(store, {
    port: 0, adminToken: ADMIN, databaseUrl: null, store: "memory", bodyLimitBytes: 32768,
    rateLimitWindowMs: 60000, rateLimitMax: 10000, corsOrigins: [], trustProxyHops: 0,
    pgSchema: "public", poolMax: 4,
  }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchImpl = globalThis.fetch;
  const client = new CorrespondenceClient({ baseUrl: origin, fetch: fetchImpl, token: ADMIN });
  const a = await client.createProject({ title: "Tenant A", summary: "Private A", idempotencyKey: createIdempotencyKey() });
  const b = await client.createProject({ title: "Tenant B", summary: "Private B", idempotencyKey: createIdempotencyKey() });
  for (const item of [a, b]) await client.postEvent({ projectId: item.project.id, token: item.ownerToken,
    kind: "request", text: item.project.summary, idempotencyKey: createIdempotencyKey() });
  const originalDocument = globalThis.document;
  const originalFormData = globalThis.FormData;
  const controls = new Map();
  const get = (name) => {
    if (!controls.has(name)) controls.set(name, node());
    return controls.get(name);
  };
  const form = get("connect-form");
  form.elements = Object.fromEntries(["origin", "projectId", "token", "adminToken"].map(name => [name, node()]));
  globalThis.document = { querySelector: () => null, createElement: node };
  globalThis.FormData = class { constructor(form) { this.form = form; } get(name) { return this.form.elements[name].value; } };
  const { bindSharedTask } = await import("../../../scripts/shared-task-ui.js");
  const root = { dataset: {}, querySelector: (selector) => get(selector.slice(6, -1)) };
  const ui = bindSharedTask(root);
  t.after(async () => {
    await get("disconnect").fire("click");
    globalThis.fetch = fetchImpl; globalThis.document = originalDocument; globalThis.FormData = originalFormData;
    client.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); await store.close();
  });
  const connect = (item, token = item.ownerToken) => {
    for (const [name, value] of Object.entries({ origin, projectId: item.project.id, token, adminToken: "" })) form.elements[name].value = value;
    return form.fire("submit");
  };
  function hold(match, { drop = false } = {}) {
    let release; let entered; let matchedResponse;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    let used = false;
    globalThis.fetch = async (url, init) => {
      const response = await fetchImpl(url, init);
      if (!used && match(url, init)) {
        used = true; matchedResponse = response.clone(); entered(); await gate;
        if (drop) throw new Error("test-only lost response");
      }
      return response;
    };
    return { started, release, get response() { return matchedResponse; } };
  }
  return { a, b, origin, client, get, form, ui, connect, hold, click: name => get(name).fire("click") };
}

test("shared task reconnect clears prior tenant display, cursor, and proposal reference", async t => {
  const h = await harness(t);
  await h.connect(h.a); await h.click("shared-propose"); await h.click("shared-resume"); await h.click("export-snapshot");
  const previous = JSON.parse(h.get("export-out").textContent);
  const proposal = previous.events.find(event => event.kind === "artifact");
  assert.ok(proposal);
  await h.connect(h.b);
  assert.equal(h.get("change-list").children.length, 0);
  assert.equal(h.get("export-out").textContent, "");
  assert.equal(h.get("export-out").hidden, true);
  await h.click("shared-resume");
  assert.match(h.get("shared-status").textContent, /Resumed/);
  assert.equal(h.get("change-list").children.length, 1);
  await h.click("shared-accept");
  const page = await h.client.listEvents({ projectId: h.b.project.id, token: h.b.ownerToken });
  assert.equal(JSON.stringify(page).includes(proposal.id), false);
});

test("Disconnect wins over a pending authenticated connection and clears input credentials", async t => {
  const h = await harness(t);
  const gate = h.hold(url => url.endsWith(`/v1/projects/${h.a.project.id}`));
  const pending = h.connect(h.a); await gate.started; await h.click("disconnect"); gate.release(); await pending;
  assert.equal(h.ui.getWorkspace().mode, "local-demo");
  assert.equal(h.get("shared-badge").hidden, true);
  assert.equal(h.form.elements.token.value, "");
  assert.match(h.get("shared-status").textContent, /Disconnected/);
});

test("latest connect wins when earlier connection completes last", async t => {
  const h = await harness(t);
  const gate = h.hold(url => url.endsWith(`/v1/projects/${h.a.project.id}`));
  const pending = h.connect(h.a); await gate.started; await h.connect(h.b); gate.release(); await pending;
  assert.equal(h.ui.getWorkspace().projectId, h.b.project.id);
});

test("late history and export cannot repaint data after disconnect", async t => {
  const h = await harness(t);
  for (const action of ["shared-resume", "export-snapshot"]) {
    const gate = h.hold(url => url.includes("/events"));
    await h.connect(h.a);
    const pending = h.click(action); await gate.started; await h.click("disconnect"); gate.release(); await pending;
    assert.equal(h.get("change-list").children.length, 0);
    assert.equal(h.get("export-out").textContent, "");
    assert.match(h.get("shared-status").textContent, /Disconnected/);
  }
});

test("shared mutation with lost response reconciles once with the same key", async t => {
  const h = await harness(t);
  const gate = h.hold((url, init) => url.includes("/events") && init.method === "POST", { drop: true });
  await h.connect(h.a);
  const pending = h.click("shared-brief"); await gate.started; gate.release(); await pending;
  assert.match(h.get("shared-status").textContent, /unknown/i);
  await h.click("shared-brief");
  const page = await h.client.listEvents({ projectId: h.a.project.id, token: h.a.ownerToken });
  assert.equal(page.events.filter(event => event.text?.includes("browser shared brief")).length, 1);
});

test("revoked grant during export is handled and clears authenticated mode", async t => {
  const h = await harness(t);
  const grant = await h.client.createGrant({ projectId: h.a.project.id, token: h.a.ownerToken, role: "writer" });
  await h.connect(h.a, grant.token);
  await h.client.revokeGrant({ projectId: h.a.project.id, token: h.a.ownerToken, grantId: grant.grantId });
  await h.click("export-snapshot");
  assert.equal(h.ui.getWorkspace().mode, "local-demo");
  assert.equal(h.get("shared-status").dataset.tone, "error");
});

test("lost bootstrap response reuses its key when the same connection is retried", async t => {
  const h = await harness(t);
  const gate = h.hold((url, init) => url.endsWith("/v1/projects") && init.method === "POST", { drop: true });
  const connect = () => {
    for (const [name, value] of Object.entries({ origin: h.origin, projectId: "", token: "", adminToken: ADMIN })) h.form.elements[name].value = value;
    return h.form.fire("submit");
  };
  const pending = connect(); await gate.started;
  const first = await gate.response.json(); gate.release(); await pending;
  assert.match(h.get("shared-status").textContent, /unknown/i);
  await connect();
  assert.equal(h.ui.getWorkspace().projectId, first.project.id);
});
