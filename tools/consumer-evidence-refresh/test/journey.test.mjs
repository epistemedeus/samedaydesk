import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { refreshCase } from "../lib/refresh.mjs";
import { bindDigest } from "../lib/digest.mjs";
import { CUSTOMER_CASE, REPO, TOOL_DIR, runCli, tmpOut } from "./helpers.mjs";

describe("literal user journey", () => {
  it("redacted fixture case → refresh JSON with new digest, customer_owned true, privateLeak false", () => {
    const out = tmpOut();
    const spawned = runCli(
      ["--case", "fixtures/customer-owned-redacted.json", "--out", out],
      { cwd: TOOL_DIR },
    );
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const compact = JSON.parse(spawned.stdout);
    assert.equal(compact.ok, true);
    assert.equal(compact.customer_owned, true);
    assert.equal(compact.privateLeak, false);
    assert.equal(compact.sold, false);
    assert.equal(typeof compact.digest, "string");
    assert.match(compact.digest, /^[0-9a-f]{64}$/);
    assert.match(compact.bundleId, /^cer_[0-9a-f]{32}$/);
    assert.equal(compact.freshness, "unknown");

    const bundle = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(bundle.customer_owned, true);
    assert.equal(bundle.privateLeak, false);
    assert.equal(bundle.sold, false);
    assert.equal(bundle.purchaseAuthority, false);
    assert.equal(bundle.payment.attempted, false);
    assert.equal(bundle.freshness, "unknown");
    assert.equal(bundle.freshnessDetail.completeness, "unknown");
    assert.equal(bundle.claims.copiesCaseBytes, false);
    assert.doesNotMatch(JSON.stringify(bundle), /operator-redacted-alpha-marker-do-not-copy/);
    assert.equal(bundle.pr50.merge, "5913534f7a850c8346e5f95b912a3eb3777d3517");
    assert.equal(bundle.pr50.bytes, 718948);
    assert.equal(bundle.pr50.sha256, "04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d");

    const { digest, ...unsigned } = bundle;
    assert.equal(digest, bindDigest(unsigned, bundle.caseDigest));
    assert.ok(bundle.jobs.some((job) => job.artifactId === "release-brief"));
    assert.ok(bundle.optionalInputClasses.some((item) => item.id === "vendor-budget-impact"));
    assert.equal(bundle.optionalInputClasses[0].purchaseAuthority, false);
    assert.equal(bundle.optionalInputClasses[0].sold, false);
  });

  it("a case containing an email address is rejected", () => {
    const out = tmpOut();
    const spawned = runCli(
      ["--case", join(TOOL_DIR, "fixtures/invalid/leaky-email.json"), "--out", out],
      { cwd: REPO },
    );
    assert.equal(spawned.status, 1, spawned.stdout);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "private_leak_rejected");
    assert.equal(body.privateLeak, true);
    assert.equal(body.customer_owned, false);
    assert.equal(existsSync(out), false);
  });

  it("library refresh matches the CLI on the customer-owned fixture", () => {
    const result = refreshCase({ casePath: CUSTOMER_CASE });
    assert.equal(result.ok, true);
    assert.equal(result.customer_owned, true);
    assert.equal(result.privateLeak, false);
    assert.equal(result.bundle.freshness, "unknown");
  });
});
