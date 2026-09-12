import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FIXTURES, runAdapter, runUsefulJob } from "../adapter.mjs";
import { classify, projectOpenApiToSds, witness } from "../witness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function tmpOut(label) {
  return mkdtempSync(join(tmpdir(), `r04-${label}-`));
}

function brief(engine) {
  const path = engine.outputs["upgrade-brief.json"];
  assert.ok(path, "expected upgrade-brief.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function keysOf(rows) {
  return [...rows].map((row) => row.key || row.path || row).sort();
}

test("source pins are official Slack SHAs with MIT license, not OpenAI/octokit", () => {
  const acq = readJson("acquisition.json");
  const owned = readJson("owned-paths.json");
  const source = readFileSync(join(ROOT, "SOURCE.md"), "utf8");
  assert.equal(acq.repo, "slackapi/slack-api-specs");
  assert.equal(acq.path, "web-api/slack_web_openapi_v2.json");
  assert.equal(acq.license, "MIT");
  assert.equal(acq.beforeSha, "3f1e8b4a03855cb29cffbfcaf60195e5867780ea");
  assert.equal(acq.afterSha, "dfea73e06d146c368d7f94b52ac90796dc4e27e1");
  assert.equal(acq.sha256.before, "b026c31dddfe96d9ff2d32832c0c18538eb9c94db66c824c8bcbac546032e856");
  assert.equal(acq.sha256.after, "742a5c977180a829df8767cf57bc417d99b3713583aee83741efb9c08ca731e7");
  assert.equal(acq.bytes.before, 1360907);
  assert.equal(acq.bytes.after, 1237332);
  assert.equal(owned.ownedPath, "experiments/wave6/h6d-real-consumers/consumers/R04-slack-web-api/");
  assert.equal(owned.receivingIntegrationOwner, "H6D-parent");
  assert.equal(owned.jobId, "api-upgrade-brief");
  assert.equal(owned.purchaseAuthority, false);
  assert.equal(owned.migration.equivalent, false);
  assert.match(source, /MIT/);
  assert.match(source, /Not OpenAI/);
  assert.match(source, /Not octokit/);
  assert.equal(acq.not.includes("OpenAI"), true);
  assert.equal(acq.not.includes("octokit organization.renamed"), true);
});

test("official method+path indexes contain stable examples and a real delta", () => {
  const before = readJson("fixtures/operations/before.json");
  const after = readJson("fixtures/operations/after.json");
  const delta = readJson("fixtures/operations/delta.json");
  const w = witness(before, after);
  assert.equal(w.fact, "openapi-method-path");
  assert.equal(before.operations.length, 185);
  assert.equal(after.operations.length, 174);
  assert.equal(w.added.length, 32);
  assert.equal(w.removed.length, 43);
  assert.equal(w.unchanged.length, 142);
  assert.equal(delta.counts.added, 32);
  const addedKeys = new Set(keysOf(w.added));
  const removedKeys = new Set(keysOf(w.removed));
  const unchangedKeys = new Set(keysOf(w.unchanged));
  assert.equal(addedKeys.has("POST /conversations.mark"), true);
  assert.equal(addedKeys.has("POST /admin.conversations.create"), true);
  assert.equal(addedKeys.has("POST /calls.add"), true);
  assert.equal(removedKeys.has("GET /channels.list"), true);
  assert.equal(removedKeys.has("GET /channels.info"), true);
  assert.equal(unchangedKeys.has("POST /chat.postMessage"), true);
  assert.equal(unchangedKeys.has("GET /users.info"), true);
  assert.equal(unchangedKeys.has("GET /conversations.list"), true);
});

test("positive: api-upgrade-brief used-ops delta matches independent witness", { timeout: 90_000 }, () => {
  const outDir = tmpOut("pos");
  try {
    const run = runAdapter({ mode: "positive", outDir });
    assert.equal(run.ok, true, run.stdout + run.stderr);
    assert.equal(run.stdoutJson?.appId, "api-upgrade-brief");
    assert.equal(run.stdoutJson?.status, "actionable");
    const art = brief(run);
    const ops = art.actions.map((a) => a.op).sort();
    assert.deepEqual(
      art.actions.filter((a) => a.kind === "retire-or-migrate").map((a) => a.op).sort(),
      ["GET /channels.info", "GET /channels.list"],
    );
    assert.deepEqual(
      art.actions.filter((a) => a.kind === "consider-adoption").map((a) => a.op).sort(),
      ["POST /admin.conversations.create", "POST /calls.add", "POST /conversations.mark"],
    );
    const w = run.witness;
    assert.equal(w.fact, "openapi-method-path");
    assert.deepEqual(keysOf(w.removed), ["GET /channels.info", "GET /channels.list"]);
    assert.deepEqual(keysOf(w.added), [
      "POST /admin.conversations.create",
      "POST /calls.add",
      "POST /conversations.mark",
    ]);
    assert.deepEqual(keysOf(w.unchanged), ["GET /conversations.list", "GET /users.info", "POST /chat.postMessage"]);
    assert.equal(w.changed.length, 0);
    assert.match(art.summary, /\+3\/~0\/-2/);
    assert.equal(ops.includes("GET /channels.list"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control: unused-pointer used-control has no used-op delta", { timeout: 90_000 }, () => {
  const outDir = tmpOut("ctrl");
  try {
    const run = runAdapter({ mode: "control", outDir });
    assert.equal(run.ok, true, run.stdout + run.stderr);
    assert.equal(run.stdoutJson?.status, "informational");
    const art = brief(run);
    assert.equal(art.actions.length, 1);
    assert.equal(art.actions[0].kind, "no-used-op-delta");
    const w = run.witness;
    assert.equal(w.added.length, 0);
    assert.equal(w.removed.length, 0);
    assert.equal(w.changed.length, 0);
    assert.equal(w.unchanged.length, 3);
    assert.deepEqual(keysOf(w.unchanged), ["GET /conversations.list", "GET /users.info", "POST /chat.postMessage"]);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control: identical after excerpt is informational on the stable pin", { timeout: 90_000 }, () => {
  const outDir = tmpOut("ident");
  try {
    const run = runAdapter({ mode: "control-identical", outDir });
    assert.equal(run.ok, true, run.stdout + run.stderr);
    const art = brief(run);
    assert.equal(art.actions[0].kind, "no-used-op-delta");
    const w = witness(
      JSON.parse(readFileSync(FIXTURES.openapiAfter, "utf8")),
      JSON.parse(readFileSync(FIXTURES.openapiAfter, "utf8")),
      JSON.parse(readFileSync(FIXTURES.usedControl, "utf8")),
    );
    assert.equal(w.added.length, 0);
    assert.equal(w.removed.length, 0);
    assert.equal(w.unchanged.length, 3);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: missing --used refuses missing-required-inputs", { timeout: 60_000 }, () => {
  const outDir = tmpOut("missing");
  try {
    const run = runUsefulJob({
      jobId: "api-upgrade-brief",
      args: ["--before", FIXTURES.openapiBefore, "--after", FIXTURES.openapiAfter],
      outDir,
    });
    assert.notEqual(run.status, 0);
    assert.equal(run.stdoutJson?.ok, false);
    assert.equal(run.stdoutJson?.refused, true);
    assert.equal(run.stdoutJson?.code, "missing-required-inputs");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: yarn.lock is not OpenAPI according to the independent witness", { timeout: 60_000 }, () => {
  const yarn = readFileSync(FIXTURES.yarnLock, "utf8");
  const after = JSON.parse(readFileSync(FIXTURES.openapiAfter, "utf8"));
  const used = JSON.parse(readFileSync(FIXTURES.used, "utf8"));
  const w = witness(yarn, after, used);
  assert.equal(w.fact, "not-openapi");
  assert.equal(w.unknown[0].before, "yarn-lock");
  const outDir = tmpOut("yarn");
  try {
    const run = runUsefulJob({
      jobId: "api-upgrade-brief",
      args: ["--before", FIXTURES.yarnLock, "--after", FIXTURES.openapiAfter, "--used", FIXTURES.used],
      outDir,
    });
    const blob = `${run.stdout}${run.stderr}`;
    assert.match(blob, /unknown-dialect|partial|No openapi\/swagger field/i);
    const artPath = run.outputs["upgrade-brief.json"];
    if (artPath) {
      const art = JSON.parse(readFileSync(artPath, "utf8"));
      const retire = (art.actions || []).filter((a) => a.kind === "retire-or-migrate");
      assert.equal(retire.length, 0, "yarn.lock must not be treated as the Slack before snapshot that retires channels.*");
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: raw swagger to route-table-diff is unsupported_catalog", { timeout: 60_000 }, () => {
  const outDir = tmpOut("raw");
  try {
    const run = runUsefulJob({
      jobId: "route-table-diff",
      args: ["--before", FIXTURES.rawSwagger, "--after", FIXTURES.sdsAfter],
      outDir,
    });
    assert.notEqual(run.status, 0);
    assert.equal(run.stdoutJson?.ok, false);
    assert.equal(run.stdoutJson?.code, "unsupported_catalog");
    assert.match(String(run.stdoutJson?.error || ""), /OpenAPI path maps are not SDS route catalogs/i);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: live URL catalogs are refused (no job-path fetch)", { timeout: 60_000 }, () => {
  const outDir = tmpOut("url");
  try {
    const run = runUsefulJob({
      jobId: "route-table-diff",
      args: ["--before", FIXTURES.liveUrl, "--after", FIXTURES.sdsAfter],
      outDir,
    });
    assert.notEqual(run.status, 0);
    assert.equal(run.stdoutJson?.code, "external_catalog_refused");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: OpenAPI-as-schema is not json-schema-webhook-drift", { timeout: 60_000 }, () => {
  const outDir = tmpOut("schema");
  try {
    const run = runUsefulJob({
      jobId: "json-schema-webhook-drift",
      args: [
        "--before",
        FIXTURES.openapiAsSchema,
        "--after",
        FIXTURES.openapiAsSchema,
        "--used",
        FIXTURES.schemaUsed,
      ],
      outDir,
    });
    assert.notEqual(run.status, 0);
    const blob = `${run.stdout}${run.stderr}${JSON.stringify(run.stdoutJson || {})}`;
    assert.match(blob, /not-this-job-openapi/i);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("SDS projection is labeled non-equivalent and route-table-diff matches path witness", { timeout: 60_000 }, () => {
  const outDir = tmpOut("sds");
  try {
    const beforeOa = JSON.parse(readFileSync(FIXTURES.openapiBefore, "utf8"));
    const afterOa = JSON.parse(readFileSync(FIXTURES.openapiAfter, "utf8"));
    const projectedBefore = projectOpenApiToSds(beforeOa);
    const projectedAfter = projectOpenApiToSds(afterOa);
    const storedBefore = JSON.parse(readFileSync(FIXTURES.sdsBefore, "utf8"));
    const storedAfter = JSON.parse(readFileSync(FIXTURES.sdsAfter, "utf8"));
    assert.deepEqual(
      projectedBefore.routes.map((r) => r.path),
      storedBefore.routes.map((r) => r.path),
    );
    assert.deepEqual(
      projectedAfter.routes.map((r) => r.path),
      storedAfter.routes.map((r) => r.path),
    );
    const w = witness(storedBefore, storedAfter);
    assert.equal(w.fact, "sds-path-projection");
    assert.equal(w.equivalent, false);
    assert.deepEqual(
      w.added.map((r) => r.path).sort(),
      ["/admin.conversations.create", "/calls.add", "/conversations.mark"],
    );
    assert.deepEqual(w.removed.map((r) => r.path).sort(), ["/channels.info", "/channels.list"]);
    const run = runAdapter({ mode: "sds", outDir });
    assert.equal(run.ok, true, run.stdout + run.stderr);
    assert.equal(run.stdoutJson?.outcome, "breaking");
    assert.deepEqual([...run.stdoutJson.added].sort(), [
      "/admin.conversations.create",
      "/calls.add",
      "/conversations.mark",
    ]);
    assert.deepEqual([...run.stdoutJson.removed].sort(), ["/channels.info", "/channels.list"]);
    assert.equal(storedBefore.publishedRouteTable, false);
    assert.equal(storedBefore.authority, "caller");
    assert.equal(storedBefore.equivalentToOpenApi, false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control: identical SDS catalogs are no-change", { timeout: 60_000 }, () => {
  const outDir = tmpOut("sds-ctrl");
  try {
    const run = runAdapter({ mode: "sds-control", outDir });
    assert.equal(run.ok, true, run.stdout + run.stderr);
    assert.equal(run.stdoutJson?.outcome, "no-change");
    assert.equal(run.stdoutJson?.breaking, false);
    const w = witness(
      JSON.parse(readFileSync(FIXTURES.sdsBefore, "utf8")),
      JSON.parse(readFileSync(FIXTURES.sdsControl, "utf8")),
    );
    assert.equal(w.added.length, 0);
    assert.equal(w.removed.length, 0);
    assert.equal(w.changed.length, 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: homepage rewrite is refused", { timeout: 60_000 }, () => {
  const outDir = tmpOut("home");
  try {
    const run = runUsefulJob({
      jobId: "route-table-diff",
      args: ["--before", FIXTURES.sdsBefore, "--after", FIXTURES.sdsAfter, "--rewrite-homepage"],
      outDir,
    });
    assert.notEqual(run.status, 0);
    assert.match(String(run.stdoutJson?.code || run.stdout), /homepage_rewrite/i);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("witness does not import kit engine compare modules", () => {
  const src = readFileSync(join(ROOT, "witness.mjs"), "utf8");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/engines\/lockfile-pin-delta\/lib\/compare/.test(src), false);
  assert.equal(/engines\/json-schema-webhook-drift\/lib\/compare/.test(src), false);
  assert.equal(/engines\/route-table-diff\/lib\/diff/.test(src), false);
  assert.equal(classify({ swagger: "2.0", paths: {} }).kind, "openapi");
});
