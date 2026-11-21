import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bindUsefulDecision } from "../src/export.mjs";
import { DECISION_REASONS } from "../src/pins.mjs";
import { residualNeed, RESIDUAL_RIGHTS } from "../src/residual.mjs";
import { runSourceChangeAlert } from "../../recurring-job-recipes/recipes/source-change-alert.mjs";

// The direct route is the baseline. A wanted field the reused decision answers
// stays direct; a field the saved capture holds is a direct rerun; only a field
// absent from the capture becomes a residual need for the existing unfunded
// rails. Nothing is posted, paid or owed.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const cli = join(root, "cli.mjs");
const fixtures = join(repo, "tools/recurring-job-recipes/fixtures");
const priorPath = join(fixtures, "priors/source-change.prior.json");

const CLOCK = "2026-09-09T08:00:00.000Z";
const WEEK = 168;
const TASK = "residual-example";
const SUBJECT = "residual-example-decision";
const MARKET_KEY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

const loadJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function options(extra = {}) {
  return { taskId: TASK, subject: SUBJECT, sequence: 1, clock: CLOCK, horizonHours: WEEK, optIn: true, ...extra };
}

// The capture holds title and description; the recipe watched only title.
async function boundCase(dir) {
  const capture = {
    url: "https://example.com/",
    status: 200,
    title: "Example Domain",
    fields: { title: "Example Domain", description: "Illustrative domain" },
    contentHash: "sha256:residual-example-v1",
  };
  const capturePath = join(dir, "capture.json");
  writeJson(capturePath, capture);
  const prior = loadJson(priorPath);
  const manifest = {
    recipeId: "source-change-alert",
    recipeVersion: "samedaydesk.recurring-job-recipe-result.v1",
    fields: ["title"],
    prior: {
      sha256: prior.sha256,
      sequence: prior.sequence,
      createdAt: prior.createdAt,
      payload: { url: prior.payload.url, status: prior.payload.status, title: prior.payload.title, fields: prior.payload.fields, contentHash: prior.payload.contentHash },
    },
    capture,
  };
  const produced = await runSourceChangeAlert({ priorPath, currentFixturePath: capturePath, fields: ["title"], clock: CLOCK, horizonHours: WEEK });
  assert.equal(produced.outcome, "unchanged");
  const bound = bindUsefulDecision(manifest, produced, options());
  assert.equal(bound.ok, true, bound.message);
  return { manifest, observation: bound.observation };
}

function assertUnpaid(result) {
  assert.equal(result.paymentAuthority, "none");
  assert.equal(result.paidWork, false);
  assert.equal(result.debtCreated, false);
  assert.equal(result.obligationId, null);
  assert.equal(result.sent, false);
  assert.equal(result.producerInvoked, false);
}

test("a wanted field the reused decision answers stays on the direct route", async () => {
  const { manifest, observation } = await boundCase(mkdtempSync(join(tmpdir(), "residual-direct-")));
  for (const want of [undefined, ["title"]]) {
    const result = residualNeed(observation, manifest, options({ want }));
    assert.equal(result.ok, true, result.message);
    assert.equal(result.route, "direct");
    assert.equal(result.verdict, "reuse");
    assert.equal(result.residual, null);
    assert.equal(result.directRerun, null);
    assert.equal(result.decision.useful.outcome, "unchanged");
    assertUnpaid(result);
  }
});

test("a field the saved capture holds is a direct rerun, not a delegation", async () => {
  const { manifest, observation } = await boundCase(mkdtempSync(join(tmpdir(), "residual-rerun-")));
  const result = residualNeed(observation, manifest, options({ want: ["title", "description"] }));
  assert.equal(result.ok, true, result.message);
  assert.equal(result.route, "direct_rerun");
  assert.deepEqual(result.direct.fields, ["title"]);
  assert.deepEqual(result.directRerun.fields, ["description"]);
  assert.deepEqual(result.directRerun.watchFields, ["title", "description"]);
  assert.equal(result.residual, null);
  assertUnpaid(result);
});

