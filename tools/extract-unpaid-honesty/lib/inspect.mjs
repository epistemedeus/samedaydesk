import { FORBIDDEN_HEADER_NAMES } from "./pins.mjs";

const PAYMENT_HEADER = /^(payment-signature|x-payment)$/i;

export function headerMap(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      out[String(key)] = String(value);
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return out;
}

export function parseUrl(url, base = "http://127.0.0.1") {
  const href = String(url || "");
  try {
    return new URL(href);
  } catch {
    try {
      return new URL(href, base);
    } catch {
      return null;
    }
  }
}

export function normalizedPath(pathname) {
  if (!pathname) return "";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function isPaidMerchantPath(pathname) {
  const path = normalizedPath(pathname);
  return (
    path === "/extract" ||
    path === "/extract/batch" ||
    path === "/commerce/seller-integrity-audit"
  );
}

export function isExtractUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return /\/extract(?:\/batch)?(?:\?|$)/.test(String(url || ""));
  return isPaidMerchantPath(parsed.pathname) && parsed.pathname.startsWith("/extract");
}

export function isSellerIntegrityUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return /seller-integrity-audit/.test(String(url || ""));
  return normalizedPath(parsed.pathname) === "/commerce/seller-integrity-audit";
}

export function paymentHeaderPresent(headers) {
  const mapped = headerMap(headers);
  for (const name of Object.keys(mapped)) {
    if (PAYMENT_HEADER.test(name)) return true;
    if (FORBIDDEN_HEADER_NAMES.some((item) => String(mapped[name]).toUpperCase().includes(item))) {
      return true;
    }
  }
  return false;
}

export function inspectRequest({ url, method = "GET", headers } = {}) {
  const reasons = [];
  const parsed = parseUrl(url);
  const href = parsed ? parsed.href : String(url || "");
  const pathname = parsed ? parsed.pathname : "";
  const path = normalizedPath(pathname);

  if (paymentHeaderPresent(headers)) reasons.push("payment-header");
  const blob = JSON.stringify(headerMap(headers));
  if (/PAYMENT-SIGNATURE/i.test(blob) && !reasons.includes("payment-header")) {
    reasons.push("payment-header");
  }

  if (isPaidMerchantPath(pathname) || isPaidMerchantPath(path)) {
    if (path === "/extract/batch" || pathname.startsWith("/extract/")) reasons.push("extract-batch-url");
    else if (path === "/commerce/seller-integrity-audit") reasons.push("seller-integrity-url");
    else reasons.push("extract-url");
  }

  if (/PAYMENT-SIGNATURE/i.test(href) && !reasons.includes("payment-header")) {
    reasons.push("payment-header");
  }

  return {
    method: String(method || "GET").toUpperCase(),
    url: href,
    pathname: path || pathname,
    forbidden: reasons.length > 0,
    reasons,
  };
}

export function scanText(text) {
  const blob = String(text || "");
  const reasons = [];
  if (/PAYMENT-SIGNATURE/i.test(blob) || /X-PAYMENT:/i.test(blob)) reasons.push("payment-header");
  if (/https?:\/\/agents\.samedaydesk\.com\/extract(?:\/batch)?(?:[/?#]|$)/i.test(blob)) {
    reasons.push(/\/extract\/batch/i.test(blob) ? "extract-batch-url" : "extract-url");
  }
  if (/seller-integrity-audit/i.test(blob)) reasons.push("seller-integrity-url");
  return { forbidden: reasons.length > 0, reasons };
}
