import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { withRetries } from "../lib/fetch.mjs";
import { assertImmutable, loadPrior, writeSequencedArtifact } from "../lib/prior.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { listRecipes, persistResult, runRecipe, FIXTURES_DIR } from "../lib/run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const cli = join(root, "cli.mjs");

function prior(name) {
  return join(FIXTURES_DIR, "priors", name);
}
function current(name) {
  return join(FIXTURES_DIR, "current", name);
}
function page(name) {
  return join(FIXTURES_DIR, "pages", name);
}

test("lists three runnable recipes with user benefit and operator inputs", () => {
  const recipes = listRecipes();
  assert.equal(recipes.length, 3);
  for (const recipe of recipes) {
    assert.ok(recipe.recipeId);
    assert.ok(recipe.userBenefit.length > 20);
    assert.ok(Array.isArray(recipe.operatorSupplies));
    assert.ok(recipe.operatorSupplies.includes("scheduleHint") || recipe.operatorSupplies.some((item) => String(item).includes("schedule")));
  }
});

test("source-change-alert reports unchanged against immutable prior", async () => {
  const result = await runRecipe("source-change-alert", {
    priorPath: prior("source-change.prior.json"),
    currentFixturePath: current("example-unchanged.json"),
    fields: ["title"],
    scheduleHint: "daily",
    clock: "2026-09-09T15:00:00.000Z",
    horizonHours: 168,
  });
  assert.equal(result.outcome, "unchanged");
  assert.equal(result.ok, true);
  assert.equal(result.recovery.action, "keep_prior");
  assert.equal(result.prior.immutable, true);
  assert.equal(result.payment.replayBlocked, true);
  assert.equal(result.cost.primary.kind, "costs_unknown");
});

test("source-change-alert reports changed fields with review recovery", async () => {
  const result = await runRecipe("source-change-alert", {
    priorPath: prior("source-change.prior.json"),
    currentFixturePath: current("example-changed.json"),
    fields: ["title"],
    scheduleHint: "daily",
    clock: "2026-09-09T15:00:00.000Z",
  });
  assert.equal(result.outcome, "changed");
  assert.equal(result.evidence.changed[0].after, "Example Domain Updated");
  assert.equal(result.recovery.action, "review_and_sequence");
});

test("stale baseline is flagged instead of silent compare", async () => {
  const result = await runRecipe("source-change-alert", {
    priorPath: prior("source-change-stale.prior.json"),
    currentFixturePath: current("example-unchanged.json"),
    fields: ["title"],
    clock: "2026-09-09T15:00:00.000Z",
    horizonHours: 72,
  });
  assert.equal(result.outcome, "stale_baseline");
  assert.equal(result.recovery.action, "refresh_baseline");
});

test("retries transient observe failures then surfaces error evidence", async () => {
  let calls = 0;
  const retried = await withRetries(
    async () => {
      calls += 1;
      if (calls < 3) {
        const err = new Error("temporary");
        err.retryable = true;
        throw err;
      }
      return { ok: true };
    },
    { retries: 2, delayMs: 0 },
  );
  assert.equal(retried.ok, true);
  assert.equal(retried.retriesUsed, 2);
  assert.equal(calls, 3);

  let failCalls = 0;
  const failed = await withRetries(
    async () => {
      failCalls += 1;
      const err = new Error("still down");
      err.retryable = true;
      throw err;
    },
    { retries: 2, delayMs: 0 },
  );
  assert.equal(failed.ok, false);
  assert.equal(failCalls, 3);
  assert.equal(failed.attempts.length, 3);
});

test("comparable-record-extraction keeps partial rows visible", async () => {
  const result = await runRecipe("comparable-record-extraction", {
    priorPath: prior("record-extract.prior.json"),
    sources: [
      { kind: "fixture", path: page("example-a.html"), sourceKey: "fixtures/pages/example-a.html" },
      { kind: "fixture", path: page("example-b-partial.html"), sourceKey: "fixtures/pages/example-b-partial.html" },
    ],
    fields: ["title", "h1"],
    scheduleHint: "weekly",
    clock: "2026-09-09T15:00:00.000Z",
  });
  assert.equal(result.outcome, "partial");
  assert.equal(result.evidence.summary.success, 2);
  assert.ok(result.evidence.rows.some((row) => row.partial === true));
  assert.equal(result.recovery.action, "keep_partial_rows");
  assert.equal(result.cost.related.some((item) => item.kind === "sourced"), true);
});

