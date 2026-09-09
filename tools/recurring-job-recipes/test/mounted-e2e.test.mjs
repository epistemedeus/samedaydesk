import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runRecipe, persistResult } from "../lib/run.mjs";
import { assertRecipeResult } from "../lib/validate.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { loadPrior } from "../lib/prior.mjs";
import { CONTRACTS } from "../vendor/merchant-contracts.mjs";
import { resolveMerchantRoot } from "../vendor/resolve-merchant-root.mjs";
import { comparePageChangeArtifacts, mapPageChangeVerdictToRecipeOutcome } from "../vendor/page-change-bridge.mjs";
import { validateExtractBatchDocument } from "../vendor/extract-batch-bridge.mjs";
import { createFixtureOrigin } from "../fixtures/mounted/fixture-origin.mjs";
import { warmPageChangeOrigin } from "../fixtures/mounted/warmup.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const merchantFixtures = join(root, "fixtures", "merchant");
const priors = (...parts) => join(root, "fixtures", "priors", ...parts);
const current = (...parts) => join(root, "fixtures", "current", ...parts);
const pages = (...parts) => join(root, "fixtures", "pages", ...parts);

const merchantRoot = resolveMerchantRoot();
const skipMounted = !merchantRoot ? "merchant input checkout missing" : false;
const customerExample = merchantRoot ? join(merchantRoot, "examples/customer-x402") : null;

