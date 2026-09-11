import { isExtractUrl, isSellerIntegrityUrl, paymentHeaderPresent, scanText } from "./inspect.mjs";
import { EXTRACT_EXAMPLE_URL } from "./pins.mjs";

const PAID_RETRY_MARKERS = [
  /payX402 paid retry/i,
  /wrapFetchWithPayment/i,
  /retry_http_request_with_x402/i,
  /Agent402 route-execute/i,
  /facilitator \/?verify/i,
  /facilitator \/?settle/i,
  /paid retry/i,
];

export function refusePaidRetry(wrap = {}) {
  const blob = JSON.stringify(wrap || {});
  const hits = [];
  const target =
    wrap.target || wrap.url || wrap.onUnpaid402?.url || wrap.retry?.url || wrap.extractUrl || null;
  const headers = wrap.headers || wrap.onUnpaid402?.headers || wrap.retry?.headers || {};

  if (wrap.paidRetry === true || wrap.retryWithPayment === true || wrap.onUnpaid402?.retry === true) {
    hits.push("paid-retry");
  }
  if (isExtractUrl(target) || isSellerIntegrityUrl(target)) hits.push("extract-url");
  if (paymentHeaderPresent(headers) || /PAYMENT-SIGNATURE/i.test(blob)) hits.push("payment-header");
  for (const marker of PAID_RETRY_MARKERS) {
    if (marker.test(blob)) {
      hits.push("mustNotRun-marker");
      break;
    }
  }
  if (wrap.wrapUsefulJobs === true && hits.length) hits.push("useful-jobs-paid-wrap");
  if (wrap.engineId === "listing-repair-packet" && (wrap.paidRetry || isExtractUrl(target))) {
    hits.push("useful-jobs-paid-wrap");
  }

  if (hits.length === 0 && wrap && Object.keys(wrap).length) {
    if (String(target || "").includes("agents.samedaydesk.com/extract")) hits.push("extract-url");
  }

  if (hits.length === 0) {
    return {
      ok: false,
      refused: true,
      code: "paid_retry_wrap_refused",
      message: "wrapping useful-jobs with a paid extract/seller-integrity retry is refused",
      hits: ["unrecognized-paid-wrap"],
      purchaseAuthority: false,
      sold: false,
      settled: false,
      target: target || EXTRACT_EXAMPLE_URL,
    };
  }

  return {
    ok: false,
    refused: true,
    code: "paid_retry_wrap_refused",
    message: "wrapping useful-jobs with a paid extract/seller-integrity retry is refused",
    hits: [...new Set(hits)],
    purchaseAuthority: false,
    sold: false,
    settled: false,
    target: target || null,
    scan: scanText(blob),
  };
}
