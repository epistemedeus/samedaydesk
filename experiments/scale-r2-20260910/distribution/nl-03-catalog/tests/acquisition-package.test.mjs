import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACQUISITION_ERROR_CODES,
  ACQUISITION_SCHEMA,
  AVAILABILITY_STATUS,
  GREXAL_PUBLIC,
  buildAcquisitionPackage,
  buildPortableCatalog,
  validateAcquisitionPackage,
  assertAvailabilityDistinct,
  CATALOG_STATUS,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const loadEvidence = () =>
  JSON.parse(readFileSync(join(root, "evidence/listing-recheck-20260910T124127Z.json"), "utf8"));
const clock = () => Date.parse("2026-09-10T19:45:00.000Z");

test("positive package: readiness + recipe + site section + budget handoff", () => {
  const pkg = buildAcquisitionPackage({
    inventory: load("inventory.positive.json"),
    listingCapture: load("listing-capture.positive.json"),
    clock,
  });
  assert.equal(pkg.schema, ACQUISITION_SCHEMA);
  assert.equal(pkg.listing.url, GREXAL_PUBLIC.marketplaceUrl);
  assert.equal(pkg.listing.agentId, GREXAL_PUBLIC.agentId);
  assert.equal(pkg.listing.httpStatus, 200);
  assert.equal(pkg.listing.matchedPath, "/marketplace/[agentId]");
  assert.equal(pkg.listing.commercialFieldsSourcedFrom, "S149");
  assert.equal(pkg.listing.ssrEmbedsCommercialFields, false);

  assert.equal(pkg.readiness.noKey, true);
  assert.equal(pkg.readiness.paidInvokeExecuted, false);
  assert.equal(pkg.readiness.steps.length, 4);
  assert.equal(pkg.readiness.stopBefore, "marketplace_run");

  assert.equal(pkg.budgetHandoff.requiresConfirmation, true);
  assert.equal(pkg.budgetHandoff.listPriceUsd, 0.02);
  assert.equal(pkg.budgetHandoff.estimateReserveUsd, 0.025);
  assert.equal(pkg.budgetHandoff.estimateReserveIsCharge, false);
  assert.equal(pkg.budgetHandoff.paidInvokeExecuted, false);

  assert.equal(pkg.paidReady, false);
  assert.ok(pkg.acquisitionSectionMd.includes(GREXAL_PUBLIC.marketplaceUrl));
  assert.ok(pkg.acquisitionSectionMd.includes(GREXAL_PUBLIC.agentId));
  assert.match(pkg.acquisitionSectionMd, /Stop before Run/i);

  assert.equal(pkg.firstRunRecipe.publicRoute, GREXAL_PUBLIC.marketplaceUrl);
  assert.equal(pkg.firstRunRecipe.listingIdentifier, GREXAL_PUBLIC.agentId);
  assert.ok(pkg.firstRunRecipe.expectedInput.some((i) => i.name === "unifiedDiff"));
  assert.ok(pkg.firstRunRecipe.expectedOutput.some((o) => o.name === "summary"));
  assert.ok(pkg.firstRunRecipe.expectedOutput.some((o) => o.name === "diffBytes"));
  assert.ok(pkg.firstRunRecipe.expectedOutput.some((o) => o.name === "paidModelCalls"));

  assert.equal(pkg.packages.grexal.availability, AVAILABILITY_STATUS.ACTIVE_PUBLIC);
  assert.equal(pkg.packages.agensi.availability, AVAILABILITY_STATUS.PENDING_REVIEW);
  assert.equal(pkg.packages.agensi.installs, 0);

  assert.equal(pkg.mutationBoundary.grexalLogin, false);
  assert.equal(pkg.mutationBoundary.paidInvoke, false);
  assert.equal(pkg.mutationBoundary.inventsAdoption, false);
  assert.equal(pkg.mutationBoundary.startsNlDistribution06, false);

  validateAcquisitionPackage(pkg);
});

test("reject paid-without-confirmation", () => {
  assert.throws(
    () =>
      buildAcquisitionPackage({
        inventory: load("inventory.positive.json"),
        listingCapture: load("listing-capture.positive.json"),
        confirmation: { markPaidReady: true, confirmed: false },
        clock,
      }),
    (err) => err.code === ACQUISITION_ERROR_CODES.PAID_WITHOUT_CONFIRMATION,
  );
});

test("paid-ready only with confirmation flag (still paidInvokeExecuted=false)", () => {
  const pkg = buildAcquisitionPackage({
    inventory: load("inventory.positive.json"),
    listingCapture: load("listing-capture.positive.json"),
    confirmation: { markPaidReady: true, confirmed: true },
    clock,
  });
  assert.equal(pkg.paidReady, true);
  assert.equal(pkg.budgetHandoff.paidInvokeExecuted, false);
  validateAcquisitionPackage(pkg);
});

test("reject invented URL", () => {
  assert.throws(
    () =>
      buildAcquisitionPackage({
        inventory: load("inventory.positive.json"),
        listingCapture: load("listing-capture.invented-url.json"),
        clock,
      }),
    (err) => err.code === ACQUISITION_ERROR_CODES.INVENTED_URL,
  );
});

test("free-vs-priced correctness", () => {
  const pkg = buildAcquisitionPackage({
    inventory: load("inventory.positive.json"),
    listingCapture: load("listing-capture.positive.json"),
    clock,
  });
  const by = Object.fromEntries(pkg.freeVsPriced.map((x) => [x.action, x]));
  assert.equal(by.browse_marketplace_listing.cost, "free");
  assert.equal(by.local_offline_pack.cost, "free");
  assert.equal(by.marketplace_run.cost, "priced");
  assert.equal(by.marketplace_run.listPriceUsd, 0.02);
  assert.equal(by.marketplace_run.estimateReserveUsd, 0.025);
  assert.equal(by.marketplace_run.estimateReserveIsCharge, false);
});

test("unavailable ≠ no_users (catalog invariant reused)", () => {
  const unavailable = buildPortableCatalog(load("inventory.unavailable.json"), { clock });
  const noUsers = buildPortableCatalog(load("inventory.no-users.json"), { clock });
  assert.equal(unavailable.status, CATALOG_STATUS.UNAVAILABLE);
  assert.equal(noUsers.status, CATALOG_STATUS.NO_USERS);
  assertAvailabilityDistinct(unavailable, noUsers);
  const uAv = unavailable.packages[0].availability;
  assert.equal(Object.prototype.hasOwnProperty.call(uAv, "users"), false);
});

test("Agensi still pending_review installs=0", () => {
  const pkg = buildAcquisitionPackage({
    inventory: load("inventory.positive.json"),
    listingCapture: loadEvidence(),
    clock,
  });
  assert.equal(pkg.packages.agensi.availability, AVAILABILITY_STATUS.PENDING_REVIEW);
  assert.equal(pkg.packages.agensi.installs, 0);
});

test("validateAcquisitionPackage rejects paidReady without confirmation", () => {
  const pkg = buildAcquisitionPackage({
    inventory: load("inventory.positive.json"),
    listingCapture: load("listing-capture.positive.json"),
    clock,
  });
  const forged = structuredClone(pkg);
  forged.paidReady = true;
  forged.confirmation = { confirmed: false, markPaidReady: true };
  assert.throws(
    () => validateAcquisitionPackage(forged),
    (err) => err.code === ACQUISITION_ERROR_CODES.PAID_WITHOUT_CONFIRMATION,
  );
});
