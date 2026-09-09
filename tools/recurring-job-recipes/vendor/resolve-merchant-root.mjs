import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sdsRoot = join(packageRoot, "..", "..");
export const MERCHANT_PACKAGE_NAME = "x402-merchant";

export function merchantRootCandidates(env = process.env) {
  return [
    env.MERCHANT_INPUT_ROOT,
    join("/tmp", "merchant-input", "x402-url-extractor"),
    join(sdsRoot, "vendor", "x402-url-extractor"),
    join(sdsRoot, "..", "x402-url-extractor"),
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

export function resolveMerchantRoot(env = process.env) {
  for (const candidate of merchantRootCandidates(env)) {
    if (isMerchantRoot(candidate)) return candidate;
  }
  return null;
}

export function requireMerchantRoot(env = process.env) {
  const root = resolveMerchantRoot(env);
  if (!root) {
    throw new Error(
      "merchant input checkout missing. Need epistemedeus/x402-url-extractor with package.json name x402-merchant. Set MERCHANT_INPUT_ROOT or place the checkout beside samedaydesk. Do not npm-install a remote copy.",
    );
  }
  return root;
}

export function merchantNodeModules(root = requireMerchantRoot()) {
  return join(root, "node_modules");
}

export function createMerchantRequire(root = requireMerchantRoot()) {
  return createRequire(join(root, "package.json"));
}

export function createCustomerExampleRequire(root = requireMerchantRoot()) {
  return createRequire(join(root, "examples/customer-x402/package.json"));
}

export function resolveMerchantPackage(specifier, root = requireMerchantRoot()) {
  return createMerchantRequire(root).resolve(specifier);
}

export function resolveCustomerExamplePackage(specifier, root = requireMerchantRoot()) {
  return createCustomerExampleRequire(root).resolve(specifier);
}
