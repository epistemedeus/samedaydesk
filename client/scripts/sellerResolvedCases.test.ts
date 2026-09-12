import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sellerRepairBriefs } from "../src/data/sellerRepairBriefs.ts";
import {
  findSellerResolvedCase,
  GENTECH_DEFI_RESOLVED_CASE,
  sellerIntegrityAuditInspectUrl,
  sellerResolvedCasePath,
  sellerResolvedCaseUrl,
  sellerResolvedCases,
  SELLER_INTEGRITY_AUDIT_LIVE_PRICE,
} from "../src/data/sellerResolvedCases.ts";

const here = dirname(fileURLToPath(import.meta.url));
const EM_DASH = "\u2014";

function readRepo(rel: string) {
  return readFileSync(join(here, "..", rel), "utf8");
}

test("resolved catalog is disjoint from unpaid repair briefs and checkout IDs", () => {
  const briefIds = new Set(sellerRepairBriefs.map((brief) => brief.id));
  assert.equal(sellerResolvedCases.length, 1);
  for (const item of sellerResolvedCases) {
    assert.equal(briefIds.has(item.id), false);
    assert.equal(item.status, "resolved_diagnostic");
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.equal(item.id.includes("gentech"), true);
  }
  assert.equal(findSellerResolvedCase("gentech-defi-slash-20260912")?.route, "/v1/defi/");
  assert.equal(findSellerResolvedCase("hypernatt-liq-radar-20260830"), null);
  assert.equal(findSellerResolvedCase(null), null);

  const pulse = readRepo("../server/lib/pulse.js");
  const checkout = readRepo("../server/lib/seller-repair-checkout.js");
  const briefs = readRepo("src/data/sellerRepairBriefs.ts");
  for (const source of [pulse, checkout, briefs]) {
    assert.equal(source.includes("gentech-defi-slash-20260912"), false);
    assert.doesNotMatch(source, /api\.gentechlabs\.net/);
  }
});

test("Gentech resolved case is not labeled broken and cites both public comments", () => {
  const item = GENTECH_DEFI_RESOLVED_CASE;
  assert.equal(item.seller, "Gentech Labs");
  assert.equal(item.origin, "https://api.gentechlabs.net");
  assert.equal(item.advertisedUrl, "https://api.gentechlabs.net/v1/defi/");
  assert.equal(item.method, "GET");
  assert.match(item.summary, /resolved diagnostic example/);
  assert.doesNotMatch(item.summary, /currently broken|still broken|fix it again/i);
  const blob = JSON.stringify(item);
  assert.equal(blob.includes(EM_DASH), false);
  assert.match(blob, /not an endorsement/i);
  assert.match(blob, /not a SameDayDesk paid customer/i);
  assert.match(blob, /not current Bazaar ingestion/i);
  assert.match(blob, /not conversion proof/i);
  assert.match(blob, /not by itself proof that a later purchase fails/);
  assert.match(blob, /Diagnostics are not payment execution/);
  assert.equal(
    item.evidence.some((row) => row.href.endsWith("#issuecomment-5639884275")),
    true,
  );
  assert.equal(
    item.evidence.some((row) => row.href.endsWith("#issuecomment-5642014887")),
    true,
  );
  for (const row of item.evidence) {
    assert.match(row.href, /^https:\/\//);
    assert.doesNotMatch(row.href, /localhost|127\.0\.0\.1/);
  }
});

test("credential-free first step consumes the advertised URL without payment headers", () => {
  const item = GENTECH_DEFI_RESOLVED_CASE;
  assert.match(item.firstStep.command, /^curl /);
  assert.match(item.firstStep.command, /--max-redirs 0/);
  assert.match(item.firstStep.command, /https:\/\/api\.gentechlabs\.net\/v1\/defi\//);
  assert.doesNotMatch(item.firstStep.command, /PAYMENT|X-PAYMENT|authorization:/i);
  assert.equal(item.paidFollowOn.livePrice, SELLER_INTEGRITY_AUDIT_LIVE_PRICE);
  assert.equal(item.paidFollowOn.livePrice, "0.01 USDC");
  assert.match(item.paidFollowOn.note, /not a free audit/);
  assert.match(item.paidFollowOn.note, /POST is static-safe/);
  const href = sellerIntegrityAuditInspectUrl({
    origin: item.origin,
    route: item.route,
    method: item.method,
    requireBazaar: false,
  });
  assert.equal(item.paidFollowOn.href, href);
  assert.match(href, /origin=https%3A%2F%2Fapi\.gentechlabs\.net/);
  assert.match(href, /route=%2Fv1%2Fdefi%2F/);
  assert.match(href, /method=GET/);
  assert.match(href, /requireBazaar=false/);
  assert.doesNotMatch(href, /referral=/);
});

test("canonical resolved URL is distinct from finding checkout URLs", () => {
  const id = GENTECH_DEFI_RESOLVED_CASE.id;
  assert.equal(
    sellerResolvedCaseUrl(id),
    "https://samedaydesk.com/x402/seller-conformance/?resolved=gentech-defi-slash-20260912",
  );
  assert.equal(sellerResolvedCasePath(id), "/x402/seller-conformance/?resolved=gentech-defi-slash-20260912");
  assert.equal(sellerResolvedCaseUrl(id).includes("finding="), false);
});

test("SellerConformance presents the resolved case without a repair purchase CTA", () => {
  const source = readRepo("src/pages/SellerConformance.tsx");
  assert.match(source, /findSellerResolvedCase/);
  assert.match(source, /sellerResolvedCases/);
  assert.match(source, /resolved diagnostic/i);
  assert.match(source, /Not a repair sale/);
  assert.match(source, /selectedResolved\.firstStep\.command/);
  assert.match(source, /selectedResolved\.paidFollowOn/);
  assert.doesNotMatch(source, /sellerRepairFixedScopeUrl\(selectedResolved/);
  assert.doesNotMatch(source, /sellerRepairScopeMailto\(selectedResolved/);
  assert.doesNotMatch(source, /requestSellerRepairCheckoutUrl/);
  assert.equal(source.includes(EM_DASH), false);
  assert.match(source, /selectedResolved\.evidence\.map/);
});

test("ForAgents seller section links the resolved case without selling a second fix", () => {
  const source = readRepo("src/pages/ForAgents.tsx");
  assert.match(source, /sellerResolvedCasePath/);
  assert.match(source, /GENTECH_DEFI_RESOLVED_CASE/);
  assert.match(source, /not a repair sale/);
  assert.doesNotMatch(source, /requestSellerRepairCheckoutUrl/);
  assert.equal(source.includes(EM_DASH), false);
  assert.doesNotMatch(source, /PAYMENT-SIGNATURE|X-PAYMENT/);
});
