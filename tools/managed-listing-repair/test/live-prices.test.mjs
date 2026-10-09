import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  KIT_ARCHIVE_BYTES,
  KIT_ARCHIVE_PATH,
  KIT_ARCHIVE_PATH_PUBLIC,
  KIT_ARCHIVE_SHA256,
  KIT_VERSION,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  REPO_ROOT,
  WRITE_BOUNDARY_PREFIX,
} from "../lib/pins.mjs";
import { sha256Bytes } from "../lib/digest.mjs";
import { runManagedListingRepair } from "../lib/repair.mjs";
import { changedPathsVsMain, namedToolPrice, OK_FIXTURE, REPO } from "./helpers.mjs";

describe("live SDS prices, F08, and homepage stay unchanged", () => {
  it("does not write repair output onto live price files", () => {
    const dest = join(REPO, "fixtures/buyer-runtimes/catalog.json");
    const before = readFileSync(dest);
    const result = runManagedListingRepair({ fixturePath: OK_FIXTURE, outPath: dest });
    assert.equal(result.ok, false);
    assert.equal(result.code, "live_price_mutation_rejected");
    assert.deepEqual(readFileSync(dest), before);
  });

  it("binds extract $0.005 and seller-integrity-audit $0.01 to named tools", () => {
    const catalog = JSON.parse(readFileSync(join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json"), "utf8"));
    assert.equal(String(catalog.route.mcpPriceUsd), LIVE_EXTRACT_PRICE_USDC);
    assert.equal(catalog.contract.priceUsd, 0.005);
    assert.equal(catalog.contract.payTo, LIVE_PAY_TO);

    const mcp = readFileSync(join(REPO_ROOT, "client/src/pages/Mcp.tsx"), "utf8");
    assert.equal(namedToolPrice(mcp, "extract"), "$0.005");
    assert.equal(namedToolPrice(mcp, "seller_integrity_audit"), "$0.01");

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
    assert.equal(useful.version, KIT_VERSION);

    const kit = JSON.parse(readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"));
    assert.equal(kit.version, "1.4.7");
    assert.equal(kit.sha256, KIT_ARCHIVE_SHA256);
    assert.equal(kit.bytes, KIT_ARCHIVE_BYTES);
    assert.equal(kit.purchaseAuthority, false);
    assert.equal(kit.jobs.includes("listing-repair-packet"), true);
    assert.equal(kit.inheritedJobIds.includes("listing-repair-packet"), true);

    const buf = readFileSync(KIT_ARCHIVE_PATH);
    assert.equal(buf.length, KIT_ARCHIVE_BYTES);
    assert.equal(sha256Bytes(buf), KIT_ARCHIVE_SHA256);
    assert.equal(KIT_ARCHIVE_SHA256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
    assert.equal(KIT_ARCHIVE_BYTES, 5255824);
    const publicBuf = readFileSync(KIT_ARCHIVE_PATH_PUBLIC);
    assert.equal(publicBuf.length, KIT_ARCHIVE_BYTES);
    assert.equal(sha256Bytes(publicBuf), KIT_ARCHIVE_SHA256);
  });

  it("write boundary is tools/managed-listing-repair only", () => {
    const names = changedPathsVsMain();
    assert.ok(names.length > 0, "expected this tool's files to appear vs origin/main");
    assert.ok(!names.some((name) => name.startsWith("server/paid-useful-jobs/")));
    assert.ok(!names.some((name) => name.startsWith("client/src/pages/Landing")));
    assert.ok(!names.some((name) => name.startsWith("data/bazaar-tracker/")));
    assert.ok(!names.some((name) => name === "package.json" || name === ".gitignore"));
    assert.ok(
      names.every((name) => name.startsWith(WRITE_BOUNDARY_PREFIX)),
      `paths outside write boundary: ${names.filter((name) => !name.startsWith(WRITE_BOUNDARY_PREFIX)).join(", ")}`,
    );

    const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(rootPkg.scripts["test:managed-listing-repair"], undefined);
    const rootIgnore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
    assert.equal(rootIgnore.includes("tools/managed-listing-repair"), false);
  });
});
