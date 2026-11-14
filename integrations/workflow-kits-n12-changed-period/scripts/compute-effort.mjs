#!/usr/bin/env node
/**
 * Compute EFFORT.json: mapping, adaptation and review effort for the changed-period
 * recipe on the Make, n8n and direct routes, against the native Useful Commerce
 * journey. Every number is counted from committed files or from running the
 * deterministic simulation; native numbers come from running the vendored journey
 * and from its source at the cited pin. Nothing is estimated.
 *
 *   node scripts/compute-effort.mjs           write EFFORT.json
 *   node scripts/compute-effort.mjs --check   exit 1 if EFFORT.json differs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildMakeBlueprint, buildN8nWorkflow, MAKE_PATH, N8N_PATH, serialize } from "./build-artifacts.mjs";
import { mappingRegistry } from "../src/fixtures.mjs";
import { runNativeControl } from "../src/native-control.mjs";
import { runScenario, STEPS } from "../src/scenario.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pins = JSON.parse(read("vendor/PINS.json").toString("utf8"));
const rjSha = pins.sources.find((s) => s.name === "recurring-journey").sha;

function leaves(value, path = "$", out = new Map()) {
  if (value !== null && typeof value === "object") {
    const keys = Array.isArray(value) ? value.map((_, i) => i) : Object.keys(value);
    if (keys.length === 0) out.set(path, JSON.stringify(value));
    for (const key of keys) leaves(value[key], `${path}.${key}`, out);
  } else out.set(path, JSON.stringify(value));
  return out;
}

export function leafDiff(a, b) {
  const la = leaves(a);
  const lb = leaves(b);
  const changed = [];
  for (const [path, value] of la) if (!lb.has(path) || lb.get(path) !== value) changed.push(path);
  for (const path of lb.keys()) if (!la.has(path)) changed.push(path);
  return changed.sort();
}

export function registryDiff(from, to) {
  const sf = Object.keys(from.source);
  const st = Object.keys(to.source);
  const sourceAdded = st.filter((p) => !sf.includes(p));
  const sourceRemoved = sf.filter((p) => !st.includes(p));
  const sourceTypeChanged = sf.filter((p) => st.includes(p) && from.source[p] !== to.source[p]);
  const targetsChanged = Object.keys(to.targets).filter((t) => JSON.stringify(from.targets[t]) !== JSON.stringify(to.targets[t]));
  const ignoreChanged = [...(from.ignore ?? []).filter((p) => !(to.ignore ?? []).includes(p)), ...(to.ignore ?? []).filter((p) => !(from.ignore ?? []).includes(p))];
  return {
    sourceAdded,
    sourceRemoved,
    sourceTypeChanged,
    targetsChanged,
    ignoreChanged,
    fieldEdits: sourceAdded.length + sourceRemoved.length + sourceTypeChanged.length + targetsChanged.length + ignoreChanged.length,
    linesAdded: JSON.stringify(to, null, 2).split("\n").length,
  };
}

function countRefs(text, re) {
  return (text.match(re) ?? []).length;
}

function makeWiring(blueprint) {
  const copy = JSON.parse(JSON.stringify(blueprint));
  const strip = (flow) => flow.forEach((m) => { if (m.module === "util:SetVariable2") m.mapper.value = ""; (m.routes ?? []).forEach((r) => strip(r.flow)); });
  strip(copy.flow);
  return countRefs(JSON.stringify(copy), /\{\{\d+\.[^}]*\}\}/g);
}

function n8nWiring(workflow) {
  const copy = JSON.parse(JSON.stringify(workflow));
  for (const node of copy.nodes) if (node.name === "Period Mappings") node.parameters.assignments.assignments[0].value = "";
  return countRefs(JSON.stringify(copy.nodes), /\$json(\.[A-Za-z]+)+|\$\('[^']+'\)\.first\(\)\.json(\.[A-Za-z]+)+/g);
}

function directWiring() {
  return countRefs(read("src/direct-route.mjs").toString("utf8"), /\b(record|replayed|evaluated\.body|request)\.[A-Za-z]+/g);
}

function review(run) {
  const autoRecovered = run.exceptions.filter((e) => e.retryable && e.sameIdempotencyKey).length;
  const distinct = new Set(run.exceptions.filter((e) => !(e.retryable && e.sameIdempotencyKey)).map((e) => `${e.code}\u0000${e.recordKey}`));
  return { exceptionsSurfaced: run.exceptions.length, autoRecoveredBySameKeyReplay: autoRecovered, reviewItems: run.exceptions.length - autoRecovered, distinctReviewDecisions: distinct.size };
}

export function computeEffort() {
  const registry = mappingRegistry();
  const [v1, v2] = registry.versions;
  const v1Only = { ...registry, versions: [v1] };
  const diff = registryDiff(v1, v2);
  const makeEdits = leafDiff(buildMakeBlueprint(v1Only), buildMakeBlueprint(registry));
  const n8nEdits = leafDiff(buildN8nWorkflow(v1Only), buildN8nWorkflow(registry));
  const runs = Object.fromEntries(["make", "n8n", "direct"].map((route) => [route, runScenario(route)]));
  const native = runNativeControl();
  const targets = Object.keys(v1.targets).length + Object.keys(v2.targets).length;
  const wiring = { make: makeWiring(buildMakeBlueprint(registry)), n8n: n8nWiring(buildN8nWorkflow(registry)), direct: directWiring() };
  const artifactEdits = { make: makeEdits.length, n8n: n8nEdits.length, direct: 0 };

  const row = (route) => {
    const r = review(runs[route]);
    const total = targets + wiring[route] + diff.fieldEdits + artifactEdits[route] + 1 + r.reviewItems;
    return {
      mapping: { declaredTargets: targets, declaredSourceFields: Object.keys(v1.source).length + Object.keys(v2.source).length, wiringReferences: wiring[route] },
      adaptation: { registryFieldEdits: diff.fieldEdits, registryLinesAdded: diff.linesAdded, artifactLeafEdits: artifactEdits[route], requestFieldEdits: 1 },
      review: r,
      total,
    };
  };

  const nativeReview = native.exceptions.length;
  const finalReceipts = (route) => JSON.stringify(runs[route].receipts);
  return {
    schema: "samedaydesk.workflow-kits-n12-changed-period.effort.v1",
    notice: "Counted from committed files and the deterministic fixture simulation by scripts/compute-effort.mjs. Not a Make or n8n provider run. Native is the vendored Useful Commerce journey run on its own fixtures.",
    formula: "total = mapping.declaredTargets + mapping.wiringReferences + adaptation.registryFieldEdits + adaptation.artifactLeafEdits + adaptation.requestFieldEdits + review.reviewItems",
    definitions: {
      declaredTargets: "mapping targets declared across mapping versions v1 and v2 in config/mapping-registry.json",
      wiringReferences: "data references the route itself carries outside the mapping registry: Make {{n.x}} template refs, n8n $json / $('Node').first().json refs, direct property reads in src/direct-route.mjs",
      registryFieldEdits: "source fields added, removed or type-changed plus target rules and ignore entries changed between v1 and v2",
      registryLinesAdded: "lines in the pretty-printed v2 mapping entry",
      artifactLeafEdits: "JSON leaves that differ between the artifact built with mapping v1 only and the committed artifact with v1 and v2",
      requestFieldEdits: "period.mappingVersion changes from workflow-output.v1 to workflow-output.v2",
      reviewItems: "exceptions surfaced across the scenario, minus those recovered automatically by same-key replay",
    },
    artifacts: {
      make: { path: MAKE_PATH, sha256: sha256(read(MAKE_PATH)), bytes: read(MAKE_PATH).length },
      n8n: { path: N8N_PATH, sha256: sha256(read(N8N_PATH)), bytes: read(N8N_PATH).length },
    },
    registryDiff: diff,
    artifactLeafEdits: { make: makeEdits, n8n: n8nEdits },
    rows: {
      make: row("make"),
      n8n: row("n8n"),
      direct: row("direct"),
      native: {
        mapping: { declaredTargets: 0, agreedFields: 3, source: { repo: "epistemedeus/pilot", sha: rjSha, path: "tools/payment-rail/recurring-journey/journey.mjs", line: 69, text: "requiredFields = [\"title\", \"status\", \"output\"]" } },
        adaptation: {
          supported: false,
          observed: native.steps.laterSchemaChange,
          reason: "The native journey has no mapping layer. A renamed field is refused as schema_changed; auto-migrating the schema-change fixture is listed as a change-direction trigger.",
          source: { repo: "epistemedeus/pilot", sha: rjSha, path: "tools/payment-rail/recurring-journey/README.md", line: 148 },
        },
        review: { exceptionsSurfaced: nativeReview, reviewItems: nativeReview },
        steps: { value: "4: project permitted capture, bind the exchange-supplied termsVersion, build job contract, run acceptance", source: { repo: "epistemedeus/pilot", pull: 687, sha: "0230cda1743a25840b808573b7be3a4b11d42b9a", path: "tools/payment-rail/recurring-journey/journey.mjs", line: 556, export: "COMPARISON_ROWS.native.steps" } },
        total: null,
        totalNote: "Not summed: native cannot adapt to the changed schema, so its adaptation effort is unsupported rather than zero.",
        control: native.steps,
      },
    },
    simulation: {
      clock: "2026-11-12T10:30:00.000Z",
      steps: STEPS.map((s) => s.step),
      routes: Object.fromEntries(Object.entries(runs).map(([route, run]) => [route, {
        externalEffects: run.externalEffects,
        maxAppliesPerKey: run.maxAppliesPerKey,
        journeyCommits: run.journeyCommits,
        endpointCalls: run.calls,
        steps: run.steps,
      }])),
      finalReceiptsEqual: finalReceipts("make") === finalReceipts("n8n") && finalReceipts("n8n") === finalReceipts("direct"),
      receipts: runs.direct.receipts.map((r) => ({ periodId: r.periodId, recordKey: r.recordKey, termsVersion: r.termsVersion, mappingVersion: r.mappingVersion, idempotencyKey: r.idempotencyKey, applyCount: r.applyCount })),
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = serialize(computeEffort());
  const target = join(root, "EFFORT.json");
  if (process.argv.includes("--check")) {
    let current = null;
    try { current = readFileSync(target, "utf8"); } catch { current = null; }
    if (current !== text) { process.stderr.write("stale: EFFORT.json\n"); process.exit(1); }
    process.stdout.write("EFFORT.json up to date\n");
  } else {
    writeFileSync(target, text);
    process.stdout.write("EFFORT.json written\n");
  }
}
