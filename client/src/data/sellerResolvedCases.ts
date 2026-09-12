export type SellerResolvedCase = Readonly<{
  id: string;
  seller: string;
  origin: string;
  route: string;
  method: "GET" | "POST";
  status: "resolved_diagnostic";
  observedAt: string;
  advertisedUrl: string;
  summary: string;
  facts: readonly string[];
  distinctions: readonly string[];
  firstStep: Readonly<{ label: string; command: string; note: string }>;
  paidFollowOn: Readonly<{
    product: string;
    livePrice: string;
    command: string;
    href: string;
    note: string;
  }>;
  evidence: readonly Readonly<{ label: string; href: string }>[];
}>;

export const SELLER_INTEGRITY_AUDIT_ORIGIN = "https://agents.samedaydesk.com";
export const SELLER_INTEGRITY_AUDIT_PATH = "/commerce/seller-integrity-audit";
export const SELLER_INTEGRITY_AUDIT_LIVE_PRICE = "0.01 USDC";

export function sellerIntegrityAuditInspectUrl(input: {
  origin: string;
  route: string;
  method: "GET" | "POST";
  requireBazaar?: boolean;
  requiredPaths?: readonly string[];
}): string {
  const url = new URL(`${SELLER_INTEGRITY_AUDIT_ORIGIN}${SELLER_INTEGRITY_AUDIT_PATH}`);
  url.searchParams.set("origin", input.origin);
  url.searchParams.set("route", input.route);
  url.searchParams.set("method", input.method);
  url.searchParams.set("requireBazaar", input.requireBazaar ? "true" : "false");
  if (input.requiredPaths?.length) {
    url.searchParams.set("requiredPaths", input.requiredPaths.join(","));
  }
  return url.toString();
}

const GENTECH_ORIGIN = "https://api.gentechlabs.net";
const GENTECH_ROUTE = "/v1/defi/";
const GENTECH_ADVERTISED_URL = `${GENTECH_ORIGIN}${GENTECH_ROUTE}`;
const GENTECH_AUDIT_HREF = sellerIntegrityAuditInspectUrl({
  origin: GENTECH_ORIGIN,
  route: GENTECH_ROUTE,
  method: "GET",
  requireBazaar: false,
});

export const sellerResolvedCases = Object.freeze([
  {
    id: "gentech-defi-slash-20260912",
    seller: "Gentech Labs",
    origin: GENTECH_ORIGIN,
    route: GENTECH_ROUTE,
    method: "GET",
    status: "resolved_diagnostic",
    observedAt: "2026-09-12",
    advertisedUrl: GENTECH_ADVERTISED_URL,
    summary:
      "Gentech Labs repaired the DeFi unpaid challenge so GET /v1/defi and GET /v1/defi/ both return HTTP 402 and advertise the slash URL. This is a resolved diagnostic example, not a current defect and not a paid repair lead.",
    facts: [
      "Maintainer confirmed the previous 307-plus-no-slash advertisement and the live fix.",
      "After the fix, both slash forms return unpaid HTTP 402 with resource.url https://api.gentechlabs.net/v1/defi/.",
      "Clients should request that advertised slash URL. A slash-only difference is a canonical alias, not a current product bug.",
      "An exact-resource mismatch is a diagnostic. It is not by itself proof that a later purchase fails: use the advertised canonical URL, and treat a redirect as a cue to request the challenging route.",
    ],
    distinctions: [
      "Unpaid 402 inspection is a diagnostic. Payment execution is a later, separate step.",
      "This case is resolved. SameDayDesk does not sell another fix of this route.",
      "Not an endorsement, not a SameDayDesk paid customer, not current Bazaar ingestion, and not conversion proof.",
      "Public examples do not send payment headers and do not follow private destinations.",
    ],
    firstStep: {
      label: "Credential-free first step (no wallet)",
      command:
        "curl -sS -D- --max-redirs 0 -o /tmp/gentech-defi-402.json 'https://api.gentechlabs.net/v1/defi/'",
      note:
        "Expect HTTP 402. Compare resource.url to the URL you requested. Diagnostics are not payment execution.",
    },
    paidFollowOn: {
      product: "GET /commerce/seller-integrity-audit",
      livePrice: SELLER_INTEGRITY_AUDIT_LIVE_PRICE,
      href: GENTECH_AUDIT_HREF,
      command: `curl -sS -D- --max-redirs 0 -o /tmp/sds-seller-integrity-402.json '${GENTECH_AUDIT_HREF}'`,
      note:
        "Existing SameDayDesk seller-integrity-audit. Live price 0.01 USDC. Unpaid GET returns 402 terms and accepts origin, route, and method without a wallet. Paying executes the audit. GET verifies live unpaid terms; POST is static-safe and sends no target request. This is not a free audit.",
    },
    evidence: [
      { label: "Live unpaid 402 canonical URL", href: GENTECH_ADVERTISED_URL },
      { label: "Public x402 well-known", href: "https://api.gentechlabs.net/.well-known/x402.json" },
      {
        label: "Maintainer repair comment",
        href: "https://github.com/coinbase/cdp-sdk/issues/764#issuecomment-5639884275",
      },
      {
        label: "SameDayDesk readback comment",
        href: "https://github.com/coinbase/cdp-sdk/issues/764#issuecomment-5642014887",
      },
    ],
  },
] satisfies readonly SellerResolvedCase[]);

const casesById = new Map(sellerResolvedCases.map((item) => [item.id, item]));

export function findSellerResolvedCase(id: string | null): SellerResolvedCase | null {
  if (!id) return null;
  return casesById.get(id) ?? null;
}

export function sellerResolvedCasePath(id: string): string {
  return `/x402/seller-conformance/?resolved=${encodeURIComponent(id)}`;
}

export function sellerResolvedCaseUrl(id: string): string {
  return `https://samedaydesk.com${sellerResolvedCasePath(id)}`;
}

export const GENTECH_DEFI_RESOLVED_CASE = sellerResolvedCases[0];
