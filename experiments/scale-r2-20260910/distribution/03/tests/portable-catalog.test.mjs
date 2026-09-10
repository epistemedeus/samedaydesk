import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AVAILABILITY_STATUS,
  CATALOG_SCHEMA,
  CATALOG_STATUS,
  ERROR_CODES,
  assertAvailabilityDistinct,
  buildPortableCatalog,
  validateCatalog,
  validateInventory,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T18:45:00.000Z");

test("positive: Grexal active_public (S149) + Agensi pending_review", () => {
  const catalog = buildPortableCatalog(load("inventory.positive.json"), { clock });
  assert.equal(catalog.schema, CATALOG_SCHEMA);
  assert.equal(catalog.status, CATALOG_STATUS.READY);
  assert.equal(catalog.generatedAt, "2026-09-10T18:45:00.000Z");
  assert.equal(catalog.packages.length, 2);

  const grexal = catalog.packages.find((p) => p.id === "grexal-s124-source-change-evidence");
  const agensi = catalog.packages.find((p) => p.id === "agensi-s131-offline-package-provenance");
  assert.ok(grexal);
  assert.ok(agensi);
  assert.equal(grexal.sourcePin, "53dbb7adde7dfe89f4dc1fb5efe380389b4e420d");
  assert.equal(grexal.availability.status, AVAILABILITY_STATUS.ACTIVE_PUBLIC);
  assert.equal(grexal.availability.agentId, "j970cajvv6wbrmy64s2f4ajzw18e5j2q");
  assert.equal(grexal.availability.deploymentId, "j570f14047dzpkhc0trh3fnp8s8e43sd");
  assert.equal(grexal.availability.deploymentVersion, "v1");
  assert.equal(grexal.availability.pricing.run_completed_usd, 0.02);
  assert.equal(grexal.availability.pricing.estimate_reserve_usd, 0.025);
  assert.equal(grexal.availability.pricing.estimateReserveIsCharge, false);
  assert.equal(grexal.availability.category, "developer-tools");
  assert.deepEqual(grexal.availability.tags, ["code", "diff", "evidence", "validation"]);
  assert.equal(grexal.availability.homepage, "samedaydesk.com");
  assert.equal(grexal.availability.customerExecutionRevenuePayout, false);
  assert.ok(
    grexal.availability.evidenceRefs.some((r) =>
      r.includes("receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json"),
    ),
  );

  assert.equal(agensi.availability.status, AVAILABILITY_STATUS.PENDING_REVIEW);
  assert.equal(agensi.availability.installs, 0);
  assert.equal(agensi.availability.tier, "Free");
  assert.equal(agensi.sourcePin, "8d677a68e320cc34050d533613530d3397cae630");

  const observed = grexal.installCommands.filter((c) => c.observed);
  const notRun = grexal.installCommands.filter((c) => !c.observed);
  assert.ok(observed.some((c) => c.command === "npm test"));
  assert.ok(observed.some((c) => c.command.includes("grexal@0.4.1 validate")));
  assert.ok(notRun.some((c) => c.command === "npm pack --ignore-scripts"));
  assert.ok(agensi.installCommands.some((c) => c.observed && c.command.includes("provenance.mjs")));

  assert.equal(catalog.mutationBoundary.executesProviderMutations, false);
  assert.equal(catalog.mutationBoundary.rebuildsPackages, false);
  validateCatalog(catalog);
});

test("active_public: exact S149 pricing/deployment fields required by validate", () => {
  const inv = load("inventory.positive.json");
  const bad = structuredClone(inv);
  delete bad.packages[0].availability.pricing.estimateReserveIsCharge;
  assert.throws(
    () => validateInventory(bad),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("negative: malformed inventory with invented buyers/revenue is rejected", () => {
  assert.throws(
    () => validateInventory(load("inventory.malformed.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
  assert.throws(
    () => buildPortableCatalog(load("inventory.malformed.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("partial: missing install commands → partial status + missingInputs", () => {
  const catalog = buildPortableCatalog(load("inventory.partial.json"), { clock });
  assert.equal(catalog.status, CATALOG_STATUS.PARTIAL);
  assert.ok(catalog.missingInputs.some((m) => m.includes("installCommands")));
  assert.equal(catalog.packages[0].availability.status, AVAILABILITY_STATUS.DRAFT_PRIVATE);
});

test("unavailable: capture unavailable omits users field", () => {
  const catalog = buildPortableCatalog(load("inventory.unavailable.json"), { clock });
  assert.equal(catalog.status, CATALOG_STATUS.UNAVAILABLE);
  const av = catalog.packages[0].availability;
  assert.equal(av.status, AVAILABILITY_STATUS.UNAVAILABLE);
  assert.equal(av.code, ERROR_CODES.UNAVAILABLE);
  assert.equal(
    Object.prototype.hasOwnProperty.call(av, "users"),
    false,
    "unavailable must not emit users field",
  );
});

test("no_users: capture succeeded with zero users is distinct status", () => {
  const catalog = buildPortableCatalog(load("inventory.no-users.json"), { clock });
  assert.equal(catalog.status, CATALOG_STATUS.NO_USERS);
  const av = catalog.packages[0].availability;
  assert.equal(av.status, AVAILABILITY_STATUS.NO_USERS);
  assert.equal(av.code, ERROR_CODES.NO_USERS);
  assert.equal(av.users, 0);
});

test("explicit: unavailable ≠ no_users (statuses, codes, users field)", () => {
  const unavailable = buildPortableCatalog(load("inventory.unavailable.json"), { clock });
  const noUsers = buildPortableCatalog(load("inventory.no-users.json"), { clock });
  assert.equal(assertAvailabilityDistinct(unavailable, noUsers), true);
  assert.notEqual(
    unavailable.packages[0].availability.status,
    noUsers.packages[0].availability.status,
  );
  assert.notEqual(unavailable.status, noUsers.status);
  assert.notEqual(
    unavailable.packages[0].availability.code,
    noUsers.packages[0].availability.code,
  );
});

test("validateCatalog rejects collapsed unavailable+users=0 pairing via labels", () => {
  const catalog = buildPortableCatalog(load("inventory.unavailable.json"), { clock });
  catalog.labels = { collapsedUnavailableAsNoUsers: true };
  assert.throws(
    () => validateCatalog(catalog),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("availability statuses include required set including active_public", () => {
  const required = [
    "available_local",
    "draft_private",
    "active_public",
    "pending_review",
    "unavailable",
    "no_users",
  ];
  for (const s of required) {
    assert.ok(Object.values(AVAILABILITY_STATUS).includes(s), `missing status ${s}`);
  }
});
