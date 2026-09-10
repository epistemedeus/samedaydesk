import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseDistributionRepair } from "../src/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const CLI = path.join(PKG, "bin/distribution-repair.mjs");
const CLOCK = "2026-09-10T20:15:00.000Z";

function run(args, cwd = PKG) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parse(stdout) {
  return JSON.parse(String(stdout).trim());
}

function loadExample(rel) {
  return JSON.parse(fs.readFileSync(path.join(PKG, "examples", rel), "utf8"));
}

test("schema command exposes identity + record pair contract", () => {
  const r = run(["schema"]);
  assert.equal(r.status, 0, r.stderr);
  const out = parse(r.stdout);
  assert.equal(out.input.schema, "pilot.s185.distribution_repair_input.v1");
  assert.equal(out.pins.record04, "0e703bd4682894df4e1d25c61b594cac49f2463c");
  assert.equal(out.pins.dist08, "ea000772cdbd6d5df7174369dcef9aa2270e5723");
  assert.equal(out.pins.nl06, "76c0732b241beaa569f05a7394fdbf49604ffb66");
});

test("two distinct caller-supplied inputs are not bundled demos and diverge on identity + routeKey", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s185-caller-"));
  const aSrc = path.join(PKG, "examples/caller/alpha.json");
  const bSrc = path.join(PKG, "examples/caller/beta.json");
  const aPath = path.join(tmp, "operator-alpha.json");
  const bPath = path.join(tmp, "operator-beta.json");
  fs.copyFileSync(aSrc, aPath);
  fs.copyFileSync(bSrc, bPath);

  const ra = run(["diagnose", aPath, "--clock", CLOCK], tmp);
  const rb = run(["diagnose", bPath, "--clock", CLOCK], tmp);
  assert.equal(ra.status, 0, ra.stderr || ra.stdout);
  assert.equal(rb.status, 0, rb.stderr || rb.stdout);
  const a = parse(ra.stdout);
  const b = parse(rb.stdout);

  assert.equal(a.inputId, "caller-alpha-docs-redirect");
  assert.equal(b.inputId, "caller-beta-api-redirect");
  assert.notEqual(a.inputId, "s185-example-positive");
  assert.notEqual(b.inputId, "s185-example-positive");
  assert.equal(a.status, "diagnosed");
  assert.equal(b.status, "diagnosed");
  assert.equal(a.identity.record.jobRef, "operator-alpha-20260910");
  assert.equal(b.identity.record.jobRef, "operator-beta-20260910");
  assert.equal(a.identity.record.provider, "grexal");
  assert.equal(b.identity.record.provider, "agensi");
  assert.equal(a.matching.compatible, true);
  assert.equal(b.matching.compatible, true);
  assert.equal(a.matching.joinedCount, 12);
  assert.equal(b.matching.joinedCount, 2);
  assert.equal(a.matching.keys.includes("jobRef"), true);
  assert.equal(b.matching.keys.includes("jobRef"), true);
  assert.equal(a.repair.beforeAfter.routeKey, "/docs");
  assert.equal(a.repair.beforeAfter.before.deltaObserved, "redirected");
  assert.equal(
    a.repair.beforeAfter.after.recommendation,
    "update_listed_route_or_redirect_target",
  );
  assert.equal(b.repair.beforeAfter.routeKey, "/api/v1");
  assert.equal(b.repair.beforeAfter.before.deltaObserved, "redirected");
  assert.equal(
    b.repair.beforeAfter.after.recommendation,
    "update_listed_route_or_redirect_target",
  );
  const aKeys = (a.feed.repairRecommendations || []).map((x) => x.routeKey).sort();
  const bKeys = (b.feed.repairRecommendations || []).map((x) => x.routeKey).sort();
  assert.ok(aKeys.includes("/docs"));
  assert.ok(bKeys.includes("/api/v1"));
  assert.equal(aKeys.includes("/api/v1"), false);
  assert.equal(a.productionAcquisition, false);
  assert.equal(b.claims.grexalUniversalAdapter, false);
  assert.equal(a.diagnosis.status, "available");
  assert.equal(b.diagnosis.status, "available");
  for (const j of a.diagnosis.joined) {
    assert.equal(j.causationKnown, false);
    assert.equal(j.claims.conversionFromClick, false);
    assert.equal(j.claims.revenueFromListPrice, false);
  }
});

