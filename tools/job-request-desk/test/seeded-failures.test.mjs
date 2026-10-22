import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ensureUsefulJobsKit } from "../lib/engine.mjs";
import { openDesk } from "../lib/index.mjs";
import { CALLER_AFTER, CALLER_BEFORE, parseJson, runDesk, tempStore } from "./helpers.mjs";

describe("seeded fail-closed cases", { timeout: 120_000 }, () => {
  it("--example cannot become status completed as a sale", () => {
    const store = tempStore("jrd-example-");
    const r = runDesk(["create", "vendor-budget-impact", "--example", "--store", store]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseJson(r.stdout);
    assert.equal(body.sold, false);
    assert.notEqual(body.status, "completed");
    assert.equal(body.status, "sample");
    assert.equal(body.sample, true);
    assert.equal(body.purchaseAuthority, false);
    assert.ok((body.sampleReasons || []).includes("example-flag"));
  });

  it("SAMPLE kit path cannot become status completed as a sale", () => {
    const kit = ensureUsefulJobsKit();
    const store = tempStore("jrd-sample-path-");
    const r = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      join(kit, "samples/pricing/caller-alpha/before.json"),
      "--after",
      join(kit, "samples/pricing/caller-alpha/after.json"),
      "--store",
      store,
    ]);
    const body = parseJson(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.sold, false);
    assert.equal(body.sample, true);
    assert.notEqual(body.status, "completed");
    assert.equal(body.status, "sample");
    assert.ok((body.sampleReasons || []).some((s) => s.includes("kit-samples-path") || s.includes("sibling-marker")));
  });

  it("missing required flag refuses", () => {
    const store = tempStore("jrd-missing-");
    const r = runDesk(["create", "vendor-budget-impact", "--before", CALLER_BEFORE, "--store", store]);
    assert.equal(r.status, 2);
    const body = parseJson(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.code, "missing-required-inputs");
    assert.equal(body.fundingState, "rejected");
  });

  it("unknown job id refuses", () => {
    const store = tempStore("jrd-unknown-");
    const r = runDesk(["create", "not-a-real-job", "--store", store]);
    assert.equal(r.status, 2);
    const body = parseJson(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.code, "unknown-job");
  });

  it("store path escape via requestId refuses", () => {
    const store = tempStore("jrd-escape-");
    const r = runDesk(["status", "--store", store, "--request-id", "../../etc/passwd"]);
    assert.equal(r.status, 2);
    const body = parseJson(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.code, "store-path-escape");
  });

  it("integer termsVersion is rejected (I01 hash contract, not original F01)", () => {
    const store = tempStore("jrd-int-terms-");
    const r = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      CALLER_BEFORE,
      "--after",
      CALLER_AFTER,
      "--store",
      store,
      "--terms-version",
      "1",
    ]);
    assert.equal(r.status, 2);
    const body = parseJson(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.code, "invalid_input");
  });

  it("same orderId must not swap files", () => {
    const store = tempStore("jrd-swap-");
    const first = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      CALLER_BEFORE,
      "--after",
      CALLER_AFTER,
      "--store",
      store,
      "--order-id",
      "order-alpha",
    ]);
    assert.equal(first.status, 0, first.stderr + first.stdout);
    const work = mkdtempSync(join(tmpdir(), "jrd-swap-after-"));
    const otherAfter = join(work, "after.json");
    writeFileSync(
      otherAfter,
      `${JSON.stringify({ label: "caller", rows: [{ field: "other", value: 9, unit: "USD" }] }, null, 2)}\n`,
    );
    const swap = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      CALLER_BEFORE,
      "--after",
      otherAfter,
      "--store",
      store,
      "--order-id",
      "order-alpha",
    ]);
    assert.equal(swap.status, 2);
    const body = parseJson(swap.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.code, "same-order-id-input-swap");
  });

  it("digest mismatch on declared input sha256 refuses", () => {
    const desk = openDesk(tempStore("jrd-digest-"));
    const result = desk.createRequest({
      engineId: "vendor-budget-impact",
      inputs: {
        before: { path: CALLER_BEFORE, sha256: "0".repeat(64) },
        after: CALLER_AFTER,
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.sold, false);
    assert.equal(result.code, "digest-mismatch");
  });
});
