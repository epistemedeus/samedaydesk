#!/usr/bin/env node
/**
 * Compute COMPARISON.json from the actual kit artifacts and a simulated run through the
 * client endpoint. Deterministic; the tests check the committed file equals this output.
 *
 *   node scripts/compute-comparison.mjs           write COMPARISON.json
 *   node scripts/compute-comparison.mjs --check   exit 1 if COMPARISON.json differs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COMPARISON_COLUMNS, COMPARISON_ROWS } from "../vendor/payment-rail/recurring-journey/journey.mjs";
import { CLOCK } from "../vendor/payment-rail/recurring-journey/fixtures/load-synthetic-recurring.mjs";
import { createClientEndpoint } from "../src/client-endpoint.mjs";
import { fromMakeExecution } from "../src/make-adapter.mjs";
import { fromN8nExecution } from "../src/n8n-adapter.mjs";
import { buildWorkflowRequest } from "../src/workflow-request.mjs";
import { directRow } from "./direct-baseline.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

export function flattenMake(flow, route = "main") {
  const out = [];
  flow.forEach((module) => {
    out.push({ ...module, route });
    (module.routes ?? []).forEach((r, index) => out.push(...flattenMake(r.flow, `route-${index + 1}`)));
  });
  return out;
}

function makeMeasure(blueprint) {
  const modules = flattenMake(blueprint.flow);
  const name = (m) => m.metadata?.designer?.name;
  const router = modules.find((m) => m.module === "builtin:BasicRouter");
  const acceptedPath = modules.filter((m) => m.route === "main" || m.route === "route-1");
  const retryRoute = modules.filter((m) => m.route === "route-2");
  const text = JSON.stringify(blueprint);
  return {
    totalModules: modules.length,
    acceptedPathModules: acceptedPath.length,
    acceptedPath: acceptedPath.map(name),
    routerRoutes: router.routes.length,
    routeFilters: modules.filter((m) => m.filter).map((m) => m.filter.name),
    retryModules: retryRoute.length,
    retryPath: retryRoute.map(name),
    replayUsesSameIdempotencyKey: text.includes("Idempotency-Key") && text.includes("period.retry.sameIdempotencyKey"),
    acceptedHandOffUsesIdempotencyKey: text.includes('"value":"{{4.data.period.idempotencyKey}}"'),
    modulesReadingPeriodException: modules.filter((m) => JSON.stringify(m.filter ?? m.mapper ?? {}).includes("period.exception")).length,
    paidOrCodeModules: modules.filter((m) => !/^(gateway|json|http|builtin|util):/.test(m.module)).length,
  };
}

function n8nPath(workflow, start, choose) {
  const path = [start];
  let current = start;
  for (;;) {
    const outputs = workflow.connections[current]?.main;
    if (!outputs) break;
    const next = choose(current, outputs);
    if (!next) break;
    path.push(next);
    current = next;
  }
  return path;
}

function n8nMeasure(workflow) {
  const byName = Object.fromEntries(workflow.nodes.map((n) => [n.name, n]));
  const acceptedPath = n8nPath(workflow, "Receive Period Capture", (name, outputs) => {
    if (name === "Kit Settings") return "Shape Capture Fields";
    return outputs[0]?.[0]?.node ?? null;
  });
  const retryPath = n8nPath(workflow, "Wait Before Replay", (name, outputs) => outputs[0]?.[0]?.node ?? null);
  const ifNodes = workflow.nodes.filter((n) => n.type === "n8n-nodes-base.if" && n.name !== "FlowAssert Inputs?");
  const responds = workflow.nodes.filter((n) => n.type === "n8n-nodes-base.respondToWebhook");
  const flowassertBranch = n8nPath(workflow, "FlowAssert Inputs?", (name, outputs) => outputs[0]?.[0]?.node ?? null);
  return {
    totalNodes: workflow.nodes.length,
    acceptedPathNodes: acceptedPath.length,
    acceptedPath,
    branchNodes: ifNodes.map((n) => n.name),
    responseOutcomes: responds.map((n) => `${n.name} ${n.parameters.options.responseCode}`),
    retryNodes: retryPath.length,
    retryPath,
    replayUsesSameIdempotencyKey: JSON.stringify(byName["Replay Same Key"].parameters).includes("period.retry.sameIdempotencyKey"),
    acceptedHandOffUsesIdempotencyKey: JSON.stringify(byName["Post Accepted Output"].parameters).includes("period.idempotencyKey"),
    flowassertBranchNodes: flowassertBranch.length,
    executeCommandNodes: workflow.nodes.filter((n) => n.type === "n8n-nodes-base.executeCommand").length,
  };
}

/** Simulate a lost reply: the same workflow request evaluated twice, the hand-off posted twice. */
function duplicateEffects(input) {
  const endpoint = createClientEndpoint({ clock: CLOCK });
  const body = buildWorkflowRequest({
    platform: input.source,
    period: {
      periodId: input.periodId,
      taskId: input.taskId,
      contextId: input.contextId,
      followsTaskId: input.followsTaskId,
      termsInput: input.termsInput,
      capture: input.ingestion,
      caller: input.caller,
    },
    workflowOutput: input.workflowOutput,
    committed: input.committed,
    clock: CLOCK,
  });
  const first = endpoint.handle({ path: "/periods", body });
  const key = first.body.period.idempotencyKey;
  const replay = endpoint.handle({ path: "/periods", headers: { "Idempotency-Key": key }, body });
  endpoint.handle({ path: "/periods/accepted", headers: { "Idempotency-Key": key }, body: {} });
  endpoint.handle({ path: "/periods/accepted", headers: { "Idempotency-Key": key }, body: {} });
  return {
    evaluations: 2,
    acceptanceEffects: endpoint.effects.appliedCount(key),
    replayRecovered: replay.body.period.retry.recovered,
    replaySecondEffect: replay.body.period.retry.secondEffect,
    handOffPosts: 2,
    handOffDeliveries: endpoint.deliveredCount(key),
    duplicateEffects: endpoint.effects.appliedCount(key) - 1 + (endpoint.deliveredCount(key) - 1),
  };
}