test("content-preserving filename rename does not change matching/diagnosis/repair", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s185-rename-"));
  const src = path.join(PKG, "examples/positive.json");
  const p1 = path.join(tmp, "listing-snapshot.json");
  const p2 = path.join(tmp, "renamed-capture-file.json");
  fs.copyFileSync(src, p1);
  fs.copyFileSync(src, p2);
  const r1 = run(["diagnose", p1, "--clock", CLOCK], tmp);
  const r2 = run(["diagnose", p2, "--clock", CLOCK], tmp);
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r2.status, 0, r2.stderr);
  const a = parse(r1.stdout);
  const b = parse(r2.stdout);
  assert.equal(a.status, "diagnosed");
  assert.equal(b.status, a.status);
  assert.equal(a.generatedAt, CLOCK);
  assert.equal(b.generatedAt, CLOCK);
  assert.deepEqual(a.matching, b.matching);
  assert.equal(a.diagnosis.status, b.diagnosis.status);
  assert.equal(a.diagnosis.joined.length, b.diagnosis.joined.length);
  assert.deepEqual(a.repair.beforeAfter, b.repair.beforeAfter);
  assert.deepEqual(
    a.feed.repairRecommendations.map((x) => [x.routeKey, x.delta, x.recommendation]),
    b.feed.repairRecommendations.map((x) => [x.routeKey, x.delta, x.recommendation]),
  );
});

test("real before/after route correction for /docs redirected", async () => {
  const result = await diagnoseDistributionRepair(loadExample("positive.json"), {
    clock: () => Date.parse(CLOCK),
  });
  assert.equal(result.status, "diagnosed");
  assert.equal(result.repair.beforeAfter.routeKey, "/docs");
  assert.equal(result.repair.beforeAfter.before.deltaObserved, "redirected");
  assert.equal(
    result.repair.beforeAfter.before.listingImplication,
    "listed_path_may_point_at_stale_target",
  );
  assert.equal(
    result.repair.beforeAfter.after.recommendation,
    "update_listed_route_or_redirect_target",
  );
  assert.equal(result.repair.beforeAfter.after.confidence, "high");
  const docs = result.feed.repairRecommendations.find((r) => r.routeKey === "/docs");
  assert.equal(docs.delta, "redirected");
  assert.equal(docs.recommendation, "update_listed_route_or_redirect_target");
  assert.equal(result.repair.ownerGuidance, true);
  assert.equal(result.repair.causalProofOfLostCustomers, false);
  assert.equal(result.claims.causalProofOfLostCustomers, false);
});

test("nonmatching source identity does not join", async () => {
  const result = await diagnoseDistributionRepair(loadExample("mismatch.json"), {
    clock: () => Date.parse(CLOCK),
  });
  assert.equal(result.status, "mismatch");
  assert.equal(result.matching.compatible, false);
  assert.equal(result.matching.reason, "nonmatching_source_identity");
  assert.equal(result.matching.joinedCount, 0);
  assert.ok(result.matching.unjoinedCount >= 1);
  assert.equal(result.identity.discovery.provider, "agensi");
  assert.equal(result.identity.record.provider, "grexal");
  assert.notEqual(result.identity.discovery.jobRef, result.identity.record.jobRef);
  assert.ok(result.gaps.some((g) => g.code === "identity_mismatch"));
  assert.equal(result.diagnosis.joined.length, 0);
  for (const u of result.diagnosis.unjoined) {
    assert.match(u.reason, /incompatible/i);
  }
  assert.equal(result.claims.grexalUniversalAdapter, false);
});

test("incomplete catalog cannot prove global removal", async () => {
  const result = await diagnoseDistributionRepair(loadExample("incomplete-catalog.json"), {
    clock: () => Date.parse(CLOCK),
  });
  assert.equal(result.status, "incomplete_catalog");
  assert.ok(result.gaps.some((g) => g.code === "incomplete_catalog"));
  assert.ok(result.repair.nextChecks.includes("complete_catalog_capture"));
  assert.equal(result.repair.causalProofOfLostCustomers, false);
  const blob = JSON.stringify(result);
  assert.equal(/globally removed and confirmed/i.test(blob), false);
  assert.equal(result.productionAcquisition, false);
});

