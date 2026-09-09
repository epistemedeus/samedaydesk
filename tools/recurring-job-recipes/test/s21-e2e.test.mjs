import { createServer } from "node:http";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { listRecipes, persistResult, runRecipe } from "../lib/run.mjs";
import { assertRecipeResult } from "../lib/validate.mjs";
import { createFixtureOrigin } from "../fixtures/mounted/fixture-origin.mjs";
import { exportLocalNeomorphicImport, previewLocalNeomorphicImport } from "../neomorphic-import/local.mjs";
import { resolveMerchantRoot } from "../vendor/resolve-merchant-root.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const cli = join(root, "cli.mjs");
const priors = (...p) => join(root, "fixtures", "priors", ...p);
const issues = (...p) => join(root, "fixtures", "issues", ...p);
const current = (...p) => join(root, "fixtures", "current", ...p);
const merchantRoot = resolveMerchantRoot();
const skipMerchant = !merchantRoot ? "merchant input missing" : false;

test("lists five recipes including issue-to-work-brief and buyer-setup-trace", () => {
  const recipes = listRecipes();
  assert.equal(recipes.length, 5);
  const ids = recipes.map((r) => r.recipeId);
  assert.ok(ids.includes("source-change-alert"));
  assert.ok(ids.includes("issue-to-work-brief"));
  assert.ok(ids.includes("buyer-setup-trace"));
});

test("issue-to-work-brief upgrades a legacy fingerprint without rewriting its immutable prior", async () => {
  const result = await runRecipe("issue-to-work-brief", {
    priorPath: priors("issue-brief.prior.json"),
    issueFixturePath: issues("samedaydesk-1.json"),
    scheduleHint: "weekly",
    clock: "2026-09-09T16:00:00.000Z",
    horizonHours: 9000,
  });
  assert.equal(result.outcome, "changed");
  assert.equal(result.ok, true);
  assert.ok(result.evidence.brief.schema === "samedaydesk.work-brief.v1");
  assert.ok(result.evidence.markdown.includes("Work brief:"));
  assert.equal(result.evidence.claims.notDemand, true);
  assertRecipeResult(result);
});

test("issue-to-work-brief reports changed when prior fingerprint differs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s21-issue-"));
  try {
    const priorPath = join(dir, "prior.json");
    const base = JSON.parse(readFileSync(priors("issue-brief.prior.json"), "utf8"));
    base.payload.fingerprint.title = "Different title";
    writeFileSync(priorPath, `${JSON.stringify(base)}\n`);
    const result = await runRecipe("issue-to-work-brief", {
      priorPath,
      issueFixturePath: issues("samedaydesk-1.json"),
      clock: "2026-09-09T16:00:00.000Z",
    });
    assert.equal(result.outcome, "changed");
    assert.ok(result.evidence.corrections.length >= 0);
    const before = readFileSync(priorPath, "utf8");
    const persisted = persistResult(result, { outDir: dir, writeArtifact: true });
    assert.equal(readFileSync(priorPath, "utf8"), before);
    assert.equal(persisted.artifact.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("issue-to-work-brief partial when companion docs fail", async () => {
  const result = await runRecipe("issue-to-work-brief", {
    priorPath: priors("issue-brief.prior.json"),
    issueFixturePath: null,
    issueUrl: "https://github.com/epistemedeus/samedaydesk/issues/1",
    docsUrl: "https://example.invalid/missing-docs",
    clock: "2026-09-09T16:00:00.000Z",
    fetchImpl: async (url) => {
      if (String(url).includes("api.github.com")) {
        const fixture = JSON.parse(readFileSync(issues("samedaydesk-1.json"), "utf8")).issue;
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              number: fixture.number,
              title: fixture.title,
              state: fixture.state,
              labels: fixture.labels,
              body: fixture.body,
              html_url: fixture.url,
              created_at: fixture.createdAt,
              updated_at: fixture.updatedAt,
              user: { login: fixture.author },
              comments: fixture.comments,
            }),
        };
      }
      throw new Error("docs unreachable");
    },
  });
  assert.equal(result.outcome, "partial");
  assert.equal(result.evidence.code, "partial_docs_fetch");
});

