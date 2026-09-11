import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadFixture } from "../lib/load-fixture.mjs";
import { rejectSeededAttempt } from "../lib/reject.mjs";
import { assertHonestDiagnostics, markFieldSigned } from "../lib/diagnose.mjs";
import {
  refuseH4Edit,
  refuseInstallLiveHooks,
  refusePaymentFnReassignment,
  refusePriceChange,
  assertLivePricesUnchanged,
  scanPackDoesNotEditH4,
  scanPackSourceForForbiddenLiveWork,
} from "../lib/guardrails.mjs";
import {
  CHANGE_LIVE_PRICES,
  EDIT_H4_DIRECTORY,
  INSTALL_LIVE_HOOKS,
  REWRITE_PAYLOAD_TO_FIX_DISCOVERY,
  UNSIGNED_HINT_NOT_AUTHORITY,
} from "../lib/failures.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("seeded failure: unsigned hint as signature authority", () => {
  const expected = {
    code: "unsigned-hint-is-not-authority",
    rejected: true,
    signedAuthority: "payload",
    unsignedHints: ["resource", "extensions.bazaar"],
    reason:
      "resource and extensions.bazaar are unsigned indexing hints; only payload carries payment-signature authority",
  };
  assert.deepEqual(UNSIGNED_HINT_NOT_AUTHORITY, expected);

  const loaded = loadFixture(join(packRoot, "fixtures/unsigned-hint-as-authority.json"));
  const rejected = rejectSeededAttempt(loaded);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.rejected, true);
  assert.deepEqual(rejected.failure, expected);

  const dishonestResource = {
    field: "resource",
    present: true,
    signed: true,
    drift: "none",
  };
  const resourceCheck = assertHonestDiagnostics([dishonestResource]);
  assert.equal(resourceCheck.ok, false);
  if (!resourceCheck.ok) {
    assert.deepEqual(resourceCheck.failure, expected);
    assert.deepEqual(resourceCheck.offender, dishonestResource);
  }

  const mark = markFieldSigned("resource", true);
  assert.equal(mark.ok, false);
  if (!mark.ok) assert.deepEqual(mark.failure, expected);
});

test("seeded failure: rewriting payload to fix discovery", () => {
  const expected = {
    code: "rewrite-payload-to-fix-discovery",
    rejected: true,
    signedAuthority: "payload",
    mutatedSignedPayload: false,
    reason:
      "Discovery-hint repair must not rewrite paymentPayload.payload; filling omitted route-owned hints is unsigned and must leave signed authority unchanged",
  };
  assert.deepEqual(REWRITE_PAYLOAD_TO_FIX_DISCOVERY, expected);
  const loaded = loadFixture(join(packRoot, "fixtures/rewrite-payload-to-fix-discovery.json"));
  const rejected = rejectSeededAttempt(loaded);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.failure, expected);
});

test("seeded failure: installing live ResourceServer hooks", () => {
  const expected = {
    code: "install-live-resource-server-hooks",
    rejected: true,
    installLiveHooks: false,
    onBeforeVerify: false,
    onBeforeSettle: false,
    reason:
      "G02 asserts PR54 hook rules in fixtures; it must not install live ResourceServer onBeforeVerify/onBeforeSettle hooks",
  };
  assert.deepEqual(INSTALL_LIVE_HOOKS, expected);
  const loaded = loadFixture(join(packRoot, "fixtures/install-live-hooks.json"));
  const rejected = rejectSeededAttempt(loaded);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.failure, expected);
  const direct = refuseInstallLiveHooks({
    resourceServer: { onBeforeVerify() {}, onBeforeSettle() {} },
  });
  assert.equal(direct.ok, false);
  assert.deepEqual(direct.failure, expected);
});

test("seeded failure: changing live prices", () => {
  const expected = {
    code: "change-live-prices",
    rejected: true,
    livePrices: {
      extract: "$0.005",
      "seller-integrity-audit": "$0.01",
    },
    verifyPaymentReassigned: false,
    settlePaymentReassigned: false,
    reason: "Must not change live prices or reassign verifyPayment / settlePayment",
  };
  assert.deepEqual(CHANGE_LIVE_PRICES, expected);
  const loaded = loadFixture(join(packRoot, "fixtures/change-live-prices.json"));
  const rejected = rejectSeededAttempt(loaded);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.failure, expected);
  assert.deepEqual(refusePriceChange({ extract: "$0.006" }).failure, expected);
  assert.deepEqual(refusePaymentFnReassignment({ verifyPayment: () => "nope" }).failure, expected);
  const live = assertLivePricesUnchanged();
  assert.equal(live.ok, true);
  assert.equal(live.extract, "$0.005");
});

test("seeded failure: editing H4 directory", () => {
  const expected = {
    code: "edit-h4-directory",
    rejected: true,
    ownedBy: "H4",
    path: "experiments/cursor-wave-20260911/h4-precise-repairs/",
    reason: "H4 owns experiments/cursor-wave-20260911/h4-precise-repairs/; G02 may import, never edit",
  };
  assert.deepEqual(EDIT_H4_DIRECTORY, expected);
  const loaded = loadFixture(join(packRoot, "fixtures/edit-h4-directory.json"));
  const rejected = rejectSeededAttempt(loaded);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.failure, expected);
  const write = refuseH4Edit({
    action: "write",
    path: "experiments/cursor-wave-20260911/h4-precise-repairs/RECEIPT.md",
  });
  assert.equal(write.ok, false);
  assert.deepEqual(write.failure, expected);
});

test("pack source does not install live hooks, reassign payment fns, or write H4", () => {
  const hooks = scanPackSourceForForbiddenLiveWork();
  assert.equal(hooks.ok, true);
  assert.equal(hooks.installLiveHooks, false);
  const h4 = scanPackDoesNotEditH4();
  assert.equal(h4.ok, true);
  assert.equal(h4.editedH4, false);
});
