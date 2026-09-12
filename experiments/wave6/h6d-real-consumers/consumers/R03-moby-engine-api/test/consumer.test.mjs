import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runApiUpgradeBrief, runRouteTableDiff } from "../adapter.mjs";
import { projectSwaggerYaml } from "../project.mjs";
import { witness } from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fx = join(root, "fixtures");

const BEFORE_SHA = "235d2876f80fff1ee13378646a4d41a4c670a052";
const AFTER_SHA = "2803839c3f30344de950e35dfe5cc4e1e170cb0d";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tmpOut(label) {
  return mkdtempSync(join(tmpdir(), `r03-${label}-`));
}

test("stored official swagger blobs match acquisition hashes", () => {
  const acq = readJson(join(root, "acquisition.json"));
  assert.equal(acq.repo, "moby/moby");
  assert.equal(acq.path, "api/swagger.yaml");
  assert.equal(acq.license, "Apache-2.0");
  assert.equal(acq.beforeSha, BEFORE_SHA);
  assert.equal(acq.afterSha, AFTER_SHA);
  assert.equal(sha256(join(fx, "raw/before.swagger.yaml")), acq.sha256.before);
  assert.equal(sha256(join(fx, "raw/after.swagger.yaml")), acq.sha256.after);
  assert.equal(sha256(join(fx, "raw/LICENSE")), acq.sha256.license);
  assert.equal(readFileSync(join(fx, "raw/before.swagger.yaml")).length, 473773);
  assert.equal(readFileSync(join(fx, "raw/after.swagger.yaml")).length, 473773);
  const license = readFileSync(join(fx, "raw/LICENSE"), "utf8");
  assert.match(license, /Apache License/);
});

test("independent witness: official swagger path set is unchanged", () => {
  const beforeYaml = readFileSync(join(fx, "raw/before.swagger.yaml"), "utf8");
  const afterYaml = readFileSync(join(fx, "raw/after.swagger.yaml"), "utf8");
  const w = witness(beforeYaml, afterYaml);
  assert.equal(w.fact, "swagger-path-set");
  assert.equal(w.dialect, "2.0");
  assert.deepEqual(w.added, []);
  assert.deepEqual(w.removed, []);
  assert.deepEqual(w.changed, []);
  assert.equal(w.unchanged.length, 98);
  assert.equal(w.counts.beforeOps, 108);
  assert.equal(w.counts.afterOps, 108);
  assert.ok(w.unknown.some((u) => u.kind === "definition-property-rename"));
  assert.ok(w.unknown.some((u) => u.kind === "non-equivalent-projection"));
  const used = readJson(join(fx, "used.json"));
  const wu = witness(beforeYaml, afterYaml, used);
  assert.deepEqual(wu.added, []);
  assert.deepEqual(wu.removed, []);
  assert.ok(wu.unchanged.includes("/containers/create"));
  assert.ok(wu.unchanged.includes("/services/create"));
});

test("projection of swagger YAML matches frozen SDS catalogs", () => {
  const beforeYaml = readFileSync(join(fx, "raw/before.swagger.yaml"), "utf8");
  const afterYaml = readFileSync(join(fx, "raw/after.swagger.yaml"), "utf8");
  const frozenBefore = readJson(join(fx, "projected/before.route-table.json"));
  const frozenAfter = readJson(join(fx, "projected/after.route-table.json"));
  const projectedBefore = projectSwaggerYaml(beforeYaml, { sha: BEFORE_SHA, side: "before" });
  const projectedAfter = projectSwaggerYaml(afterYaml, { sha: AFTER_SHA, side: "after" });
  assert.equal(projectedBefore.schema, "samedaydesk.route-table.v1");
  assert.equal(projectedBefore.authority, "caller");
  assert.equal(projectedBefore.publishedRouteTable, false);
  assert.equal(projectedBefore.equivalent, false);
  assert.equal(projectedBefore.routes.length, 98);
  assert.deepEqual(projectedBefore.routes, frozenBefore.routes);
  assert.deepEqual(projectedAfter.routes, frozenAfter.routes);
  assert.ok(!projectedBefore.routes.some((r) => r.path === "/"));
});