test("only a field absent from the capture becomes a residual need for the unfunded rails", async () => {
  const { manifest, observation } = await boundCase(mkdtempSync(join(tmpdir(), "residual-need-")));
  const result = residualNeed(observation, manifest, options({
    want: ["title", "description", "price", "price"],
    acceptance: "Each value cites the public page it came from.",
  }));
  assert.equal(result.ok, true, result.message);
  assert.equal(result.route, "residual_need");
  assert.deepEqual(result.direct.fields, ["title"]);
  assert.deepEqual(result.directRerun.fields, ["description"]);
  assert.deepEqual(result.residual.fields, ["price"]);
  const post = result.residual.post;
  assert.deepEqual(Object.keys(post).sort(), ["criteria", "payableKinds", "summary", "title"]);
  assert.deepEqual(post.payableKinds, ["usable"]);
  assert.equal(post.criteria.length, 1);
  assert.match(post.criteria[0], MARKET_KEY);
  assert.equal(post.criteria[0], "remainder:price");
  assert.ok(Buffer.byteLength(post.title) <= 160);
  assert.match(post.summary, /no commission or payout/);
  assert.equal(post.summary.includes("title,"), false, "answered fields are not delegated");
  assert.deepEqual(result.residual.coldRequesterPost, ["post", "--title", post.title, "--summary", post.summary, "--criterion", post.criteria[0]]);
  const offer = result.residual.offerVoluntaryInput;
  assert.deepEqual(Object.keys(offer).sort(), ["authorizedToRequest", "contributorId", "rights", "taskId"]);
  assert.equal(offer.authorizedToRequest, false, "the requester affirms the request; nothing is preset");
  assert.equal(offer.rights.license, RESIDUAL_RIGHTS.license);
  assert.equal(offer.rights.scope, RESIDUAL_RIGHTS.scope);
  assert.equal(result.residual.acceptance.requesterReviewRequired, true);
  assertUnpaid(result);
  assert.equal(JSON.stringify(result).includes(priorPath), false);
});

test("a capture miss recomputes directly and never delegates the whole task", async () => {
  const { manifest, observation } = await boundCase(mkdtempSync(join(tmpdir(), "residual-miss-")));
  const changed = structuredClone(manifest);
  changed.capture.contentHash = "sha256:residual-example-v2";
  const result = residualNeed(observation, changed, options({ want: ["title", "price"] }));
  assert.equal(result.ok, true, result.message);
  assert.equal(result.route, "recompute");
  assert.equal(result.reason, DECISION_REASONS.digestMismatch);
  assert.equal(result.residual, null);
  assertUnpaid(result);
});

test("unsafe wanted fields and acceptance text are refused", async () => {
  const { manifest, observation } = await boundCase(mkdtempSync(join(tmpdir(), "residual-refuse-")));
  for (const extra of [
    { want: ["price<script>"] },
    { want: ["/etc/passwd"] },
    { want: Array.from({ length: 17 }, (_, i) => `f${i}`) },
    { want: ["price"], acceptance: "<script>alert(1)</script>" },
    { want: ["price"], acceptance: "x".repeat(513) },
  ]) {
    const result = residualNeed(observation, manifest, options(extra));
    assert.equal(result.ok, false, JSON.stringify(extra).slice(0, 80));
    assert.equal(result.residual, undefined);
  }
});

test("CLI residual prints the split and posts nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "residual-cli-"));
  const { manifest, observation } = await boundCase(dir);
  const manifestPath = join(dir, "manifest.json");
  const decisionPath = join(dir, "decision.json");
  writeJson(manifestPath, manifest);
  writeJson(decisionPath, observation);
  const common = ["--input", manifestPath, "--decision", decisionPath, "--task-id", TASK, "--subject", SUBJECT,
    "--sequence", "1", "--clock", CLOCK, "--horizon", String(WEEK), "--opt-in"];
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: repo });

  const need = run(["residual", ...common, "--want", "title,price"]);
  assert.equal(need.status, 0, need.stderr);
  const body = JSON.parse(need.stdout);
  assert.equal(body.route, "residual_need");
  assert.deepEqual(body.residual.fields, ["price"]);
  assert.equal(body.sent, false);

  const direct = run(["residual", ...common]);
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(JSON.parse(direct.stdout).route, "direct");

  const misplaced = run(["decide-or-reuse", ...common, "--want", "price"]);
  assert.equal(misplaced.status, 1);
  const noDecision = run(["residual", "--input", manifestPath, "--task-id", TASK, "--subject", SUBJECT, "--sequence", "1", "--clock", CLOCK, "--horizon", "168", "--opt-in"]);
  assert.equal(noDecision.status, 1);
  assert.equal(run([]).status, 2);
});
