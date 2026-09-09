import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const CANDIDATES = [
  process.env.MERCHANT_INPUT_ROOT,
  join("/tmp", "merchant-input", "x402-url-extractor"),
  join(packageRoot, "..", "..", "vendor", "x402-url-extractor"),
].filter(Boolean);

export function resolveMerchantRoot() {
  for (const candidate of CANDIDATES) {
    const pageChange = join(candidate, "page-change-http.mjs");
    const customer = join(candidate, "examples/customer-x402/package.json");
    if (existsSync(pageChange) && existsSync(customer)) {
      return candidate;
    }
  }
  return null;
}

export function requireMerchantRoot() {
  const root = resolveMerchantRoot();
  if (!root) {
    throw new Error(
      "merchant input checkout missing. Clone epistemedeus/x402-url-extractor at f9dd59ae and set MERCHANT_INPUT_ROOT.",
    );
  }
  return root;
}
