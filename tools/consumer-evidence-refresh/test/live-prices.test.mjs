import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import {
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  PR50_ARCHIVE_BYTES,
  PR50_ARCHIVE_PATH,
  PR50_ARCHIVE_SHA256,
  REPO_ROOT,
} from "../lib/pins.mjs";
import { sha256Bytes } from "../lib/digest.mjs";
import { refreshCase } from "../lib/refresh.mjs";
import { CUSTOMER_CASE, REPO } from "./helpers.mjs";

describe("live SDS prices and homepage stay unchanged", () => {
  it("does not write refresh output onto live price files", () => {
    const dest = join(REPO, "fixtures/buyer-runtimes/catalog.json");
    const before = readFileSync(dest);
    const result = refreshCase({ casePath: CUSTOMER_CASE, outPath: dest });
    assert.equal(result.ok, false);
    assert.equal(result.code, "live_price_mutation_rejected");
    assert.deepEqual(readFileSync(dest), before);
  });

  it("extract remains $0.005 and seller-integrity-audit remains 0.01", () => {
    const catalog = JSON.parse(readFileSync(join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json"), "utf8"));
    assert.equal(String(catalog.route.mcpPriceUsd), LIVE_EXTRACT_PRICE_USDC);
    assert.equal(catalog.contract.priceUsd, 0.005);
    assert.equal(catalog.contract.payTo, LIVE_PAY_TO);

    const mcp = readFileSync(join(REPO_ROOT, "client/src/pages/Mcp.tsx"), "utf8");
    assert.match(mcp, /name: "extract"/);
    assert.match(mcp, /price: "\$0\.005"/);

    const openapi = JSON.parse(
      readFileSync(join(REPO_ROOT, "fixtures/presence/catalog/openapi.json"), "utf8"),
    );
    assert.equal(
      openapi.paths["/commerce/seller-integrity-audit"].get["x-payment-info"].price.amount,
      LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
    );

    const useful = JSON.parse(
      readFileSync(join(REPO_ROOT, "client/public/discovery/useful-jobs.json"), "utf8"),
    );
    assert.equal(useful.purchaseAuthority, false);
    assert.equal(useful.paidHostedClaim, false);

    const buf = readFileSync(PR50_ARCHIVE_PATH);
    assert.equal(buf.length, PR50_ARCHIVE_BYTES);
    assert.equal(sha256Bytes(buf), PR50_ARCHIVE_SHA256);
  });

  it("does not touch Landing or F08 / F14 / Wave 1 F07 directories", () => {
    const diff = spawnSync("git", ["diff", "--name-only", "origin/main"], {
      encoding: "utf8",
      cwd: REPO,
    });
    const names = (diff.stdout || "").trim().split("\n").filter(Boolean);
    assert.ok(!names.some((name) => name.startsWith("client/src/pages/Landing")));
    assert.ok(!names.some((name) => name.startsWith("server/paid-useful-jobs/")));
    assert.ok(!names.some((name) => name.startsWith("packs/outside-operator-journey-harness/")));
    assert.ok(names.every((name) => name.startsWith("tools/consumer-evidence-refresh/") || name === "package.json" || name === ".gitignore"));
  });
});
