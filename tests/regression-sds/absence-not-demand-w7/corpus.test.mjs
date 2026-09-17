import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { interpretSpawn } from "./lib/child.mjs";
import { classifyAbsenceAsDemand } from "./lib/classify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
  });
}

function parseOut(r) {
  return JSON.parse(String(r.stdout || "").trim());
}

test("manifest has ≥5 cases including seeded absence-as-demand", () => {
  assert.ok(manifest.cases.length >= 5);
  assert.ok(
    manifest.cases.some(
      (c) => c.seededAbsenceAsDemand || c.id === manifest.seededAbsenceAsDemand,
    ),
  );
  assert.equal(manifest.feature, "absence-not-demand-w7");
});

test("each fixture classifies as reject with absence_as_demand", () => {
  for (const c of manifest.cases) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = classifyAbsenceAsDemand(raw.output || raw, { surface: raw.surface });
    assert.equal(v.reject, true, c.id);
    assert.ok(v.reasons.length > 0, c.id);
    assert.equal(v.absenceAsDemand, true, c.id);
    assert.ok(v.reasons.includes("absence_as_demand"), c.id);
    assert.equal(
      v.detail.claimedSuccess || v.detail.claimedDemand,
      true,
      `${c.id} must claim success or demand`,
    );
    assert.equal(v.detail.claimedDemand, true, `${c.id} must claim demand, not only ok:true`);
    if (Array.isArray(raw.expectedReasons)) {
      for (const reason of raw.expectedReasons) {
        assert.ok(v.reasons.includes(reason), `${c.id} missing ${reason}`);
      }
    }
  }
});

test("cold run.mjs exits 0 and rejects all", () => {
  const r = runNode("run.mjs", ["--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = parseOut(r);
  assert.equal(body.ok, true);
  assert.equal(body.result.failed, 0);
  assert.ok(body.result.total >= 5);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
  assert.equal(body.boundary.liveFetch, false);
});

test("seeded absence-as-demand as accept exits ≠0 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-absence-as-demand", "--json"]);
  assert.notEqual(r.status, 0);
  assert.equal(r.status, 1);
  const body = parseOut(r);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(
    (body.result?.reasons || body.error?.reasons || []).includes("absence_as_demand") ||
      body.result?.absenceAsDemand === true,
  );
});

test("verify --expect accept on route-absent-as-demand exits 1", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/route-absent-as-demand.json",
    "--expect",
    "accept",
  ]);
  assert.equal(r.status, 1);
  const body = parseOut(r);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
});

test("honest paidActivity.unavailable without demand is not absence-as-demand", () => {
  const honest = {
    ok: true,
    status: "ok",
    surface: "observatory",
    paidActivity: {
      available: false,
      reason: "x402stats snapshot has no registered-vs-paid split; organic is heuristic, not paid demand.",
      reconcile: { state: "missing", composed: null },
    },
    message: "paid activity unavailable; not inventing demand",
  };
  const v = classifyAbsenceAsDemand(honest, { surface: "observatory" });
  assert.equal(v.reject, false);
  assert.equal(v.absenceAsDemand, false);
  assert.equal(v.detail.claimedDemand, false);
  assert.ok(v.detail.absenceReasons.includes("paid_activity_unavailable"));

  const pricing = classifyAbsenceAsDemand(
    { ok: true, surface: "pricing", pricingRows: [], message: "No demand." },
    { surface: "pricing" },
  );
  assert.equal(pricing.reject, false, "empty pricing rows without a demand claim must not reject");

  const route = classifyAbsenceAsDemand(
    {
      ok: true,
      surface: "bazaar-tracker",
      routeAbsent: true,
      missingRouteId: "sds:/distribution/agent-surface-budget-audit",
      demand: false,
    },
    { surface: "bazaar-tracker" },
  );
  assert.equal(route.reject, false);

  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/controls/honest-paid-activity-unavailable.json",
    "--expect",
    "reject",
  ]);
  assert.equal(r.status, 1);
  assert.equal(parseOut(r).error.code, "FALSE_ACCEPT");
});

test("empty missingRouteId is not route_absent", () => {
  const v = classifyAbsenceAsDemand(
    { ok: true, demand: true, missingRouteId: "" },
    { surface: "bazaar-tracker" },
  );
  assert.equal(v.detail.absenceReasons.includes("route_absent"), false);
  assert.equal(v.reject, false);
});

test("--live is refused", () => {
  const r = runNode("run.mjs", ["--json", "--live"]);
  assert.equal(r.status, 2);
  const body = parseOut(r);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "LIVE_FORBIDDEN");
});

test("unknown --surface does not report pass", () => {
  const r = runNode("run.mjs", ["--json", "--surface", "merchantt"]);
  assert.equal(r.status, 2);
  assert.equal(parseOut(r).error.code, "UNKNOWN_ARGUMENT");
});

test("run.mjs --expect accept is the seeded path", () => {
  const r = runNode("run.mjs", ["--json", "--expect", "accept"]);
  assert.equal(r.status, 1);
  assert.equal(parseOut(r).error.code, "SEED_REJECT");
});

test("--expect without value or unknown value exits 2", () => {
  const missing = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/route-absent-as-demand.json",
    "--expect",
  ]);
  assert.equal(missing.status, 2);
  assert.equal(parseOut(missing).error.code, "USAGE");

  const bogus = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/route-absent-as-demand.json",
    "--expect",
    "bogus",
  ]);
  assert.equal(bogus.status, 2);
  assert.equal(parseOut(bogus).error.code, "USAGE");
});

test("--fixture outside the fixtures tree is rejected", () => {
  const abs = resolve(here, "../../../package.json");
  const r = runNode("verify.mjs", ["--json", "--fixture", abs]);
  assert.equal(r.status, 2);
  assert.equal(parseOut(r).error.code, "FIXTURE_OUTSIDE");
});

test("unknown fixture field is rejected", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/seeded/unknown-field.json",
  ]);
  assert.equal(r.status, 2);
  assert.equal(parseOut(r).error.code, "FIXTURE_UNKNOWN_FIELD");
});

test("malformed fixture JSON is rejected", () => {
  const r = runNode("verify.mjs", ["--json", "--fixture", "fixtures/seeded/malformed.json"]);
  assert.equal(r.status, 2);
  assert.equal(parseOut(r).error.code, "FIXTURE_INVALID");
});

test("matching claimed accept is SEED_MISSED, not SEED_REJECT", () => {
  const r = runNode("run.mjs", [
    "--json",
    "--seeded-absence-as-demand",
    "--fixture",
    "fixtures/seeded/matching-claim.json",
  ]);
  assert.equal(r.status, 1);
  const body = parseOut(r);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_MISSED");
  assert.notEqual(body.error.code, "SEED_REJECT");
});

test("expectedReasons mismatch is REASON_MISMATCH", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/seeded/reason-mismatch.json",
    "--expect",
    "reject",
  ]);
  assert.equal(r.status, 1);
  const body = parseOut(r);
  assert.equal(body.error.code, "REASON_MISMATCH");
  assert.ok(body.error.missing.includes("not_a_real_reason"));
});

test("timeout wins over a late matching reject", () => {
  const r = spawnSync(process.execPath, ["-e", "for(;;){}"], {
    encoding: "utf8",
    timeout: 80,
    killSignal: "SIGKILL",
  });
  const interpreted = interpretSpawn(r);
  assert.equal(interpreted.timedOut, true);
  assert.equal(interpreted.status, 124);
  assert.equal(interpreted.body.error.code, "ETIMEDOUT");
  assert.notEqual(interpreted.status, 0);
});