test("mounted merchant E2E against C31/C34 contracts", { skip: skipMounted, timeout: 120_000 }, async (t) => {
  const origin = await createFixtureOrigin();
  t.after(() => origin.close());
  await warmPageChangeOrigin(origin);

  await t.test("merchant input pin resolves", () => {
    assert.equal(JSON.parse(readFileSync(join(merchantRoot, "package.json"), "utf8")).name, "x402-merchant");
    assert.match(readFileSync(join(merchantRoot, "page-change-http.mjs"), "utf8"), /postRecipesPageChange/);
  });

  await t.test("C31 official CLI matches mounted HTTP unchanged semantics", async () => {
    const beforePath = join(merchantFixtures, "page-change/merchant/unchanged-before.json");
    const afterPath = join(merchantFixtures, "page-change/merchant/unchanged-after.json");
    const fields = ["title", "description"];

    const cli = spawnSync(
      process.execPath,
      [
        join(customerExample, "bin/page-change.mjs"),
        "compare",
        "--before",
        beforePath,
        "--after",
        afterPath,
        "--fields",
        fields.join(","),
        "--format",
        "json",
      ],
      { encoding: "utf8", cwd: customerExample },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const offline = JSON.parse(cli.stdout);
    assert.equal(offline.schema, CONTRACTS.C31.reportSchema);
    assert.equal(offline.verdict, "unchanged");
    assert.equal(offline.claims.paymentImpliesUsefulOutput, false);

    const http = await fetch(origin.routes.pageChange, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        before: { mediaType: "application/json", body: JSON.parse(readFileSync(beforePath, "utf8")) },
        after: { mediaType: "application/json", body: JSON.parse(readFileSync(afterPath, "utf8")) },
        fields,
      }),
    });
    assert.equal(http.status, 200);
    const body = await http.json();
    assert.equal(body.charged, false);
    assert.equal(body.schemaVersion, CONTRACTS.C31.httpSchema);
    assert.equal(body.report.verdict, offline.verdict);

    const bridge = await comparePageChangeArtifacts({ beforePath, afterPath, fields });
    assert.equal(mapPageChangeVerdictToRecipeOutcome(bridge.verdict), "unchanged");
  });

  await t.test("C31 changed customer-job and C34 skills index are discoverable", async () => {
    const health = await fetch(origin.routes.pageChangeHealth).then((r) => r.json());
    assert.equal(health.status, "ok");
    assert.equal(health.schemaVersion, CONTRACTS.C31.httpSchema);

    const skills = await fetch(origin.routes.skillsIndex).then((r) => r.json());
    assert.ok(Array.isArray(skills.skills));
    assert.ok(skills.skills.some((skill) => skill.name === "page-change"));
    assert.ok(skills.skills.some((skill) => skill.name === "explicit-record"));

    const beforePath = join(merchantFixtures, "page-change/customer-job/before.json");
    const afterPath = join(merchantFixtures, "page-change/customer-job/after.json");
    const changed = await comparePageChangeArtifacts({
      beforePath,
      afterPath,
      fields: ["title", "description", "headings"],
    });
    assert.equal(changed.verdict, "changed");

    const batchPath = join(merchantFixtures, "record/product-jsonld/delivery/extract-batch.json");
    const batch = await validateExtractBatchDocument(batchPath);
    assert.equal(batch.contract, "C34");
    assert.equal(batch.product, CONTRACTS.C34.product);
    assert.equal(batch.schemaVersion, CONTRACTS.C34.schemaVersion);
    assert.equal(typeof batch.charged, "boolean");
    assert.equal(typeof batch.partial, "boolean");
  });

  await t.test("recurring recipes across mounted fixture HTML and payment guard", async () => {
    const unchanged = await runRecipe("source-change-alert", {
      priorPath: priors("source-change-mounted.prior.json"),
      liveSafe: true,
      allowMountedOrigin: true,
      liveUrl: origin.routes.fixturePage,
      fields: ["title", "h1"],
      clock: "2026-09-09T15:00:00.000Z",
      fetchImpl: async (url) => fetch(String(url)),
    });
    assert.equal(unchanged.outcome, "unchanged");
    assertRecipeResult(unchanged);

    const changed = await runRecipe("source-change-alert", {
      priorPath: priors("source-change.prior.json"),
      currentFixturePath: current("example-changed.json"),
      fields: ["title"],
      clock: "2026-09-09T15:00:00.000Z",
    });
    assert.equal(changed.outcome, "changed");

    const partial = await runRecipe("comparable-record-extraction", {
      priorPath: priors("record-extract.prior.json"),
      sources: [
        { kind: "fixture", path: pages("example-a.html"), sourceKey: "fixtures/pages/example-a.html" },
        { kind: "fixture", path: pages("example-b-partial.html"), sourceKey: "fixtures/pages/example-b-partial.html" },
      ],
      fields: ["title", "h1"],
      clock: "2026-09-09T15:00:00.000Z",
    });
    assert.equal(partial.outcome, "partial");

    const stale = await runRecipe("source-change-alert", {
      priorPath: priors("source-change-stale.prior.json"),
      currentFixturePath: current("example-unchanged.json"),
      fields: ["title"],
      clock: "2026-09-09T15:00:00.000Z",
      horizonHours: 72,
    });
    assert.equal(stale.outcome, "stale_baseline");

    const blocked = await runRecipe("source-change-alert", {
      priorPath: priors("source-change-paid.prior.json"),
      currentFixturePath: current("example-unchanged.json"),
      replayPayment: true,
      clock: "2026-09-09T15:00:00.000Z",
    });
    assert.equal(blocked.outcome, "error");
    assert.equal(blocked.evidence.code, "payment_replay_blocked");

    const again = await runRecipe("source-change-alert", {
      priorPath: priors("source-change-paid.prior.json"),
      currentFixturePath: current("example-unchanged.json"),
      replayPayment: true,
      clock: "2026-09-09T15:00:00.000Z",
    });
    assert.equal(again.outcome, "error");
    const guard = inspectPaymentAuthority(loadPrior(priors("source-change-paid.prior.json")).prior, {
      replayPayment: true,
    });
    assert.equal(guard.ok, false);
    assert.equal(guard.code, "payment_replay_blocked");
  });

  await t.test("persistResult leaves immutable prior bytes untouched", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sdd-mounted-out-"));
    try {
      const priorPath = priors("source-change.prior.json");
      const before = readFileSync(priorPath, "utf8");
      const result = await runRecipe("source-change-alert", {
        priorPath,
        currentFixturePath: current("example-changed.json"),
        fields: ["title"],
        clock: "2026-09-09T15:00:00.000Z",
      });
      const persisted = persistResult(result, { outDir: dir, writeArtifact: true });
      assert.equal(persisted.ok, true);
      assert.equal(readFileSync(priorPath, "utf8"), before);
      assert.ok(persisted.artifact.ok);
      const artifact = JSON.parse(readFileSync(persisted.artifact.path, "utf8"));
      assert.equal(artifact.sequence, 2);
      assert.equal(artifact.immutable, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await t.test("C34 official record CLI validates extract-batch.v0 fixture", () => {
    const outDir = mkdtempSync(join(tmpdir(), "sdd-record-cli-"));
    try {
      const cli = spawnSync(
        process.execPath,
        [
          join(customerExample, "bin/record.mjs"),
          "--input",
          join(merchantFixtures, "record/product-jsonld/delivery/extract-batch.json"),
          "--mapping",
          join(merchantFixtures, "record/required-sku/mapping.json"),
          "--schema",
          join(merchantFixtures, "record/required-sku/schema.json"),
          "--out",
          outDir,
        ],
        { encoding: "utf8", cwd: customerExample },
      );
      assert.equal(cli.status, 1, "required sku missing should exit 1 with partial artifacts");
      const report = JSON.parse(readFileSync(join(outDir, "report.json"), "utf8"));
      assert.equal(report.status, "partial");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
