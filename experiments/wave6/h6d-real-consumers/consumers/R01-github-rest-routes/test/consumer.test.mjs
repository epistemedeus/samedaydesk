import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  runApiUpgradeBrief,
  runRouteTableDiff,
} from "../adapter.mjs";
import { witness } from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const beforeSpec = join(root, "fixtures/openapi/before.yaml");
const afterSpec = join(root, "fixtures/openapi/after.yaml");
const used = join(root, "fixtures/openapi/used.json");
const usedGit = join(root, "fixtures/openapi/used-control-git.json");
const routeBefore = join(root, "fixtures/projection/before.route-table.json");
const routeAfter = join(root, "fixtures/projection/after.route-table.json");

const LABEL_GET = "GET /repos/{owner}/{repo}/labels/{name}";
const LABEL_POST = "POST /repos/{owner}/{repo}/labels";

function tmpOut(name) {
  mkdirSync(join(root, "tmp"), { recursive: true });
  return mkdtempSync(join(root, "tmp", `${name}-`));
}

function actionOps(report) {
  return (report?.actions || []).filter((a) => a.op).map((a) => a.op).sort();
}

test("witness source does not import kit engines", () => {
  const src = readFileSync(join(root, "witness.mjs"), "utf8");
  assert.equal(/engines\//.test(src), false);
  assert.equal(/from ["'].*compare\.mjs/.test(src), false);
  assert.equal(/openapi-impact/.test(src), false);
  assert.equal(/record-repeat/.test(src), false);
  assert.equal(/useful-jobs-1\.4\.0/.test(src), false);
});

test("positive: official pair is actionable on label schema used ops", () => {
  const w = witness(beforeSpec, afterSpec, used);
  assert.equal(w.ok, true);
  assert.equal(w.refused, false);
  assert.equal(w.status, "informational");
  assert.equal(w.counts.added, 0);
  assert.equal(w.counts.removed, 0);
  assert.equal(w.counts.changed, 0);
  assert.equal(w.counts.unchanged, 15);
  assert.equal(w.counts.unknown, 0);
  assert.equal(w.runtimeCompatibilityProof, false);
  assert.equal(w.purchaseAuthority, false);
  assert.match(w.fact, /unchanged/i);

  const outDir = tmpOut("positive");
  const run = runApiUpgradeBrief({ before: beforeSpec, after: afterSpec, used, outDir });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson?.ok, true);
  assert.equal(run.stdoutJson?.status, "actionable");
  assert.equal(run.report?.status, "actionable");
  assert.equal(run.purchaseAuthority, false);
  assert.equal(run.runtimeCompatibilityProof, false);
  assert.ok(run.outputs.json);
  assert.ok(run.outputs.md);
  assert.match(run.markdown || "", /labels\/\{name\}/);
  const ops = actionOps(run.report);
  assert.deepEqual(ops, [LABEL_GET, LABEL_POST].sort());
  for (const a of run.report.actions) {
    assert.equal(a.kind, "review-breaking-change");
    assert.equal(a.priority, "high");
  }
  assert.match(run.report.summary, /\+0\/~2\/-0/);
  // Independent witness is set identity; engine fingerprints label schema.
  assert.notEqual(run.report.status, w.status);
  assert.equal(w.counts.changed, 0);
  assert.equal(run.stdoutJson.actions, 2);
});

test("control: identical before/after yields no used-op delta", () => {
  const w = witness(beforeSpec, beforeSpec, used);
  assert.equal(w.status, "informational");
  assert.equal(w.counts.added, 0);
  assert.equal(w.counts.removed, 0);
  assert.equal(w.counts.changed, 0);
  assert.equal(w.counts.unchanged, 15);

  const outDir = tmpOut("control-identical");
  const run = runApiUpgradeBrief({
    before: beforeSpec,
    after: beforeSpec,
    used,
    outDir,
  });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson?.status, "informational");
  assert.equal(run.report?.status, "informational");
  assert.equal(run.report?.actions?.[0]?.kind, "no-used-op-delta");
  assert.match(run.report?.actions?.[0]?.note || "", /not a runtime compatibility proof/i);
});

test("control: unused-pointer git ops are informational on the official pair", () => {
  const w = witness(beforeSpec, afterSpec, usedGit);
  assert.equal(w.status, "informational");
  assert.equal(w.counts.unchanged, 5);
  assert.equal(w.counts.changed, 0);

  const outDir = tmpOut("control-git");
  const run = runApiUpgradeBrief({
    before: beforeSpec,
    after: afterSpec,
    used: usedGit,
    outDir,
  });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson?.status, "informational");
  assert.equal(run.report?.status, "informational");
  const kinds = (run.report?.actions || []).map((a) => a.kind);
  assert.ok(kinds.includes("no-used-op-delta"));
  assert.equal(kinds.includes("review-breaking-change"), false);
});

test("negative: missing --used is refused", () => {
  const outDir = tmpOut("missing-used");
  const run = runApiUpgradeBrief({
    before: beforeSpec,
    after: afterSpec,
    used: false,
    outDir,
  });
  assert.notEqual(run.status, 0);
  assert.equal(run.ok, false);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  assert.equal(run.stdoutJson?.code, "missing-required-inputs");
  assert.match(String(run.stdoutJson?.error || ""), /--used/i);
  assert.equal(run.purchaseAuthority, false);
});

test("negative: OpenAPI fed to route-table-diff is unsupported_catalog", () => {
  const outDir = tmpOut("openapi-as-routes");
  const run = runRouteTableDiff({
    before: beforeSpec,
    after: afterSpec,
    outDir,
  });
  assert.notEqual(run.status, 0);
  assert.equal(run.ok, false);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  assert.equal(run.stdoutJson?.code, "unsupported_catalog");
  assert.match(String(run.stdoutJson?.error || ""), /OpenAPI path maps/i);
  assert.equal(run.equivalentToOpenApi, false);
});

test("labeled projection: route-table-diff is no-change (method dropped)", () => {
  const projection = JSON.parse(readFileSync(routeBefore, "utf8"));
  assert.equal(projection.schema, "samedaydesk.route-table.v1");
  assert.equal(projection.authority, "caller");
  assert.equal(projection.publishedRouteTable, false);
  assert.equal(projection.equivalentToOpenApi, false);
  assert.ok(projection.dropped.includes("httpMethod"));
  assert.equal(projection.routes.length, 13);

  const outDir = tmpOut("projection");
  const run = runRouteTableDiff({
    before: routeBefore,
    after: routeAfter,
    outDir,
  });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson?.outcome, "no-change");
  assert.equal(run.stdoutJson?.breaking, false);
  assert.equal(run.stdoutJson?.publishedRouteTable, false);
  assert.equal(run.stdoutJson?.counts?.added, 0);
  assert.equal(run.stdoutJson?.counts?.removed, 0);
  assert.equal(run.stdoutJson?.counts?.changed, 0);
  assert.equal(run.equivalentToOpenApi, false);
});

test("adapter does not claim purchase authority or runtime proof", () => {
  const outDir = tmpOut("auth");
  const run = runApiUpgradeBrief({ before: beforeSpec, after: afterSpec, used, outDir });
  assert.equal(run.purchaseAuthority, false);
  assert.equal(run.network, false);
  assert.equal(run.runtimeCompatibilityProof, false);
  assert.notEqual(run.stdoutJson?.purchaseAuthority, true);
  assert.notEqual(run.report?.purchaseAuthority, true);
});

test.after(() => {
  try {
    rmSync(join(root, "tmp"), { recursive: true, force: true });
  } catch {
    /* leave tmp if busy */
  }
});