export function computeComparison() {
  const blueprint = readJson("make/record-to-accepted-output.blueprint.json");
  const workflow = readJson("n8n/record-to-accepted-output.workflow.json");
  const make = makeMeasure(blueprint);
  const n8n = n8nMeasure(workflow);
  const makeDup = duplicateEffects(fromMakeExecution(readJson("fixtures/make/execution-period-n.json"), { clock: CLOCK }));
  const n8nDup = duplicateEffects(fromN8nExecution(readJson("fixtures/n8n/execution-period-n.json"), { clock: CLOCK }));
  const direct = directRow();
  const codes = "typed period.exception.code from the SameDayDesk client endpoint (same vendored journey as native)";
  return {
    schema: "samedaydesk.workflow-kits-n12.comparison.v1",
    columns: [...COMPARISON_COLUMNS],
    method: [
      "steps: modules (Make) or nodes (n8n) on the accepted path from trigger to webhook response, counted from the committed blueprint and workflow JSON; the Make router counts as a module.",
      "failureHandling: branches the platform itself evaluates (Make router routes with filters, n8n If nodes and Respond outcomes); exception typing comes from period.exception.code returned by the client endpoint.",
      "recovery: modules or nodes on the retry route and whether the replay reuses period.retry.sameIdempotencyKey.",
      "duplicateEffects: simulated lost reply through src/client-endpoint.mjs with the synthetic export fixtures: the same request evaluated twice and the accepted hand-off posted twice; counts extra acceptance effects plus extra hand-off deliveries.",
      "direct: the same accepted, retry and changed-schema periods posted straight to src/client-endpoint.mjs with no workflow platform (scripts/direct-baseline.mjs); steps and retry steps are endpoint calls; measured by local simulation.",
      "Computed by scripts/compute-comparison.mjs; no live Make or n8n run is claimed.",
    ],
    rows: {
      native: { ...COMPARISON_ROWS.native, source: "vendored PR 684 recurring-journey COMPARISON_ROWS.native (repo and sha in vendor/PINS.json)" },
      make: {
        steps: `${make.acceptedPathModules} modules on the accepted path (${make.totalModules} in the scenario): ${make.acceptedPath.join(" > ")}`,
        failureHandling: `${make.routerRoutes} router routes with filters (${make.routeFilters.join(", ")}); ${codes}`,
        recovery: `${make.retryModules} modules on the retry route (${make.retryPath.join(" > ")}); replay reuses period.retry.sameIdempotencyKey: ${make.replayUsesSameIdempotencyKey}`,
        duplicateEffects: `${makeDup.duplicateEffects}: ${makeDup.evaluations} evaluations gave ${makeDup.acceptanceEffects} acceptance effect (replay recovered ${makeDup.replayRecovered}, secondEffect ${makeDup.replaySecondEffect}); ${makeDup.handOffPosts} hand-off posts gave ${makeDup.handOffDeliveries} delivery`,
        measured: { ...make, ...makeDup },
      },
      n8n: {
        steps: `${n8n.acceptedPathNodes} nodes on the accepted path (${n8n.totalNodes} in the workflow, ${n8n.flowassertBranchNodes} of them the separate FlowAssert branch): ${n8n.acceptedPath.join(" > ")}`,
        failureHandling: `${n8n.branchNodes.length} If nodes (${n8n.branchNodes.join(", ")}) and ${n8n.responseOutcomes.length} response outcomes (${n8n.responseOutcomes.join(", ")}); ${codes}`,
        recovery: `${n8n.retryNodes} nodes on the retry route (${n8n.retryPath.join(" > ")}); replay reuses period.retry.sameIdempotencyKey: ${n8n.replayUsesSameIdempotencyKey}`,
        duplicateEffects: `${n8nDup.duplicateEffects}: ${n8nDup.evaluations} evaluations gave ${n8nDup.acceptanceEffects} acceptance effect (replay recovered ${n8nDup.replayRecovered}, secondEffect ${n8nDup.replaySecondEffect}); ${n8nDup.handOffPosts} hand-off posts gave ${n8nDup.handOffDeliveries} delivery`,
        measured: { ...n8n, ...n8nDup },
      },
      direct,
    },
    nativeVsDirect: [
      "Native row: vendored PR 684 recurring-journey COMPARISON_ROWS.native, unchanged (repo and sha in vendor/PINS.json).",
      "Both kits reach the same period.* as native because the client endpoint runs the same vendored journey; the platform adds trigger, shaping, routing and hand-off steps around it.",
      "Duplicate-effect protection comes from the request-digest idempotency key enforced by the client endpoint, not from Make or n8n. A platform-level retry that bypasses the endpoint would not be deduplicated by the platform.",
      `Direct row: a caller posting to the client endpoint itself needs ${direct.measured.acceptedPathSteps} calls on the accepted path and ${direct.measured.retrySteps} on the retry route, with ${direct.measured.duplicateEffects} duplicate effects; the platforms add trigger, shaping, routing and response steps around the same endpoint.`,
      "Counts are from committed JSON and a local simulation, not from a live Make or n8n execution.",
    ],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = `${JSON.stringify(computeComparison(), null, 2)}\n`;
  const target = join(root, "COMPARISON.json");
  if (process.argv.includes("--check")) {
    let current = null;
    try { current = readFileSync(target, "utf8"); } catch { current = null; }
    if (current !== text) { process.stderr.write("COMPARISON.json is stale\n"); process.exit(1); }
    process.stdout.write("COMPARISON.json up to date\n");
  } else {
    writeFileSync(target, text);
    process.stdout.write("COMPARISON.json written\n");
  }
}
