import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const packageRoot = join(here, "..");
export const repoRoot = join(here, "../../..");
export const teCli = join(repoRoot, "tools/task-bundle-economics/cli.mjs");
export const reuseCli = join(repoRoot, "tools/result-reuse/cli.mjs");
export const feeModule = join(repoRoot, "vendor/hosted-wallet-market/src/fee.mjs");
