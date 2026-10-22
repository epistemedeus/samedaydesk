/**
 * Retained HTTP classification for SDS corpus fixtures.
 * hcdn/JS-challenge HTML is not a product 200; unpaid /extract is HTTP 402.
 */
export function header(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : "";
}

export function classifyResponse({ status, headers, body }) {
  const server = header(headers, "server") || "";
  const text = typeof body === "string" ? body : "";
  const challengeHtml =
    /Checking your browser/i.test(text) ||
    /cf-browser-verification|hcdn|just a moment/i.test(text) ||
    /<title>\s*Attention Required/i.test(text);
  if ((status === 403 || status === 503) && (/hcdn/i.test(server) || challengeHtml)) {
    return "cdn_challenge";
  }
  if (challengeHtml && /hcdn|cloudflare/i.test(`${server}\n${text}`)) return "cdn_challenge";
  if (status === 402) return "payment_required";
  if (status >= 200 && status < 400) return "ok";
  return "http_error";
}
