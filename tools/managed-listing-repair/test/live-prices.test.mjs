import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import {
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  PR51_ARCHIVE_BYTES,
  PR51_ARCHIVE_PATH,
  PR51_ARCHIVE_SHA256,
  REPO_ROOT,
} from "../lib/pins.mjs";
import { sha256Bytes } from "../lib/digest.mjs";
import { runManagedListingRepair } from "../lib/repair.mjs";
import { OK_FIXTURE, REPO } from "./helpers.mjs";

describe("live SDS prices, F08, and homepage stay unchanged", () => {
  it("does not write repair output onto live price files", () => {
    const dest = join(REPO, "fixtures/buyer-runtimes/catalog.json");
    const before = readFileSync(dest);
    const result = runManagedListingRepair({ fixturePath: OK_FIXTURE, outPath: dest });
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
    const extractAt = mcp.indexOf('name: "extract"');
    assert.ok(extractAt >= 0);
    assert.match(mcp.slice(extractAt, extractAt + 80), /price: "\$0\.005"/);
    const sia = mcp.indexOf('name: "seller_integrity_audit"');
    assert.ok(sia >= 0);
    assert.match(mcp.slice(sia, sia + 80), /price: "\$0\.01"/);

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

    const buf = readFileSync(PR51_ARCHIVE_PATH);
    assert.equal(buf.length, PR51_ARCHIVE_BYTES);
    assert.equal(sha256Bytes(buf), PR51_ARCHIVE_SHA256);
  });

  it("does not touch F08, homepage, live catalog, or Bazaar publish", () => {
    const diff = spawnSync("git", ["diff", "--name-only", "origin/main"], {
      encoding: "utf8",
      cwd: REPO,
    });
    const names = (diff.stdout || "").trim().split("\n").filter(Boolean);
    assert.ok(!names.some((name) => name.startsWith("server/paid-useful-jobs/")));
    assert.ok(!names.some((name) => name.startsWith("client/src/pages/Landing")));
    assert.ok(!names.some((name) => name.startsWith("data/bazaar-tracker/")));
    assert.ok(
      names.every(
        (name) =>
          name.startsWith("tools/managed-listing-repair/") ||
          name === "package.json" ||
          name === ".gitignore",
      ),
    );
  });
});
