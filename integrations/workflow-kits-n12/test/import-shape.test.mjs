import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { N8N_EQUIVALENT_NODE } from "../vendor/payment-rail/recurring-journey/pins.mjs";
import { CHECKER_END, CHECKER_START, CONFIG_START, sectionBetween, sha256Text, upstreamCodeNodeSource } from "../src/flowassert-bridge.mjs";
import { flattenMake } from "../scripts/compute-comparison.mjs";
import { readJson, readText } from "./helpers.mjs";

const blueprint = readJson("make/record-to-accepted-output.blueprint.json");
const workflow = readJson("n8n/record-to-accepted-output.workflow.json");
const pins = readJson("vendor/PINS.json");

const FREE_MAKE_MODULES = new Set([
  "gateway:CustomWebHook",
  "gateway:WebhookRespond",
  "json:TransformToJSON",
  "http:ActionSendData",
  "builtin:BasicRouter",
  "util:FunctionSleep",
]);

function assertNoCredentials(text, label) {
  assert.doesNotMatch(text, /__IMTCONN__|"credentials"\s*:|"connection"\s*:/, `${label}: connection or credentials block`);
  assert.doesNotMatch(text, /Bearer\s|eyJ[A-Za-z0-9_-]{8,}\.|\bpc1\.|\btc1\.|api[_-]?key|x-api-key|"Authorization"/i, `${label}: token-like value`);
}