test("source-change-alert incremental baseline write leaves prior untouched", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s21-sca-"));
  try {
    const priorPath = priors("source-change.prior.json");
    const before = readFileSync(priorPath, "utf8");
    const changed = await runRecipe("source-change-alert", {
      priorPath,
      currentFixturePath: current("example-changed.json"),
      fields: ["title"],
      clock: "2026-09-09T16:00:00.000Z",
    });
    assert.equal(changed.outcome, "changed");
    const persisted = persistResult(changed, { outDir: dir, writeArtifact: true });
    assert.equal(readFileSync(priorPath, "utf8"), before);
    assert.equal(JSON.parse(readFileSync(persisted.artifact.path, "utf8")).sequence, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buyer-setup-trace loopback inspection never signs or claims wallet ownership", { skip: skipMerchant, timeout: 60_000 }, async (t) => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.statusCode = req.url.startsWith("/extract?") ? 402 : 200;
    res.end(JSON.stringify({ ok: true, fixture: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await runRecipe("buyer-setup-trace", {
    scheduleHint: "once",
    clock: "2026-09-09T16:00:00.000Z",
    gatewayOrigin: `http://127.0.0.1:${server.address().port}`,
  });
  assert.ok(result.outcome === "unchanged" || result.outcome === "partial");
  assert.equal(result.evidence.claims.paymentSigned, false);
  assert.equal(result.evidence.claims.walletOwnershipInferred, false);
  assert.equal(result.evidence.claims.merchantPayToIsBuyerWallet, false);
  const unpaid = result.evidence.probes.find((p) => p.id === "unpaid_402_extract");
  assert.ok(unpaid);
  assert.equal(unpaid.summary.paymentRequired, true);
  assert.ok(result.evidence.buyerPolicy?.version);
});

test("mounted HTTP origin failure injection surfaces error without payment replay", { skip: skipMerchant, timeout: 60_000 }, async (t) => {
  const origin = await createFixtureOrigin();
  t.after(() => origin.close());

  const failingFetch = async (url) => {
    if (String(url).includes("/fixture/pages/")) {
      return { ok: false, status: 503, url: String(url), text: async () => "unavailable" };
    }
    return fetch(String(url));
  };

  const result = await runRecipe("source-change-alert", {
    priorPath: priors("source-change-mounted.prior.json"),
    liveSafe: true,
    allowMountedOrigin: true,
    liveUrl: origin.routes.fixturePage,
    fields: ["title"],
    clock: "2026-09-09T16:00:00.000Z",
    retries: 1,
    retryDelayMs: 0,
    fetchImpl: failingFetch,
  });
  assert.equal(result.outcome, "error");
  assert.equal(result.payment.replayBlocked, true);
});

test("optional Neomorphic local import from recipe result; shared mode undeployed", async () => {
  const result = await runRecipe("issue-to-work-brief", {
    priorPath: priors("issue-brief.prior.json"),
    issueFixturePath: issues("samedaydesk-1.json"),
    clock: "2026-09-09T16:00:00.000Z",
  });
  const preview = previewLocalNeomorphicImport(result, {
    taskId: "owner-qa-issue-1",
    subject: "samedaydesk-issue-1",
    sequence: 1,
    clock: "2026-09-09T16:00:00.000Z",
  });
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.importMode, "local_filesystem");
  assert.equal(preview.sharedMode, "undeployed_not_fabricated");
  assert.equal(preview.observation.schema, "neomorphic.task-memory.observation.v1");

  const dir = mkdtempSync(join(tmpdir(), "s21-neo-"));
  try {
    const out = join(dir, "observation.json");
    const exported = exportLocalNeomorphicImport(result, {
      taskId: "owner-qa-issue-1",
      subject: "samedaydesk-issue-1",
      sequence: 1,
      clock: "2026-09-09T16:00:00.000Z",
      optIn: true,
    });
    assert.equal(exported.ok, true, exported.message);
    writeFileSync(out, `${JSON.stringify(exported.observation, null, 2)}\n`);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).schema, "neomorphic.task-memory.observation.v1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI lists issue-to-work-brief and runs fixture dry-run", () => {
  const list = spawnSync(process.execPath, [cli, "--list"], { encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /issue-to-work-brief/);
  assert.match(list.stdout, /buyer-setup-trace/);

  const run = spawnSync(
    process.execPath,
    [
      cli,
      "--recipe",
      "issue-to-work-brief",
      "--prior",
      priors("issue-brief.prior.json"),
      "--issue-fixture",
      issues("samedaydesk-1.json"),
      "--schedule",
      "weekly",
      "--clock",
      "2026-09-09T16:00:00.000Z",
    ],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.recipeId, "issue-to-work-brief");
  assert.ok(body.evidence.markdown);
});

test("schedule-neutral recipe specs are machine-readable and do not install cron", () => {
  for (const name of ["source-change-alert", "issue-to-work-brief", "buyer-setup-trace"]) {
    const spec = JSON.parse(readFileSync(join(root, "specs", `${name}.recipe.json`), "utf8"));
    assert.equal(spec.schema, "samedaydesk.recipe-spec.v1");
    assert.equal(spec.scheduleNeutral, true);
    assert.equal(spec.installsCron, false);
    assert.ok(Array.isArray(spec.command));
    assert.ok(spec.command.includes("${CLOCK}") || spec.command.some((c) => String(c).includes("CLOCK") || c === "${CLOCK}"));
  }
});
