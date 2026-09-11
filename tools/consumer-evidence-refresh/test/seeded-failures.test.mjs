import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { refreshCase } from "../lib/refresh.mjs";
import { scanLeaks } from "../lib/leak-scan.mjs";
import { REPO, TOOL_DIR, tmpOut } from "./helpers.mjs";

describe("seeded fail-closed refusals", () => {
  it("rejects email in the case", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/invalid/leaky-email.json"),
      outPath: tmpOut(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "private_leak_rejected");
    assert.ok(result.detail.hits.some((hit) => hit.id === "email"));
  });

  it("rejects Bearer / token in the case", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/invalid/leaky-token.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "private_leak_rejected");
    const ids = result.detail.hits.map((hit) => hit.id);
    assert.ok(ids.includes("bearer") || ids.includes("token_sk"));
  });

  it("rejects account ids in the case", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/invalid/leaky-account.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "private_leak_rejected");
    assert.ok(result.detail.hits.some((hit) => hit.id === "account_acct"));
  });

  it("rejects SAMPLE labelled customer-owned", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/invalid/sample-as-customer.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "sample_customer_owned_rejected");
    assert.equal(result.customer_owned, false);
  });

  it("rejects --example combined with a customer-owned case", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/customer-owned-redacted.json"),
      example: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "sample_customer_owned_rejected");
  });

  it("--example cannot become customer_owned true", () => {
    const result = refreshCase({ example: true });
    assert.equal(result.ok, true);
    assert.equal(result.sample, true);
    assert.equal(result.customer_owned, false);
    assert.equal(result.bundle.customer_owned, false);
  });

  it("refuses writing the case or refresh to a public catalog path", () => {
    const dest = join(REPO, "client/public/discovery/cer-refresh.json");
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/customer-owned-redacted.json"),
      outPath: dest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "public_catalog_write_rejected");
    assert.equal(existsSync(dest), false);
  });

  it("refuses --publish-case even when the dest is outside the catalog", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/customer-owned-redacted.json"),
      publishCase: join(REPO, "client/public/kit/copied-case.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "public_catalog_write_rejected");
  });

  it("refuses treating refresh as a paid sale or settlement", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/invalid/treated-as-sale.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "paid_sale_rejected");
    assert.equal(result.sold, false);
  });

  it("refuses --sold / --settle flags", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/customer-owned-redacted.json"),
      sold: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "paid_sale_rejected");
  });
});

describe("leak scanner", () => {
  it("accepts the redacted customer case", () => {
    const text = readFileSync(join(TOOL_DIR, "fixtures/customer-owned-redacted.json"), "utf8");
    const scan = scanLeaks(text, { source: "case" });
    assert.equal(scan.ok, true);
    assert.equal(scan.privateLeak, false);
  });

  it("flags email, Bearer, and tokens", () => {
    assert.equal(scanLeaks("owner@example.com").ok, false);
    assert.equal(scanLeaks("Authorization: Bearer abcdef").ok, false);
    assert.equal(scanLeaks("sk_live_abc123456").ok, false);
  });
});
