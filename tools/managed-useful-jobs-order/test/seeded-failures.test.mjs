import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStdout, runCli, tmpStore } from "./helpers.mjs";

function refuse(requestRel) {
  const proc = runCli(["create", "--request", requestRel], { store: tmpStore() });
  const body = parseStdout(proc);
  return { proc, body };
}

describe("seeded fail-closed public CLI", { timeout: 60_000 }, () => {
  it("example true as payable is refused (F-SAMPLE)", () => {
    const { proc, body } = refuse("tools/managed-useful-jobs-order/fixtures/orders/example-true.json");
    assert.equal(proc.status, 2, proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.charged, false);
    assert.equal(body.falsifier, "F-SAMPLE");
    assert.equal(body.code, "example-not-payable");
    assert.equal(body.sample, true);
  });

  it("archive sha mismatch is refused (F-PIN)", () => {
    const { proc, body } = refuse("tools/managed-useful-jobs-order/fixtures/orders/sha-mismatch.json");
    assert.equal(proc.status, 2, proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.falsifier, "F-PIN");
    assert.equal(body.code, "f-pin");
    assert.equal(body.sold, false);
  });

  it("omitted orderId is refused (F-ORDER)", () => {
    const { proc, body } = refuse("tools/managed-useful-jobs-order/fixtures/orders/omit-order-id.json");
    assert.equal(proc.status, 2, proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.falsifier, "F-ORDER");
    assert.equal(body.code, "order-id-omitted");
    assert.equal(body.orderId, null);
  });

  it("hitting extract URL is refused (F-EXTRACT)", () => {
    const { proc, body } = refuse("tools/managed-useful-jobs-order/fixtures/orders/extract-url.json");
    assert.equal(proc.status, 2, proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.falsifier, "F-EXTRACT");
    assert.equal(body.code, "f-extract");
    assert.equal(body.sold, false);
    assert.match(String(body.detail?.hit?.value || ""), /extract/);
  });

  it("SAMPLE hashes claimed as customer are refused (F-SAMPLE)", () => {
    const { proc, body } = refuse("tools/managed-useful-jobs-order/fixtures/orders/sample-as-customer.json");
    assert.equal(proc.status, 2, proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.falsifier, "F-SAMPLE");
    assert.equal(body.code, "sample-not-customer");
    assert.equal(body.sample, true);
    assert.ok(body.detail.reasons.some((r) => r.includes("sample-hash-claimed-as-customer") || r.startsWith("sibling-marker:")));
  });
});
