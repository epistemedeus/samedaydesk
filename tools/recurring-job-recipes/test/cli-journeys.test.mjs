import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateRecipeResult } from "../lib/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, "..");
const repoRoot = join(pack, "..", "..");
const cli = join(pack, "cli.mjs");
const CLOCK = "2026-09-09T15:00:00.000Z";

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
}

function parseOk(spawned) {
  assert.equal(spawned.status, 0, spawned.stderr || spawned.stdout);
  const body = JSON.parse(spawned.stdout);
  const check = validateRecipeResult(body);
  assert.equal(check.ok, true, (check.errors || []).join("; "));
  assert.equal(body.schema, "samedaydesk.recurring-job-recipe-result.v1");
  assert.equal(body.payment.replayBlocked, true);
  assert.equal(body.cost.primary.kind, "costs_unknown");
  return body;
}

test("CLI --list includes documented unchanged / partial / verification recipes", () => {
  const spawned = runCli(["--list"]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const recipes = JSON.parse(spawned.stdout);
  const ids = recipes.map((recipe) => recipe.recipeId);
  assert.ok(ids.includes("source-change-alert"));
  assert.ok(ids.includes("comparable-record-extraction"));
  assert.ok(ids.includes("verification-reconcile"));
});

test("documented CLI source-change-alert fixture is unchanged and exits 0", () => {
  const body = parseOk(
    runCli([
      "--recipe",
      "source-change-alert",
      "--prior",
      "tools/recurring-job-recipes/fixtures/priors/source-change.prior.json",
      "--current-fixture",
      "tools/recurring-job-recipes/fixtures/current/example-unchanged.json",
      "--schedule",
      "daily",
      "--clock",
      CLOCK,
      "--horizon",
      "168",
    ]),
  );
  assert.equal(body.ok, true);
  assert.equal(body.outcome, "unchanged");
  assert.equal(body.recipeId, "source-change-alert");
  assert.equal(body.scheduleHint, "daily");
  assert.equal(body.clock, CLOCK);
  assert.equal(body.recovery.action, "keep_prior");
  assert.equal(body.prior.immutable, true);
  assert.equal(body.evidence.kind, "field_diff");
  assert.deepEqual(body.evidence.changed, []);
  assert.equal(body.evidence.unchanged[0].field, "title");
  assert.equal(body.evidence.unchanged[0].value, "Example Domain");
});

test("documented CLI comparable-record-extraction fixture is partial and exits 0", () => {
  const body = parseOk(
    runCli([
      "--recipe",
      "comparable-record-extraction",
      "--prior",
      "tools/recurring-job-recipes/fixtures/priors/record-extract.prior.json",
      "--sources",
      "tools/recurring-job-recipes/fixtures/pages/example-a.html,tools/recurring-job-recipes/fixtures/pages/example-b-partial.html",
      "--fields",
      "title,h1",
      "--schedule",
      "weekly",
      "--clock",
      CLOCK,
    ]),
  );
  assert.equal(body.ok, true);
  assert.equal(body.outcome, "partial");
  assert.equal(body.recipeId, "comparable-record-extraction");
  assert.equal(body.scheduleHint, "weekly");
  assert.equal(body.recovery.action, "keep_partial_rows");
  assert.equal(body.evidence.kind, "comparable_records");
  assert.equal(body.evidence.summary.total, 2);
  assert.equal(body.evidence.summary.success, 2);
  assert.equal(body.evidence.summary.failure, 0);
  assert.ok(body.evidence.rows.some((row) => row.partial === true && Array.isArray(row.missing) && row.missing.includes("h1")));
  assert.ok(body.evidence.rows.some((row) => row.partial !== true && Array.isArray(row.missing) && row.missing.length === 0));
});

test("documented CLI verification-reconcile fixture is unchanged and exits 0", () => {
  const body = parseOk(
    runCli([
      "--recipe",
      "verification-reconcile",
      "--prior",
      "tools/recurring-job-recipes/fixtures/priors/verify.prior.json",
      "--candidate",
      "tools/recurring-job-recipes/fixtures/current/verify-candidate-unchanged.json",
      "--schedule",
      "daily",
      "--clock",
      CLOCK,
    ]),
  );
  assert.equal(body.ok, true);
  assert.equal(body.outcome, "unchanged");
  assert.equal(body.recipeId, "verification-reconcile");
  assert.equal(body.recovery.action, "keep_prior");
  assert.equal(body.evidence.kind, "verification_reconcile");
  assert.equal(body.evidence.partial, false);
  assert.deepEqual(body.evidence.mismatches, []);
  assert.equal(body.evidence.claims.noChangeProven, true);
  assert.equal(body.evidence.claims.comparable, true);
  assert.equal(body.evidence.claims.paymentImpliesUsefulOutput, false);
  assert.equal(body.evidence.claims.automaticPaymentReplay, false);
});

test("CLI verification-reconcile changed candidate exits 0 with mismatches", () => {
  const body = parseOk(
    runCli([
      "--recipe",
      "verification-reconcile",
      "--prior",
      "tools/recurring-job-recipes/fixtures/priors/verify.prior.json",
      "--candidate",
      "tools/recurring-job-recipes/fixtures/current/verify-candidate-changed.json",
      "--schedule",
      "daily",
      "--clock",
      CLOCK,
    ]),
  );
  assert.equal(body.ok, true);
  assert.equal(body.outcome, "changed");
  assert.equal(body.recovery.action, "review_and_sequence");
  assert.ok(body.evidence.mismatches.length > 0);
  assert.equal(body.evidence.claims.noChangeProven, false);
  assert.equal(body.evidence.claims.automaticPaymentReplay, false);
});

test("CLI verification-reconcile payment replay is blocked (non-zero exit, no replay)", () => {
  const spawned = runCli([
    "--recipe",
    "verification-reconcile",
    "--prior",
    "tools/recurring-job-recipes/fixtures/priors/verify.prior.json",
    "--candidate",
    "tools/recurring-job-recipes/fixtures/current/verify-candidate-payment-replay.json",
    "--schedule",
    "daily",
    "--clock",
    CLOCK,
  ]);
  assert.equal(spawned.status, 1, spawned.stderr || spawned.stdout);
  const body = JSON.parse(spawned.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.outcome, "error");
  assert.equal(body.recipeId, "verification-reconcile");
  assert.equal(body.evidence.kind, "payment_replay_blocked");
  assert.equal(body.payment.replayBlocked, true);
});
