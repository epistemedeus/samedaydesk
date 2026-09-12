import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RECIPE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const MERCHANT_ROOT = process.env.MERCHANT_ROOT || "/tmp/w5-h04/merchant-ca38205";
export const MERCHANT_PIN = "ca38205279f0d543515b81b7261909e55ea2600f";
export const CUSTOMER_X402_ROOT = join(MERCHANT_ROOT, "examples/customer-x402");
export const PATCH_FILES_ROOT = join(RECIPE_ROOT, "patch/files");
export const LIVE_LOCKFILE_URL = "https://agents.samedaydesk.com/lockfile-pin-delta";
export const LIVE_ORIGIN = "https://agents.samedaydesk.com";