test("verification-reconcile detects unchanged and changed candidates", async () => {
  const same = await runRecipe("verification-reconcile", {
    priorPath: prior("verify.prior.json"),
    candidatePath: current("verify-candidate-unchanged.json"),
    scheduleHint: "daily",
    clock: "2026-09-09T15:00:00.000Z",
  });
  assert.equal(same.outcome, "unchanged");
  assert.equal(same.evidence.claims.automaticPaymentReplay, false);

  const changed = await runRecipe("verification-reconcile", {
    priorPath: prior("verify.prior.json"),
    candidatePath: current("verify-candidate-changed.json"),
    scheduleHint: "daily",
    clock: "2026-09-09T15:00:00.000Z",
  });
  assert.equal(changed.outcome, "changed");
  assert.ok(changed.evidence.mismatches.length > 0);
});

test("no automatic replay of a payment from prior or candidate", async () => {
  const blockedPrior = inspectPaymentAuthority(
    loadPrior(prior("source-change-paid.prior.json")).prior,
    { replayPayment: true },
  );
  assert.equal(blockedPrior.ok, false);
  assert.equal(blockedPrior.code, "payment_replay_blocked");

  const blockedRun = await runRecipe("source-change-alert", {
    priorPath: prior("source-change-paid.prior.json"),
    currentFixturePath: current("example-unchanged.json"),
    replayPayment: true,
    clock: "2026-09-09T15:00:00.000Z",
  });
  assert.equal(blockedRun.outcome, "error");
  assert.equal(blockedRun.evidence.code, "payment_replay_blocked");

  const blockedCandidate = await runRecipe("verification-reconcile", {
    priorPath: prior("verify.prior.json"),
    candidatePath: current("verify-candidate-payment-replay.json"),
    clock: "2026-09-09T15:00:00.000Z",
  });
  assert.equal(blockedCandidate.outcome, "error");
  assert.equal(blockedCandidate.evidence.kind, "payment_replay_blocked");
});

test("immutable prior cannot be overwritten; sequenced artifact is written beside it", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-recipe-"));
  try {
    const priorPath = join(dir, "prior.json");
    writeFileSync(priorPath, `${JSON.stringify({ schema: "samedaydesk.recurring-job-prior.v1", sequence: 1 })}\n`);
    const guard = assertImmutable(priorPath, `${JSON.stringify({ schema: "other" })}\n`);
    assert.equal(guard.ok, false);
    assert.equal(guard.code, "prior_immutable");

    const written = writeSequencedArtifact(dir, "source-change-alert", 2, {
      schema: "samedaydesk.recurring-job-prior.v1",
      sequence: 2,
      immutable: true,
      payload: { title: "next" },
    });
    assert.equal(written.ok, true);
    assert.equal(JSON.parse(readFileSync(written.path, "utf8")).sequence, 2);

    const again = writeSequencedArtifact(dir, "source-change-alert", 2, {
      schema: "samedaydesk.recurring-job-prior.v1",
      sequence: 2,
    });
    assert.equal(again.ok, false);
    assert.equal(again.code, "artifact_exists");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("persistResult writes evidence report without mutating the prior file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-recipe-out-"));
  try {
    const before = readFileSync(prior("source-change.prior.json"), "utf8");
    const result = await runRecipe("source-change-alert", {
      priorPath: prior("source-change.prior.json"),
      currentFixturePath: current("example-changed.json"),
      fields: ["title"],
      clock: "2026-09-09T15:00:00.000Z",
    });
    const persisted = persistResult(result, { outDir: dir, writeArtifact: true });
    assert.equal(persisted.ok, true);
    assert.ok(persisted.reportPath);
    assert.equal(persisted.artifact.ok, true);
    assert.equal(readFileSync(prior("source-change.prior.json"), "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI dry-run fixtures exit 0 for unchanged and list recipes", () => {
  const list = spawnSync(process.execPath, [cli, "--list"], { encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /source-change-alert/);
  assert.match(list.stdout, /comparable-record-extraction/);
  assert.match(list.stdout, /verification-reconcile/);

  const run = spawnSync(
    process.execPath,
    [
      cli,
      "--recipe",
      "source-change-alert",
      "--prior",
      prior("source-change.prior.json"),
      "--current-fixture",
      current("example-unchanged.json"),
      "--schedule",
      "daily",
      "--clock",
      "2026-09-09T15:00:00.000Z",
      "--horizon",
      "168",
    ],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.outcome, "unchanged");
  assert.equal(body.meta.recipeId, "source-change-alert");
});

test("live-safe mock fetch path works without paid calls", async () => {
  const result = await runRecipe("source-change-alert", {
    priorPath: prior("source-change.prior.json"),
    liveSafe: true,
    liveUrl: "https://example.com/",
    fields: ["title"],
    clock: "2026-09-09T15:00:00.000Z",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: "https://example.com/",
      text: async () => "<html><head><title>Example Domain</title></head><body><h1>Example Domain</h1></body></html>",
    }),
  });
  assert.equal(result.outcome, "unchanged");
  assert.equal(result.evidence.source.kind, "live_safe");
});