test("missing record feed is an exact missing_record outcome", async () => {
  const result = await diagnoseDistributionRepair(loadExample("missing-record.json"), {
    clock: () => Date.parse(CLOCK),
  });
  assert.equal(result.status, "missing_record");
  assert.equal(result.feed, null);
  assert.equal(result.diagnosis, null);
  assert.equal(result.matching.reason, "missing_record_feed");
  assert.ok(result.gaps.some((g) => g.code === "missing_record_feed"));
  assert.ok(
    result.repair.nextChecks.includes("supply_baseline_and_current_route_snapshots"),
  );
});

test("malformed values refuse without a diagnosis", async () => {
  const result = await diagnoseDistributionRepair(loadExample("malformed.json"), {
    clock: () => Date.parse(CLOCK),
  });
  assert.equal(result.status, "malformed");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "forbidden_claim");
  assert.equal(result.diagnosis, null);
  assert.match(result.error.message, /Forbidden field/);
});

test("partial incomplete current maps removed → cannot_prove_global_removal", async () => {
  const result = await diagnoseDistributionRepair(loadExample("partial.json"), {
    clock: () => Date.parse(CLOCK),
  });
  assert.equal(result.status, "partial");
  assert.equal(result.feed.currentCaptureIncomplete, true);
  const oldBlog = result.feed.repairRecommendations.find((r) => r.routeKey === "/old-blog");
  assert.equal(oldBlog.delta, "removed");
  assert.equal(oldBlog.recommendation, "cannot_prove_global_removal");
  assert.equal(oldBlog.confidence, "low");
  assert.equal(oldBlog.coveragePreserved, true);
  assert.ok(result.gaps.some((g) => g.code === "current_capture_incomplete"));
  assert.ok(result.repair.nextChecks.includes("recheck_with_complete_capture"));
});

test("repeat run with changed state flips /docs redirected → unchanged", async () => {
  const first = await diagnoseDistributionRepair(loadExample("next-run/input.json"), {
    clock: () => Date.parse(CLOCK),
  });
  const second = await diagnoseDistributionRepair(
    loadExample("next-run/input-after-docs-fix.json"),
    { clock: () => Date.parse("2026-09-10T21:00:00.000Z") },
  );
  const d1 = first.feed.repairRecommendations.find((r) => r.routeKey === "/docs");
  const d2 = second.feed.repairRecommendations.find((r) => r.routeKey === "/docs");
  assert.equal(d1.delta, "redirected");
  assert.equal(d1.recommendation, "update_listed_route_or_redirect_target");
  assert.equal(d2.delta, "unchanged");
  assert.equal(d2.recommendation, "no_action_unchanged");
  assert.notEqual(first.repair.beforeAfter.routeKey === "/docs" ? first.repair.beforeAfter.before.deltaObserved : null, d2.delta);
  assert.equal(first.status, "diagnosed");
  assert.equal(second.status, "diagnosed");
  assert.notEqual(JSON.stringify(d1), JSON.stringify(d2));
});

test("CLI next-run manifest replays without a private workspace path", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s185-nrun-"));
  const input = path.join(tmp, "input.json");
  fs.copyFileSync(path.join(PKG, "examples/positive.json"), input);
  const manPath = path.join(tmp, "next.json");
  const r1 = run(["diagnose", input, "--clock", CLOCK, "--write-next-run", manPath], tmp);
  assert.equal(r1.status, 0, r1.stderr || r1.stdout);
  assert.ok(fs.existsSync(manPath));
  const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
  assert.equal(man.schema, "pilot.s185.distribution_repair_next_run.v1");
  assert.equal(man.productionAcquisition, false);
  assert.equal(man.paidValueClaim, false);
  const r2 = run(["diagnose", "--from-next-run", manPath, "--clock", CLOCK], os.tmpdir());
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  const second = parse(r2.stdout);
  assert.equal(second.status, "diagnosed");
  assert.equal(second.repair.beforeAfter.routeKey, "/docs");
});

test("missing identity is unknown and does not infer Grexal", async () => {
  const input = loadExample("positive.json");
  delete input.identity;
  delete input.discovery.identity;
  delete input.record.identity;
  const result = await diagnoseDistributionRepair(input, {
    clock: () => Date.parse(CLOCK),
  });
  assert.equal(result.status, "unknown");
  assert.ok(result.gaps.some((g) => g.code === "missing_identity"));
  assert.equal(result.identity.complete, false);
  assert.equal(result.matching.joinedCount, 0);
  assert.equal(result.claims.grexalUniversalAdapter, false);
  assert.ok(result.feed.repairRecommendations.length >= 1);
});
