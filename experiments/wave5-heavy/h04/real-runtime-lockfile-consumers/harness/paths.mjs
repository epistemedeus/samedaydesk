import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const MERCHANT_ROOT = process.env.MERCHANT_ROOT || "/tmp/w5-h04/merchant-7aaf004";
export const MERCHANT_PIN = "7aaf00410900dc41fb523d1b7b4469b40ded7981";
export const MERCHANT_VERSION = "1.23.48";
export const LIVE_ORIGIN = "https://agents.samedaydesk.com";
export const LIVE_LOCKFILE_URL = `${LIVE_ORIGIN}/lockfile-pin-delta`;
export const CUSTOMER_X402_ROOT = join(MERCHANT_ROOT, "examples/customer-x402");
export const X402_FETCH_INSTALL = process.env.X402_FETCH_INSTALL || "/tmp/w5-h04/rr-x402fetch-hfAe";
export const AGENTCASH_INSTALL = process.env.AGENTCASH_INSTALL || "/tmp/w5-h04/rr-agentcash-KaZd";
