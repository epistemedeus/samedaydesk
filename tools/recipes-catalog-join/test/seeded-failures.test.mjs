import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseStderr, runJoin } from "./helpers.mjs";
import { PUBLISHED } from "../lib/paths.mjs";
import {
  JoinRefusal,
  REFUSAL,
  refuseEditPublishedSurface,
  refusePaymentRequiredAsPaid,
  refuseRecipeAsCatalogJob,
} from "../lib/refuse.mjs";
import { loadRouter } from "../lib/adapters.mjs";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const claim = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/seeded/recipe-as-catalog-job.json"), "utf8"),
);
const paidClaim = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/seeded/payment-required-as-paid.json"), "utf8"),
);
const mutate = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/seeded/mutate-catalog.json"), "utf8"),
);

test("seeded: claiming a recipe is a catalog job id is refused", () => {
  const before = sha256(PUBLISHED.catalog);
  const spawned = runJoin(["--claim-recipe-as-catalog-job", claim.recipeId]);
  assert.equal(spawned.status, 2);
  const body = parseStderr(spawned);
  assert.equal(body.ok, false);
  assert.equal(body.code, REFUSAL.RECIPE_IS_NOT_CATALOG_JOB);
  assert.equal(body.executionAuthorized, false);
  assert.equal(body.paid, false);
  assert.throws(
    () =>
      refuseRecipeAsCatalogJob({
        recipeId: claim.recipeId,
        claimedCatalogJobId: claim.claimedCatalogJobId,
        catalogJobIds: ["feed-agenda"],
      }),
    (err) => err instanceof JoinRefusal && err.code === REFUSAL.RECIPE_IS_NOT_CATALOG_JOB,
  );
  assert.equal(sha256(PUBLISHED.catalog), before);
});

test("seeded: treating routing paymentRequired as paid is refused", async () => {
  const router = await loadRouter();
  const route = router.routeJob({
    type: paidClaim.jobType,
    jobId: "seeded-payment",
    constraints: [],
  });
  assert.equal(route.paymentRequired, true);
  assert.equal(route.paid, false);
  assert.equal(route.executionAuthorized, false);
  assert.notEqual(route.paid, paidClaim.paid);

  const spawned = runJoin(["--treat-payment-required-as-paid"]);
  assert.equal(spawned.status, 2);
  const body = parseStderr(spawned);
  assert.equal(body.code, REFUSAL.PAYMENT_REQUIRED_IS_NOT_PAID);
  assert.equal(body.paid, false);

  assert.throws(
    () => refusePaymentRequiredAsPaid(route),
    (err) => err instanceof JoinRefusal && err.code === REFUSAL.PAYMENT_REQUIRED_IS_NOT_PAID,
  );
});

test("seeded: editing recipes or catalog is refused and files stay byte-identical", () => {
  const catalogBefore = sha256(PUBLISHED.catalog);
  const recipeBefore = sha256(join(PUBLISHED.recipeSpecsDir, "source-change-alert.recipe.json"));
  const matrixBefore = sha256(PUBLISHED.offerMatrix);

  for (const flag of ["--edit-catalog", "--edit-recipes"]) {
    const spawned = runJoin([flag]);
    assert.equal(spawned.status, 2, spawned.stderr);
    const body = parseStderr(spawned);
    assert.equal(body.code, REFUSAL.JOIN_IS_READ_ONLY);
    assert.equal(body.executionAuthorized, false);
  }

  const overwrite = runJoin(["--out", PUBLISHED.catalog]);
  assert.equal(overwrite.status, 2);
  assert.equal(parseStderr(overwrite).code, "out_path_hits_published_surface");

  assert.throws(
    () => refuseEditPublishedSurface({ action: mutate.action, path: mutate.targets[0] }),
    (err) => err instanceof JoinRefusal && err.code === REFUSAL.JOIN_IS_READ_ONLY,
  );

  assert.equal(sha256(PUBLISHED.catalog), catalogBefore);
  assert.equal(sha256(join(PUBLISHED.recipeSpecsDir, "source-change-alert.recipe.json")), recipeBefore);
  assert.equal(sha256(PUBLISHED.offerMatrix), matrixBefore);
});
