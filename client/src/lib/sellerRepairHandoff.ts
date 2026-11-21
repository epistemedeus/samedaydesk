import { findSellerRepairBrief } from "../data/sellerRepairBriefs.ts";

export const SELLER_CONFORMANCE_FIXED_SCOPE_URL =
  "https://neomorphic.io/services/seller-conformance/fixed-scope/";

export function sellerConformanceCheckout(findingId: string | null): string {
  const brief = findSellerRepairBrief(findingId);
  return "/api/checkout/seller-conformance" + (brief ? `?finding=${encodeURIComponent(brief.id)}` : "");
}

export function sellerRepairFixedScopeUrl(findingId: string | null): string {
  const url = new URL(SELLER_CONFORMANCE_FIXED_SCOPE_URL);
  const brief = findSellerRepairBrief(findingId);
  if (brief) url.searchParams.set("finding", brief.id);
  return url.href;
}
