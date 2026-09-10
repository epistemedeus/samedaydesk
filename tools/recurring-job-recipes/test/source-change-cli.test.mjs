import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fetchLiveSafe } from "../lib/fetch.mjs";
import { runRecipe } from "../lib/run.mjs";
import { assertRecipeResult } from "../lib/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const cli = join(root, "cli.mjs");
const priors = (...parts) => join(root, "fixtures", "priors", ...parts);
const current = (...parts) => join(root, "fixtures", "current", ...parts);
const pages = (...parts) => join(root, "fixtures", "pages", ...parts);
const CLOCK = "2026-09-09T15:00:00.000Z";

function runCli(args, extra = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
    ...extra,
  });
}

function parseCli(proc) {
  assert.equal(proc.error, undefined, proc.stderr || String(proc.error));
  return JSON.parse(proc.stdout);
}

test("CLI lists source-change-alert after compose", () => {
  const list = runCli(["--list"]);
  assert.equal(list.status, 0, list.stderr);
  const recipes = JSON.parse(list.stdout);
  const ids = recipes.map((recipe) => recipe.recipeId);
  assert.ok(ids.includes("source-change-alert"));
  const meta = recipes.find((recipe) => recipe.recipeId === "source-change-alert");
  assert.ok(meta.userBenefit.length > 20);
  assert.ok(meta.operatorSupplies.includes("priorPath") || meta.operatorSupplies.some((item) => String(item).includes("prior")));
});

test("CLI fixture journey unchanged exits 0 and keeps prior", () => {
  const priorPath = priors("source-change.prior.json");
  const before = readFileSync(priorPath, "utf8");
  const proc = runCli([
    "--recipe",
    "source-change-alert",
    "--prior",
    priorPath,
    "--current-fixture",
    current("example-unchanged.json"),
    "--fields",
    "title",
    "--schedule",
    "daily",
    "--clock",
    CLOCK,
    "--horizon",
    "168",
  ]);
  assert.equal(proc.status, 0, proc.stderr);
  const body = parseCli(proc);
  assertRecipeResult(body);
  assert.equal(body.recipeId, "source-change-alert");
  assert.equal(body.outcome, "unchanged");
  assert.equal(body.ok, true);
  assert.equal(body.recovery.action, "keep_prior");
  assert.equal(body.prior.immutable, true);
  assert.equal(body.payment.replayBlocked, true);
  assert.equal(body.payment.attempted, false);
  assert.equal(body.evidence.kind, "field_diff");
  assert.equal(body.evidence.changed.length, 0);
  assert.equal(body.evidence.unchanged[0].field, "title");
  assert.equal(body.evidence.unchanged[0].value, "Example Domain");
  assert.equal(body.cost.primary.kind, "costs_unknown");
  assert.equal(readFileSync(priorPath, "utf8"), before);
});