test("positive: route-table-diff on official projected pair is no-change and matches witness", () => {
  const outDir = tmpOut("pos");
  try {
    const result = runRouteTableDiff({
      before: join(fx, "projected/before.route-table.json"),
      after: join(fx, "projected/after.route-table.json"),
      outDir,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const body = result.stdoutJson;
    assert.equal(body.ok, true);
    assert.equal(body.schema, "samedaydesk.route-diff.v1");
    assert.equal(body.publishedRouteTable, false);
    assert.equal(body.sample, false);
    assert.equal(body.outcome, "no-change");
    assert.equal(body.breaking, false);
    assert.equal(body.counts.added, 0);
    assert.equal(body.counts.removed, 0);
    assert.equal(body.counts.changed, 0);
    const written = readJson(join(outDir, "route-diff.json"));
    assert.equal(written.outcome, "no-change");
    assert.match(readFileSync(join(outDir, "route-diff.md"), "utf8"), /route/i);

    const beforeYaml = readFileSync(join(fx, "raw/before.swagger.yaml"), "utf8");
    const afterYaml = readFileSync(join(fx, "raw/after.swagger.yaml"), "utf8");
    const w = witness(beforeYaml, afterYaml);
    assert.equal(w.added.length, body.counts.added);
    assert.equal(w.removed.length, body.counts.removed);
    assert.equal(w.changed.length, body.counts.changed);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control: identical before/after projected catalog is no-change", () => {
  const outDir = tmpOut("ctrl");
  try {
    const result = runRouteTableDiff({
      before: join(fx, "projected/before.route-table.json"),
      after: join(fx, "projected/before.route-table.json"),
      outDir,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdoutJson.ok, true);
    assert.equal(result.stdoutJson.outcome, "no-change");
    const w = witness(
      readJson(join(fx, "projected/before.route-table.json")),
      readJson(join(fx, "projected/before.route-table.json")),
    );
    assert.deepEqual(w.added, []);
    assert.deepEqual(w.removed, []);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: raw swagger JSON is unsupported_catalog", () => {
  const outDir = tmpOut("neg");
  try {
    const result = runRouteTableDiff({
      before: join(fx, "negative/swagger2.official.json"),
      after: join(fx, "negative/swagger2.official.json"),
      outDir,
    });
    assert.notEqual(result.status, 0);
    const body = result.stdoutJson;
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "unsupported_catalog");
    assert.match(String(body.error), /OpenAPI path maps are not SDS route catalogs/i);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: raw swagger YAML is not JSON (invalid_catalog)", () => {
  const outDir = tmpOut("negyaml");
  try {
    const result = runRouteTableDiff({
      before: join(fx, "raw/before.swagger.yaml"),
      after: join(fx, "raw/after.swagger.yaml"),
      outDir,
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdoutJson.ok, false);
    assert.equal(result.stdoutJson.refused, true);
    assert.equal(result.stdoutJson.code, "invalid_catalog");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("caller mutation of projected catalog is detected as added (not official)", () => {
  const outDir = tmpOut("mut");
  const mutatedPath = join(outDir, "after-mutated.json");
  try {
    const after = readJson(join(fx, "projected/after.route-table.json"));
    after.note = "Caller-owned mutation for engine detection only. Not an official moby path.";
    after.routes = [
      ...after.routes,
      {
        path: "/containers/umask-probe",
        title: "Synthetic umask probe (not official)",
        canonical: "https://docs.docker.com/reference/api/engine/version/v1.56/containers/umask-probe",
      },
    ];
    writeFileSync(mutatedPath, `${JSON.stringify(after, null, 2)}\n`);
    const result = runRouteTableDiff({
      before: join(fx, "projected/before.route-table.json"),
      after: mutatedPath,
      outDir,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdoutJson.ok, true);
    assert.equal(result.stdoutJson.outcome, "changed");
    assert.deepEqual(result.stdoutJson.added, ["/containers/umask-probe"]);
    const w = witness(readJson(join(fx, "projected/before.route-table.json")), after);
    assert.deepEqual(w.added, ["/containers/umask-probe"]);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("witness source does not import kit engine compare modules", () => {
  const src = readFileSync(join(root, "witness.mjs"), "utf8");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/engines\/route-table-diff\/lib\/(diff|catalog)/.test(src), false);
  assert.equal(/engines\/lockfile-pin-delta\/lib\/compare/.test(src), false);
  assert.equal(/engines\/json-schema-webhook-drift\/lib\/compare/.test(src), false);
});

test("owned-paths declare exclusive subpath and non-equivalent migration", () => {
  const owned = readJson(join(root, "owned-paths.json"));
  assert.equal(owned.ownedPath, "experiments/wave6/h6d-real-consumers/consumers/R03-moby-engine-api/");
  assert.equal(owned.receivingIntegrationOwner, "H6D-parent");
  assert.equal(owned.jobId, "route-table-diff");
  assert.equal(owned.migration.equivalent, false);
  assert.equal(owned.purchaseAuthority, false);
  assert.equal(owned.networkOnJobPath, false);
});

test("secondary api-upgrade-brief accepts swagger2 (does not refuse) and is not a compatibility proof", () => {
  const outDir = tmpOut("api");
  try {
    const result = runApiUpgradeBrief({
      before: join(fx, "raw/before.swagger.yaml"),
      after: join(fx, "raw/after.swagger.yaml"),
      used: join(fx, "used.json"),
      outDir,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const body = result.stdoutJson;
    assert.equal(body.ok, true);
    assert.equal(body.appId, "api-upgrade-brief");
    assert.notEqual(body.status, "refused");
    assert.equal(body.code == null || body.code !== "swagger2_refused", true);
    const brief = readJson(join(outDir, "upgrade-brief.json"));
    assert.equal(brief.status, "informational");
    assert.match(String(brief.summary), /No used-operation structural delta/i);
    assert.equal(brief.noPurchaseAuthority, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
