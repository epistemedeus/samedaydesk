import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { packDossier } from "../lib/pack.mjs";
import { CHECKOUT_TEST_PATH, F08_SHA, SDS52_SHA, WRAPPER_RECEIPT_SCHEMA } from "../lib/pins.mjs";
import { runPinChecks } from "../lib/source-status.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");

describe("local-runtime vs fixture classes", () => {
  test("local HTTP checkout verify returns fulfillmentPending and packs as checkout-intake", (t) => {
    const captureBin = join(root, "lib/capture-checkout-http.mjs");
    const r = spawnSync(process.execPath, [captureBin], {
      encoding: "utf8",
      cwd: repo,
      timeout: 30_000,
      env: {
        ...process.env,
        STRIPE_SECRET_KEY: "sk_test_fixture_not_a_real_key",
        STRIPE_WEBHOOK_SECRET: "whsec_fixture_not_a_real_secret",
        SUPABASE_JWT_SECRET: "fixture-only-local-jwt-secret-32bytes",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
        RESEND_API_KEY: "",
      },
    });
    if (r.status !== 0) {
      t.diagnostic(r.stderr + r.stdout);
    }
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.capture.class, "local-runtime");
    assert.equal(json.capture.http.status, 200);
    assert.equal(json.capture.verify.fulfillmentPending, true);
    assert.equal(json.capture.verify.verified, true);
    assert.equal(json.capture.order.status, "intake_required");
    assert.equal(json.packed.ok, true);
    assert.equal(json.packed.sold, false);
    assert.equal(json.packed.evidence[0].sourceKind, "checkout-intake");
    assert.equal(json.packed.evidence[0].origin.class, "local-runtime");
    assert.equal(json.packed.evidence[0].observationStatus, "observed");
    assert.equal(json.packed.evidence[0].observedHttpStatus, 200);
    assert.equal(json.packed.evidence[0].outcomeKind, "incomplete-delivery");
    assert.notEqual(json.packed.evidence[0].outcomeKind, "transport-failure");
  });

  test("published checkout HTTP test still asserts fulfillmentPending and intake_required", () => {
    const src = readFileSync(join(repo, CHECKOUT_TEST_PATH), "utf8");
    assert.match(src, /fulfillmentPending, true/);
    assert.match(src, /intake_required/);
    assert.match(src, /http:\/\/127\.0\.0\.1/);
  });

  test("F08 capture pin and SDS52 current pin are verified distinct worktrees, never a passing skip", () => {
    const checks = runPinChecks();
    const f08 = checks.find((row) => row.id === "f08-pin-worktree");
    const sds52 = checks.find((row) => row.id === "sds52-pin-worktree");
    assert.equal(f08.status, "observed", f08.detail);
    assert.equal(f08.pass, true, f08.detail);
    assert.equal(f08.sha, F08_SHA);
    assert.equal(sds52.status, "observed", sds52.detail);
    assert.equal(sds52.pass, true, sds52.detail);
    assert.equal(sds52.sha, SDS52_SHA);
    assert.notEqual(F08_SHA, SDS52_SHA);
    assert.match(readFileSync(`${process.env.F08_READONLY_WORKTREE || "/tmp/ro-worktrees/f08-bae3e7cd"}/server/paid-useful-jobs/lib/receipt.mjs`, "utf8"), new RegExp(WRAPPER_RECEIPT_SCHEMA.replace(/\./g, "\\.")));
  });

  test("copied checkout fixture is labelled fixture, not local-runtime proof", () => {
    const packed = packDossier({
      items: [
        {
          sourceKind: "checkout-intake",
          body: JSON.parse(
            readFileSync(join(root, "fixtures/checkout-intake/fulfillment-pending-verify.json"), "utf8"),
          ),
        },
      ],
    });
    assert.equal(packed.ok, true);
    assert.equal(packed.evidence[0].origin.class, "fixture");
    assert.equal(packed.evidence[0].observationStatus, "fixture");
    assert.equal(packed.evidence[0].observedHttpStatus, null);
    assert.equal(packed.evidence[0].outcomeKind, "incomplete-delivery");
  });
});