test("CLI fixture journey changed exits 0 with field diff and sequenced artifact", () => {
  const priorPath = priors("source-change.prior.json");
  const before = readFileSync(priorPath, "utf8");
  const dir = mkdtempSync(join(tmpdir(), "s33-sca-changed-"));
  try {
    const proc = runCli([
      "--recipe",
      "source-change-alert",
      "--prior",
      priorPath,
      "--current-fixture",
      current("example-changed.json"),
      "--fields",
      "title",
      "--schedule",
      "daily",
      "--clock",
      CLOCK,
      "--out-dir",
      dir,
      "--write-artifact",
    ]);
    assert.equal(proc.status, 0, proc.stderr);
    const body = parseCli(proc);
    assertRecipeResult(body);
    assert.equal(body.outcome, "changed");
    assert.equal(body.ok, true);
    assert.equal(body.recovery.action, "review_and_sequence");
    assert.equal(body.evidence.changed[0].field, "title");
    assert.equal(body.evidence.changed[0].before, "Example Domain");
    assert.equal(body.evidence.changed[0].after, "Example Domain Updated");
    assert.equal(body.payment.attempted, false);
    assert.equal(readFileSync(priorPath, "utf8"), before);
    assert.equal(body.persisted.ok, true);
    assert.equal(body.persisted.artifact.ok, true);
    const artifact = JSON.parse(readFileSync(body.persisted.artifact.path, "utf8"));
    assert.equal(artifact.sequence, 2);
    assert.equal(artifact.immutable, true);
    assert.equal(artifact.recipeId, "source-change-alert");
    assert.equal(artifact.payment.attempted, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI fixture journey stale_baseline exits 0 without comparing", () => {
  const proc = runCli([
    "--recipe",
    "source-change-alert",
    "--prior",
    priors("source-change-stale.prior.json"),
    "--current-fixture",
    current("example-unchanged.json"),
    "--fields",
    "title",
    "--clock",
    CLOCK,
    "--horizon",
    "72",
  ]);
  assert.equal(proc.status, 0, proc.stderr);
  const body = parseCli(proc);
  assertRecipeResult(body);
  assert.equal(body.outcome, "stale_baseline");
  assert.equal(body.recovery.action, "refresh_baseline");
  assert.equal(body.evidence.kind, "stale_baseline");
  assert.equal(body.stale.stale, true);
});

test("CLI fixture journey payment replay is blocked and does not purchase", () => {
  const priorPath = priors("source-change-paid.prior.json");
  const before = readFileSync(priorPath, "utf8");
  const proc = runCli([
    "--recipe",
    "source-change-alert",
    "--prior",
    priorPath,
    "--current-fixture",
    current("example-unchanged.json"),
    "--replay-payment",
    "--clock",
    CLOCK,
  ]);
  assert.equal(proc.status, 1, proc.stderr);
  const body = parseCli(proc);
  assert.equal(body.outcome, "error");
  assert.equal(body.ok, false);
  assert.equal(body.evidence.kind, "error");
  assert.equal(body.evidence.code, "payment_replay_blocked");
  assert.equal(body.payment.replayBlocked, true);
  assert.equal(body.payment.attempted, false);
  assert.equal(readFileSync(priorPath, "utf8"), before);
});

test("CLI HTML fixture journeys against mounted prior: unchanged then changed", () => {
  const priorPath = priors("source-change-mounted.prior.json");
  const before = readFileSync(priorPath, "utf8");

  const unchanged = runCli([
    "--recipe",
    "source-change-alert",
    "--prior",
    priorPath,
    "--current-fixture",
    pages("example-a.html"),
    "--fields",
    "title,h1",
    "--schedule",
    "daily",
    "--clock",
    CLOCK,
  ]);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  const same = parseCli(unchanged);
  assert.equal(same.outcome, "unchanged");
  assert.equal(same.evidence.source.kind, "fixture");
  assert.deepEqual(
    same.evidence.unchanged.map((row) => row.field).sort(),
    ["h1", "title"],
  );

  const changed = runCli([
    "--recipe",
    "source-change-alert",
    "--prior",
    priorPath,
    "--current-fixture",
    pages("example-b-partial.html"),
    "--fields",
    "title,h1",
    "--schedule",
    "daily",
    "--clock",
    CLOCK,
  ]);
  assert.equal(changed.status, 0, changed.stderr);
  const delta = parseCli(changed);
  assert.equal(delta.outcome, "changed");
  const byField = Object.fromEntries(delta.evidence.changed.map((row) => [row.field, row]));
  assert.equal(byField.title.before, "Alpha Watch Page");
  assert.equal(byField.title.after, "Beta Watch Page Changed");
  assert.equal(byField.h1.before, "Alpha");
  assert.equal(byField.h1.after, null);
  assert.equal(readFileSync(priorPath, "utf8"), before);
});

test("schedule-neutral source-change spec is restored and does not install cron", () => {
  const spec = JSON.parse(readFileSync(join(root, "specs", "source-change-alert.recipe.json"), "utf8"));
  assert.equal(spec.schema, "samedaydesk.recipe-spec.v1");
  assert.equal(spec.recipeId, "source-change-alert");
  assert.equal(spec.scheduleNeutral, true);
  assert.equal(spec.installsCron, false);
  assert.ok(Array.isArray(spec.command));
  assert.ok(spec.command.includes("source-change-alert"));
  assert.ok(spec.command.includes("${CLOCK}"));
  assert.ok(spec.oneOfSources.includes("current-fixture"));
  assert.ok(spec.outcomes.includes("unchanged"));
  assert.ok(spec.outcomes.includes("changed"));
  assert.ok(spec.outcomes.includes("stale_baseline"));
});

test("source-change live-safe still enforces S25 redirect and 1MiB policy", async () => {
  let calls = 0;
  let redirectMode = null;
  const redirected = await runRecipe("source-change-alert", {
    priorPath: priors("source-change.prior.json"),
    liveSafe: true,
    liveUrl: "https://example.com/",
    fields: ["title"],
    clock: CLOCK,
    fetchImpl: async (_url, init) => {
      calls += 1;
      redirectMode = init.redirect;
      return {
        ok: true,
        status: 200,
        url: "http://169.254.169.254/latest/meta-data/",
        text: async () => "<title>private destination</title>",
      };
    },
  });
  assert.equal(redirected.outcome, "error");
  assert.equal(calls, 1);
  assert.equal(redirectMode, "manual");
  assert.equal(redirected.evidence.attempts[0].retryable, false);
  assert.match(String(redirected.evidence.attempts[0].message || redirected.evidence.message), /final url|allowlist/i);

  let bodyRead = false;
  await assert.rejects(
    fetchLiveSafe("https://example.com/", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://example.com/",
        headers: { get: (name) => (name.toLowerCase() === "content-length" ? String(1024 * 1024 + 1) : null) },
        text: async () => {
          bodyRead = true;
          return "oversized";
        },
      }),
    }),
    /response exceeds 1048576 byte limit/,
  );
  assert.equal(bodyRead, false);
});