describe("Make blueprint shape", () => {
  const modules = flattenMake(blueprint.flow);

  test("top-level blueprint fields", () => {
    assert.equal(typeof blueprint.name, "string");
    assert.ok(Array.isArray(blueprint.flow) && blueprint.flow.length > 0);
    assert.equal(blueprint.metadata.version, 1);
    assert.equal(typeof blueprint.metadata.scenario, "object");
    assert.equal(blueprint.metadata.scenario.roundtrips, 1);
    assert.equal(blueprint.metadata.instant, true);
  });

  test("modules have unique numeric ids, module identifiers, versions and designer metadata", () => {
    const ids = modules.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const m of modules) {
      assert.equal(typeof m.id, "number");
      assert.match(m.module, /^[a-z0-9-]+:[A-Za-z0-9]+$/);
      assert.equal(typeof m.version, "number");
      assert.equal(typeof m.metadata.designer.x, "number");
    }
  });

  test("only free built-in modules are used", () => {
    for (const m of modules) assert.ok(FREE_MAKE_MODULES.has(m.module), m.module);
  });

  test("every module is connected: one trigger first, routes start with a filter, mappings reference only earlier modules", () => {
    assert.equal(blueprint.flow[0].module, "gateway:CustomWebHook");
    const router = modules.find((m) => m.module === "builtin:BasicRouter");
    assert.equal(router.routes.length, 3);
    for (const route of router.routes) {
      assert.ok(route.flow.length > 0);
      assert.ok(route.flow[0].filter?.conditions?.length, "route has a filter");
    }
    const position = new Map(modules.map((m, i) => [m.id, i]));
    for (const m of modules) {
      const refs = [...JSON.stringify({ mapper: m.mapper, filter: m.filter }).matchAll(/\{\{(\d+)\./g)].map((x) => Number(x[1]));
      for (const ref of refs) assert.ok(position.get(ref) < position.get(m.id), `module ${m.id} references ${ref}`);
    }
  });

  test("the accepted hand-off and the replay carry period.idempotencyKey", () => {
    const text = JSON.stringify(blueprint);
    assert.ok(text.includes('{"name":"Idempotency-Key","value":"{{4.data.period.idempotencyKey}}"}'));
    assert.ok(text.includes('{"name":"Idempotency-Key","value":"{{4.data.period.retry.sameIdempotencyKey}}"}'));
  });

  test("no credentials embedded", () => {
    assertNoCredentials(JSON.stringify(blueprint), "make");
    for (const m of modules.filter((x) => x.module === "http:ActionSendData")) {
      assert.equal(m.mapper.authUser, "");
      assert.equal(m.mapper.authPass, "");
    }
  });
});

describe("n8n workflow shape", () => {
  const names = workflow.nodes.map((n) => n.name);

  test("top-level workflow fields", () => {
    assert.equal(typeof workflow.name, "string");
    assert.ok(Array.isArray(workflow.nodes));
    assert.equal(typeof workflow.connections, "object");
    assert.equal(workflow.settings.executionOrder, "v1");
  });

  test("nodes have unique ids and names, base node types and positions", () => {
    assert.equal(new Set(names).size, names.length);
    assert.equal(new Set(workflow.nodes.map((n) => n.id)).size, names.length);
    for (const n of workflow.nodes) {
      assert.match(n.type, /^n8n-nodes-base\.[A-Za-z]+$/);
      assert.equal(typeof n.typeVersion, "number");
      assert.equal(n.position.length, 2);
    }
  });

  test("Cloud-compatible: no Execute Command and no local file nodes", () => {
    for (const n of workflow.nodes) {
      assert.notEqual(n.type, "n8n-nodes-base.executeCommand");
      assert.ok(!/readWriteFile|readBinaryFile|writeBinaryFile|ssh|localFileTrigger/.test(n.type), n.type);
    }
  });

  test("every node is connected and every connection points at a real node", () => {
    const incoming = new Set();
    const outgoing = new Set(Object.keys(workflow.connections));
    for (const [from, value] of Object.entries(workflow.connections)) {
      assert.ok(names.includes(from), from);
      for (const output of value.main) for (const link of output) {
        assert.ok(names.includes(link.node), link.node);
        incoming.add(link.node);
      }
    }
    for (const name of names) assert.ok(incoming.has(name) || outgoing.has(name), `${name} is connected`);
    const triggers = workflow.nodes.filter((n) => !incoming.has(n.name)).map((n) => n.name);
    assert.deepEqual(triggers, ["Receive Period Capture"]);
  });

  test("the node the adapter reads is named as the vendored projection default", () => {
    assert.equal(N8N_EQUIVALENT_NODE, "Shape Capture Fields");
    assert.ok(names.includes(N8N_EQUIVALENT_NODE));
  });

  test("Shape Capture Fields passes the payload through unchanged, including a renamed field", async () => {
    const node = workflow.nodes.find((n) => n.name === N8N_EQUIVALENT_NODE);
    const payload = { title: "t", status: "complete", outputKeys: ["a"] };
    const $ = () => ({ all: () => [{ json: { body: { period: { capture: { payload } } } } }] });
    const run = new Function("$", node.parameters.jsCode);
    assert.deepEqual(run($), [{ json: payload }]);
  });

  test("no credentials embedded", () => {
    const withoutFlowAssert = { ...workflow, nodes: workflow.nodes.filter((n) => n.name !== "FlowAssert check") };
    assertNoCredentials(JSON.stringify(withoutFlowAssert), "n8n");
    for (const n of workflow.nodes) assert.equal(n.credentials, undefined, n.name);
  });
});

describe("FlowAssert Code node reuses upstream logic unchanged", () => {
  const node = workflow.nodes.find((n) => n.name === "FlowAssert check");
  const upstream = upstreamCodeNodeSource();

  test("configuration block and packaged checker are byte-identical to upstream", () => {
    const ours = node.parameters.jsCode;
    assert.equal(ours.slice(ours.indexOf(CONFIG_START), ours.indexOf(CHECKER_START)), upstream.slice(upstream.indexOf(CONFIG_START), upstream.indexOf(CHECKER_START)));
    const checker = sectionBetween(ours, CHECKER_START, CHECKER_END);
    assert.equal(checker, sectionBetween(upstream, CHECKER_START, CHECKER_END));
    assert.equal(sha256Text(checker), pins.flowassert.packagedCheckerSha256);
  });

  test("the node runs on the upstream sample pair and returns Mismatch", async () => {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const items = [{ json: { body: { flowassert: {
      sourceCsv: readText("vendor/flowassert/offline/examples/source.csv"),
      destinationCsv: readText("vendor/flowassert/offline/examples/destination.csv"),
    } } } }];
    const out = await new AsyncFunction("$input", node.parameters.jsCode)({ all: () => items });
    assert.equal(out[0].json.state, "Mismatch");
    assert.equal(out[0].json.exit, 1);
    assert.equal(out[0].json.flowassertVersion, "1.0.0");
  });
});
