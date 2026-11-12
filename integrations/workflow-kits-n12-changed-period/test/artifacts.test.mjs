import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildAll, serialize, MAKE_PATH, N8N_PATH, WEBHOOK_PATH } from "../scripts/build-artifacts.mjs";
import { CLIENT_ENDPOINT } from "../src/client-endpoint.mjs";
import { mappingRegistry } from "../src/fixtures.mjs";
import { readJson, readText } from "./helpers.mjs";

const make = readJson(MAKE_PATH);
const n8n = readJson(N8N_PATH);
const N8N_TYPES = ["n8n-nodes-base.webhook", "n8n-nodes-base.set", "n8n-nodes-base.httpRequest", "n8n-nodes-base.if", "n8n-nodes-base.respondToWebhook", "n8n-nodes-base.splitOut", "n8n-nodes-base.wait"];
const MAKE_MODULES = ["gateway:CustomWebHook", "util:SetVariable2", "json:TransformToJSON", "http:ActionSendData", "builtin:BasicRouter", "gateway:WebhookRespond", "builtin:BasicFeeder", "util:FunctionSleep"];

function makeModules(flow, out = []) {
  for (const m of flow) { out.push(m); for (const r of m.routes ?? []) makeModules(r.flow, out); }
  return out;
}

describe("importable artifacts", () => {
  test("every committed artifact and fixture equals the build output", () => {
    for (const [rel, value] of Object.entries(buildAll())) assert.equal(readText(rel), serialize(value), rel);
  });

  test("n8n: one webhook trigger, allowed node types only, no credentials, not active, example endpoint", () => {
    const triggers = n8n.nodes.filter((n) => n.type === "n8n-nodes-base.webhook");
    assert.equal(triggers.length, 1);
    assert.equal(triggers[0].parameters.path, WEBHOOK_PATH);
    assert.equal(triggers[0].parameters.responseMode, "responseNode");
    for (const node of n8n.nodes) {
      assert.ok(N8N_TYPES.includes(node.type), node.type);
      assert.equal(node.credentials, undefined, node.name);
    }
    assert.notEqual(n8n.active, true);
    assert.equal(n8n.nodes.length, 15);
    assert.equal(new Set(n8n.nodes.map((n) => n.name)).size, n8n.nodes.length);
    assert.equal(new Set(n8n.nodes.map((n) => n.id)).size, n8n.nodes.length);
    const names = new Set(n8n.nodes.map((n) => n.name));
    for (const [from, out] of Object.entries(n8n.connections)) {
      assert.ok(names.has(from), from);
      for (const targets of out.main) for (const t of targets) assert.ok(names.has(t.node), t.node);
    }
    const settings = n8n.nodes.find((n) => n.name === "Kit Settings").parameters.assignments.assignments[0];
    assert.equal(settings.value, CLIENT_ENDPOINT);
    assert.match(CLIENT_ENDPOINT, /^https:\/\/client\.example\.invalid\//);
    const mappings = n8n.nodes.find((n) => n.name === "Period Mappings").parameters.assignments.assignments[0];
    assert.deepEqual(JSON.parse(mappings.value), mappingRegistry());
    for (const name of ["Apply Accepted Record", "Apply Replayed Record", "Replay Same Key"]) {
      const node = n8n.nodes.find((n) => n.name === name);
      assert.equal(node.parameters.headerParameters.parameters[0].name, "Idempotency-Key", name);
    }
  });

  test("Make: one custom webhook, free built-in modules only, no connections, example endpoint", () => {
    const modules = makeModules(make.flow);
    assert.equal(modules.length, 15);
    assert.deepEqual(modules.map((m) => m.id).sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
    assert.equal(modules.filter((m) => m.module === "gateway:CustomWebHook").length, 1);
    assert.equal(make.flow[0].parameters.hook, null);
    for (const m of modules) {
      assert.ok(MAKE_MODULES.includes(m.module), m.module);
      assert.equal(m.parameters?.__IMTCONN__, undefined);
      if (m.module === "http:ActionSendData") assert.ok(m.mapper.url.startsWith(CLIENT_ENDPOINT), m.mapper.url);
    }
    const setVar = modules.find((m) => m.module === "util:SetVariable2");
    assert.deepEqual(JSON.parse(setVar.mapper.value), mappingRegistry());
    for (const id of [12, 14, 15]) {
      const m = modules.find((x) => x.id === id);
      assert.ok(m.mapper.headers.some((h) => h.name === "Idempotency-Key"), String(id));
    }
    assert.equal(make.metadata.instant, true);
  });

  test("neither artifact carries credentials, schedules or another identity", () => {
    for (const rel of [MAKE_PATH, N8N_PATH]) {
      const text = readText(rel);
      assert.ok(!/"credentials"/.test(text), rel);
      assert.ok(!/cron|schedule/i.test(text), rel);
      assert.ok(!/pilot/i.test(text), rel);
      assert.match(text, /SameDayDesk/);
    }
  });
});
