import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runJourney } from "../lib/journey.mjs";
import { UNSIGNED_HINT_NOT_AUTHORITY } from "../lib/failures.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("literal journey: intact payload + missing bazaar hint → missing_hint signed false, authority unchanged, dishonest fixture rejected", () => {
  const report = runJourney({
    fixturePath: join(packRoot, "fixtures/ok-payload.json"),
  });
  assert.equal(report.ok, true);
  assert.equal(report.command, "journey");
  assert.equal(report.purchaseAuthorized, false);
  assert.equal(report.sold, false);
  assert.equal(report.installLiveHooks, false);
  assert.equal(report.livePricesUnchanged, true);
  assert.equal(report.livePrices.extract, "$0.005");
  assert.equal(report.livePrices.sellerIntegrityAudit, "$0.01");
  assert.equal(report.steps[0].id, "intact_payload");
  assert.deepEqual(report.steps[0].diagnostics.find((row) => row.field === "payload"), {
    field: "payload",
    present: true,
    signed: true,
    drift: "none",
  });
  assert.deepEqual(report.steps[1].diagnostic, {
    field: "extensions.bazaar",
    present: false,
    signed: false,
    drift: "missing_hint",
  });
  assert.equal(report.steps[1].declinedPayment, false);
  assert.equal(report.steps[2].unchanged, true);
  assert.equal(report.steps[2].fillUntouchedAuthority, true);
  assert.equal(report.steps[2].mutatedOriginal, false);
  assert.equal(report.steps[3].rejected, true);
  assert.deepEqual(report.steps[3].failure, UNSIGNED_HINT_NOT_AUTHORITY);
});
