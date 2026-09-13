import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { packDossier } from "../lib/pack.mjs";
import { CHECKOUT_TEST_PATH, F08_RECEIPT_PATH, F08_SHA, WRAPPER_RECEIPT_SCHEMA } from "../lib/pins.mjs";

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
  });

  test("published checkout HTTP test still asserts fulfillmentPending and intake_required", () => {
    const src = readFileSync(join(repo, CHECKOUT_TEST_PATH), "utf8");
    assert.match(src, /fulfillmentPending, true/);
    assert.match(src, /intake_required/);
    assert.match(src, /http:\/\/127\.0\.0\.1/);
  });

  test("F08 pin worktree (optional) still emits schema samedaydesk.paid-useful-jobs.receipt.v1", (t) => {
    const worktree = process.env.F08_READONLY_WORKTREE || "/tmp/f08-paid-wrappers-bae3e7cd";
    const receiptFile = join(worktree, F08_RECEIPT_PATH);
    if (!existsSync(receiptFile)) {
      t.diagnostic(`F08 worktree absent at ${worktree}; fixture-only for this machine`);
      return;
    }
    const src = readFileSync(receiptFile, "utf8");
    assert.match(src, new RegExp(WRAPPER_RECEIPT_SCHEMA.replace(/\./g, "\\.")));
    const head = spawnSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" });
    assert.equal(head.stdout.trim(), F08_SHA);
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
  });
});
