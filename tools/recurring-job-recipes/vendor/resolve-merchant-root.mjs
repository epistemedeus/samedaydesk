import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MERCHANT_PACKAGE_NAME = "x402-merchant";

export function merchantRootCandidates() {
  return [
    process.env.MERCHANT_INPUT_ROOT,
    join("/tmp", "merchant-input", "x402-url-extractor"),
    join(packageRoot, "..", "..", "vendor", "x402-url-extractor"),
    join(packageRoot, "..", "..", "..", "x402-url-extractor"),
  ].filter(Boolean);
}

export function isMerchantRoot(candidate) {
  if (!candidate) return false;
  const pageChange = join(candidate, "page-change-http.mjs");
  const customer = join(candidate, "examples/customer-x402/package.json");
  const pkgPath = join(candidate, "package.json");
  if (!existsSync(pageChange) || !existsSync(customer) || !existsSync(pkgPath)) {
    return false;
  }
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")).name === MERCHANT_PACKAGE_NAME;
  } catch {
    return false;
  }
}

export function resolveMerchantRoot() {
  for (const candidate of merchantRootCandidates()) {
    if (isMerchantRoot(candidate)) return candidate;
  }
  return null;
}

export function requireMerchantRoot() {
  const root = resolveMerchantRoot();
  if (!root) {
    throw new Error(
      "merchant input checkout missing. Need epistemedeus/x402-url-extractor with package.json name x402-merchant. Set MERCHANT_INPUT_ROOT or place the checkout beside samedaydesk.",
    );
  }
  return root;
}
