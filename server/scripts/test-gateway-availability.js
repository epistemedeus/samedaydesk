import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { gatewayAvailability, gatewayGuideBlock, validateGatewayState } from "../lib/paid-gateway-availability.js";
import { projectGatewayFiles, receiveGatewayState } from "./project-gateway-availability.js";
import { routeJob } from "../../tools/offer-routing/route-job.mjs";

const paused = { state: "paused", observedAt: "2026-10-22T01:50:00.000Z" };
const restored = {
  state: "available", observedAt: "2026-10-23T01:00:00.000Z",
  received: {
    sourceCommit: "a".repeat(40), deploymentId: "fixture-new-deployment", receipt: "fixture-new-receiving",
    observedAt: "2026-10-23T01:00:00.000Z",
    configuredRuntime: true, freshAuthority: true, oldAuthorityRefused: true, retainedState: true, sharedConsumers: true,
  },
};

// Run against the untouched baseline dist too: it must expose the supplied defect.
const dist = resolve(process.env.GATEWAY_TEST_DIST || "client/dist");
test("emitted stopped-gateway guide prevents the known-dead paid journey", () => {
  const guide = readFileSync(resolve(dist, "llms.txt"), "utf8");
  assert.match(guide, /Paid gateway temporarily paused/);
  assert.doesNotMatch(guide, /Live paid x402 inventory|Backward-compatible.*remains available|Practical paid job:/);
  const descriptor = JSON.parse(readFileSync(resolve(dist, "discovery/paid-gateway.json")));
  assert.equal(descriptor.state, "paused");
  assert.equal(descriptor.callable, false);
  assert.ok(guide.includes(descriptor.nextAction));
});
test("paused projection retains canonical identity and useful free/offline/entitlement paths", () => {
  const guide = readFileSync(resolve(dist, "llms.txt"), "utf8");
  for (const path of ["https://samedaydesk.com/mcp", "/discovery/useful-jobs.json", "/discovery/record-repeat.json", "/discovery/original-task-correspondence.json", "https://agents.samedaydesk.com/mcp", "samedaydesk-machine-commerce"]) assert.ok(guide.includes(path), path);
  assert.match(guide, /Acquired packages remain usable offline; retained entitlements are unchanged/);
  const descriptor = gatewayAvailability(paused);
  assert.equal(descriptor.alternatives.freeApexMcp, "https://samedaydesk.com/mcp");
});
test("unknown, malformed and unreceived available state cannot become callable", () => {
  for (const input of [null, {}, { state: "unknown", observedAt: paused.observedAt }, { ...paused, state: "available" }, { ...restored, received: { ...restored.received, freshAuthority: false } }]) {
    assert.equal(gatewayAvailability(input).callable, false);
    assert.doesNotMatch(gatewayGuideBlock(input), /Practical paid job:/);
  }
});
test("normal received availability emits inventory and paid next action", () => {
  assert.equal(gatewayAvailability(restored).callable, true);
  assert.match(gatewayGuideBlock(restored), /Practical paid job:/);
  assert.match(gatewayAvailability(restored).nextAction, /\.well-known\/x402$/);
});
test("task selection shares received dependency state while offline jobs remain useful", () => {
  for (const gatewayState of [paused, { state: "unknown", observedAt: paused.observedAt }, { ...paused, state: "available" }]) {
    const result = routeJob({ type: "bounded_html_observation" }, { gatewayState });
    assert.equal(result.ok, false);
    assert.ok(result.rejected.some((row) => row.reason === "paid_gateway_unavailable"));
    assert.match(result.nextAction, /offline tools/);
    assert.equal(routeJob({ type: "page_change_evidence" }, { gatewayState }).ok, true);
  }
  const available = routeJob({ type: "bounded_html_observation" }, { gatewayState: restored });
  assert.equal(available.selected.offerId, "sdd.paid_html_extract");
  assert.equal(available.executionAuthorized, false);
});
test("restoration needs new configured runtime and authority receiving after pause", () => {
  assert.deepEqual(receiveGatewayState(paused, restored), restored);
  assert.throws(() => receiveGatewayState(restored, paused), /new receiving/);
  assert.throws(() => receiveGatewayState(paused, { ...restored, observedAt: paused.observedAt, received: { ...restored.received, observedAt: paused.observedAt } }), /new receiving/);
  for (const field of Object.keys(restored.received)) {
    const received = { ...restored.received }; delete received[field];
    assert.throws(() => validateGatewayState({ ...restored, received }), /requires received/);
  }
});
test("projection replaces its owned block deterministically and preserves other guide bytes", () => {
  const guide = "prefix\n<!-- paid-gateway:start -->old<!-- paid-gateway:end -->\nsuffix\n";
  const result = projectGatewayFiles({ guide, state: paused });
  assert.ok(result.guide.startsWith("prefix\n")); assert.ok(result.guide.endsWith("\nsuffix\n"));
  assert.deepEqual(projectGatewayFiles({ guide: result.guide, state: paused }), result);
  const recovery = projectGatewayFiles({ guide: result.guide, state: restored });
  assert.equal(JSON.parse(recovery.descriptor).callable, true);
  assert.match(recovery.guide, /Paid gateway available/);
  assert.throws(() => projectGatewayFiles({ guide: "missing", state: paused }), /block missing/);
});

test("the real update command emits restored, paused and unknown machine files in an isolated source fixture", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "gateway-receiving-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ["server/lib", "server/scripts", "server/config", "client/public/discovery"]) mkdirSync(resolve(root, path), { recursive: true });
  for (const path of ["server/lib/paid-gateway-availability.js", "server/scripts/project-gateway-availability.js", "client/public/llms.txt"]) cpSync(resolve(path), resolve(root, path));
  writeFileSync(resolve(root, "package.json"), '{"type":"module"}');
  writeFileSync(resolve(root, "server/config/paid-gateway-availability.json"), JSON.stringify(paused));
  const candidatePath = resolve(root, "received.json");
  const invoke = (candidate) => {
    writeFileSync(candidatePath, JSON.stringify(candidate));
    return spawnSync(process.execPath, [resolve(root, "server/scripts/project-gateway-availability.js"), "--receive", candidatePath], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1280" } });
  };
  const before = readFileSync(resolve(root, "client/public/llms.txt"), "utf8");
  assert.notEqual(invoke({ ...paused, state: "available" }).status, 0);
  assert.equal(readFileSync(resolve(root, "client/public/llms.txt"), "utf8"), before);
  assert.equal(invoke(restored).status, 0);
  const descriptorPath = resolve(root, "client/public/discovery/paid-gateway.json");
  assert.equal(JSON.parse(readFileSync(descriptorPath)).callable, true);
  assert.match(readFileSync(resolve(root, "client/public/llms.txt"), "utf8"), /Practical paid job:/);
  assert.equal(invoke({ state: "paused", observedAt: "2026-10-24T01:00:00.000Z" }).status, 0);
  assert.equal(JSON.parse(readFileSync(descriptorPath)).callable, false);
  assert.notEqual(invoke(restored).status, 0, "old restoration evidence must refuse after a new pause");
  assert.equal(JSON.parse(readFileSync(descriptorPath)).state, "paused");
  assert.equal(invoke({ state: "unknown", observedAt: "2026-10-24T02:00:00.000Z" }).status, 0);
  assert.equal(JSON.parse(readFileSync(descriptorPath)).state, "unknown");
  assert.doesNotMatch(readFileSync(resolve(root, "client/public/llms.txt"), "utf8"), /Practical paid job:/);
});
