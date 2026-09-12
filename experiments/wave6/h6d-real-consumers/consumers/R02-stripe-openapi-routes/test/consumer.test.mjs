import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FIXTURES,
  JOB_ID,
  KIT_SHA256,
  runControlIdentical,
  runControlUnusedPointer,
  runNegativeLiveUrl,
  runNegativeMissing,
  runNegativeOpenApiAsRouteTable,
  runNegativeOpenApiAsSchema,
  runNegativeYarnLock,
  runPositive,
} from "../adapter.mjs";
import { witness } from "../witness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function tmpOut(label) {
  return mkdtempSync(join(tmpdir(), `r02-${label}-`));
}

function readBrief(run) {
  const p = run.outputs["upgrade-brief.json"];
  if (!p) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

test("kit archive pin matches published 1.4.0 bytes", () => {
  const archive = join(ROOT, "../../../../../client/public/kit/useful-jobs-1.4.0.tar.gz");
  assert.equal(existsSync(archive), true);
  const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
  assert.equal(digest, KIT_SHA256);
});

test("positive: official Stripe pair used ops around customers/charges/payment_intents", { timeout: 120_000 }, () => {
  const outDir = tmpOut("positive");
  const run = runPositive(outDir);
  assert.equal(run.timedOut, false, run.error || "timed out");
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.stdoutJson?.ok, true);
  assert.equal(run.stdoutJson?.appId, JOB_ID);
  assert.equal(existsSync(join(outDir, "upgrade-brief.json")), true);
  assert.equal(existsSync(join(outDir, "upgrade-brief.md")), true);

  const brief = readBrief(run);
  assert.equal(brief.noPurchaseAuthority, true);
  assert.equal(brief.notMarketFact, true);
  assert.match(String(brief.status), /^(partial|informational|actionable)$/);

  const w = witness(FIXTURES.before, FIXTURES.after, FIXTURES.used);
  assert.equal(w.fact, "openapi-method-path");
  assert.deepEqual(w.added, []);
  assert.deepEqual(w.removed, []);
  assert.equal(w.unknown.length, 0);
  assert.equal(w.usedCount, 13);
  assert.equal(w.unchanged.includes("GET /v1/customers"), true);
  assert.equal(w.unchanged.includes("GET /v1/charges"), true);
  assert.equal(w.unchanged.includes("GET /v1/payment_intents"), true);
  assert.equal(w.changed.includes("POST /v1/payment_intents"), true);
  assert.equal(w.changed.includes("POST /v1/payment_intents/{intent}/confirm"), true);
  assert.equal(w.changed.includes("POST /v1/customers/{customer}/subscriptions"), true);

  const retire = (brief.actions || []).filter((a) => a.kind === "retire-or-migrate");
  assert.equal(retire.length, 0, "used method+path set was not removed");
});

test("control: identical before/after has no method+path delta", { timeout: 120_000 }, () => {
  const outDir = tmpOut("control");
  const run = runControlIdentical(outDir);
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.stdoutJson?.ok, true);
  const w = witness(FIXTURES.before, FIXTURES.before, FIXTURES.used);
  assert.deepEqual(w.added, []);
  assert.deepEqual(w.removed, []);
  assert.deepEqual(w.changed, []);
  assert.equal(w.unchanged.length, 13);
  const brief = readBrief(run);
  const high = (brief.actions || []).filter((a) => a.priority === "high");
  assert.equal(high.length, 0);
});

test("control: unused pointer is unknown, not invented as removed", { timeout: 120_000 }, () => {
  const outDir = tmpOut("unused");
  const run = runControlUnusedPointer(outDir);
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const w = witness(FIXTURES.before, FIXTURES.after, FIXTURES.usedUnusedPointer);
  const absent = w.unknown.filter((u) => u.key === "POST /v1/openai/chat/completions");
  assert.equal(absent.length, 1);
  assert.equal(absent[0].reason, "absent-in-both");
  assert.equal(w.removed.includes("POST /v1/openai/chat/completions"), false);
  assert.equal(w.unchanged.includes("GET /v1/customers"), true);
  const brief = readBrief(run);
  const actions = JSON.stringify(brief.actions || []);
  assert.equal(actions.includes("/v1/openai/chat/completions"), false);
});

test("negative: missing --used refuses closed", { timeout: 120_000 }, () => {
  const run = runNegativeMissing(tmpOut("missing"));
  assert.notEqual(run.status, 0);
  const blob = `${run.stdout}${run.stderr}`;
  assert.match(blob, /missing-required-inputs/);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
});

test("negative: yarn.lock is not a Stripe OpenAPI used-ops pair", { timeout: 120_000 }, () => {
  const run = runNegativeYarnLock(tmpOut("yarn"));
  const blob = `${run.stdout}${run.stderr}${JSON.stringify(run.stdoutJson || {})}`;
  const w = witness(FIXTURES.yarnLock, FIXTURES.after, FIXTURES.used);
  const failed = run.status !== 0 || run.stdoutJson?.ok === false || w.unknown.length > 0;
  assert.equal(failed, true, blob);
  assert.equal(blob.includes("https://api.stripe.com/v1/customers") && /fetched|live stripe/i.test(blob), false);
});

test("negative: OpenAPI as json-schema-webhook-drift is not-this-job-openapi", { timeout: 120_000 }, () => {
  const run = runNegativeOpenApiAsSchema(tmpOut("schema"));
  assert.notEqual(run.status, 0);
  const blob = `${run.stdout}${run.stderr}`;
  assert.match(blob, /not-this-job-openapi/);
});

test("negative: OpenAPI path map as route-table-diff is unsupported_catalog", { timeout: 120_000 }, () => {
  const run = runNegativeOpenApiAsRouteTable(tmpOut("routes"));
  assert.notEqual(run.status, 0);
  const blob = `${run.stdout}${run.stderr}`;
  assert.match(blob, /unsupported_catalog/);
});

test("negative: live Stripe URL is not a local capture and is not fetched as purchase", { timeout: 120_000 }, () => {
  const outDir = tmpOut("live");
  const run = runNegativeLiveUrl(outDir);
  const brief = readBrief(run);
  const status = brief?.status || run.stdoutJson?.status;
  assert.equal(status, "refused");
  assert.equal(brief?.noPurchaseAuthority, true);
  assert.equal(brief?.underlying?.ok, false);
  const blob = `${run.stdout}${run.stderr}${run.error || ""}`;
  assert.equal(/settled|paid call|live fetch succeeded/i.test(blob), false);
});

test("witness does not import kit engine compare modules", () => {
  const src = readFileSync(join(ROOT, "witness.mjs"), "utf8");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/engines\/.*\/lib\/compare/.test(src), false);
  assert.equal(/compareOpenApiImpact/.test(src), false);
});
